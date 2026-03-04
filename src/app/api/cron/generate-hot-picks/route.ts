// src/app/api/cron/generate-hot-picks/route.ts
//
// KEY CHANGES from previous version:
//   1. Uses getUpcomingGames(sport, 2) instead of getTodaysGames()
//      → Fetches today + tomorrow so the 6am UTC cron always has games to work with
//      → Games from tomorrow are still valid "today's hot picks" since they're
//        the next upcoming games — they have NOT been played yet (no past picks)
//   2. Eligibility filter: game must be in the future (not necessarily 2hr window)
//      and have odds. The 2hr buffer was silently eliminating all games at 6am UTC
//      when games tip off at 7–11pm ET (13–17hrs away, well past 2hr buffer —
//      those DO pass). But on days with only early-afternoon games it was a problem.
//   3. Threshold fallback: if no picks pass MIN_EDGE_SCORE, we pick the top 3
//      highest edge-score games anyway, marked with edge_tier so users see real
//      data rather than an empty section.
//   4. Preserves today-only semantics: we still tag is_daily_pick = true and
//      clear yesterday's picks, so hot-picks/route.ts today filter works correctly.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingGames }          from '@/lib/sportradar/games'
import { attachOddsToGames }         from '@/lib/sportradar/odds'
import { runGameSimulation }         from '@/lib/ai/claude-agent'
import { supabaseAdmin }             from '@/lib/database/supabase-admin'
import { RECOMMENDATION_THRESHOLD }  from '@/lib/ai/edge-classifier'

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Phase 1: NCAAB only. Phase 2: add 'nba'. Phase 3: add 'nfl'.
  const activeSports = ['ncaab'] as const

  const allResults: any[] = []
  const errors:    string[] = []

  for (const sport of activeSports) {
    console.log(`[HOT PICKS] Processing ${sport}...`)

    // FIX: getUpcomingGames(sport, 2) = today + tomorrow
    // This ensures the 6am UTC cron always has games to evaluate even if today's
    // schedule hasn't fully propagated to SportRadar yet.
    let games = await getUpcomingGames(sport, 2)

    if (games.length === 0) {
      console.log(`[HOT PICKS] No upcoming ${sport} games in next 2 days`)
      continue
    }

    games = await attachOddsToGames(games, sport)

    const now = new Date()

    // Eligibility: game must be in the future AND have odds data
    // Removed the hard 2-hour buffer that was silently excluding all games
    // when the cron runs at 6am UTC (games tip at 7pm–11pm ET = fine either way,
    // but edge cases like noon games on days with early tip times were excluded)
    const eligibleGames = games.filter(g => {
      const gameTime = new Date(g.commence_time)
      return (
        gameTime.getTime() > now.getTime()  // strictly future
        && g.spread_home !== null
        && g.total       !== null
      )
    })

    console.log(`[HOT PICKS] ${sport}: ${eligibleGames.length} eligible games (of ${games.length} fetched)`)

    for (const game of eligibleGames) {
      try {
        const sim = await runGameSimulation({
          event_id:        game.id,
          home_team:       game.home_team,
          away_team:       game.away_team,
          home_team_sr_id: game.home_team_id,
          away_team_sr_id: game.away_team_id,
          sport,
          spread_home:     game.spread_home      ?? -3,
          total:           game.total            ?? 140,
          odds_spread:     game.spread_home_odds ?? -110,
          odds_total:      game.total_over_odds  ?? -110,
          odds_ml_home:    game.moneyline_home   ?? -150,
          odds_ml_away:    game.moneyline_away   ?? 130,
          neutral_site:    game.neutral_site,
          game_time:       game.commence_time,
          is_hot_pick:     true,
        })

        allResults.push({
          prediction_id:     sim.prediction_id,
          game:              `${game.away_team} @ ${game.home_team}`,
          sport,
          edge_up_score:     sim.edge_up_score,
          edge_tier:         sim.edge_tier,
          recommendation:    sim.recommendation,
          top_pick_label:    sim.top_pick?.label        ?? 'N/A',
          top_pick_category: sim.top_pick?.bet_category ?? 'spread',
          top_pick_edge:     sim.top_pick?.edge_pct     ?? 0,
        })

        await new Promise(r => setTimeout(r, 1100))  // SR rate limit (1 req/sec)
      } catch (err: any) {
        errors.push(`${game.home_team} vs ${game.away_team}: ${err.message}`)
      }
    }
  }

  // ── Select top picks ───────────────────────────────────────────────────────
  // Primary: picks that pass the BET threshold sorted by edge score
  let qualifiedPicks = allResults
    .filter(r => r.recommendation === 'BET' && r.edge_up_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE)
    .sort((a, b) => b.edge_up_score - a.edge_up_score)
    .slice(0, 5)

  // FIX — Fallback: if the threshold filter produces 0 results (e.g. a slow
  // game day where nothing clears MIN_EDGE_SCORE), still surface the top 3
  // highest-edge predictions so the dashboard never shows empty.
  // These will display with their true edge_tier (MODERATE / RISKY) so users
  // see accurate data — we don't inflate or misrepresent them.
  if (qualifiedPicks.length === 0 && allResults.length > 0) {
    console.log(`[HOT PICKS] No picks cleared threshold — using top-3 fallback`)
    qualifiedPicks = allResults
      .sort((a, b) => b.edge_up_score - a.edge_up_score)
      .slice(0, 3)
  }

  // ── Write to database ──────────────────────────────────────────────────────
  if (qualifiedPicks.length > 0) {
    const today = new Date().toISOString().split('T')[0]

    // Clear ALL existing daily picks (not just today's) to avoid stale rows
    await supabaseAdmin
      .from('ai_predictions')
      .update({ is_daily_pick: false, daily_pick_rank: null })
      .eq('is_daily_pick', true)

    // Mark today's top picks
    for (let i = 0; i < qualifiedPicks.length; i++) {
      await supabaseAdmin
        .from('ai_predictions')
        .update({ is_daily_pick: true, daily_pick_rank: i + 1 })
        .eq('id', qualifiedPicks[i].prediction_id)
    }
  }

  console.log(`[HOT PICKS] Complete: ${qualifiedPicks.length} picks selected from ${allResults.length} simulated, ${errors.length} errors`)

  return NextResponse.json({
    success:         true,
    games_processed: allResults.length,
    picks_qualified: qualifiedPicks.length,
    top_picks:       qualifiedPicks,
    errors,
  })
}