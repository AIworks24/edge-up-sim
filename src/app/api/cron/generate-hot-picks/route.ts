// src/app/api/cron/generate-hot-picks/route.ts
//
// ROOT CAUSE FIX:
//   The previous version called getUpcomingGames() live from SportRadar at
//   runtime. By the time the cron runs (6am UTC) or when triggered manually
//   in the evening, many games have status 'inprogress' or 'closed'.
//   getUpcomingGames() filters for status === 'scheduled' || 'time-tbd' only,
//   so it returns 0 games even though 121 games exist in the database.
//
//   FIX: Read games directly from the sports_events table (already populated
//   by the fetch-events cron / trigger-fetch). Filter to games that:
//     1. Have not started yet (commence_time > now)
//     2. Have odds in their odds_data JSON
//     3. Are NCAAB (sport_key = 'ncaab')
//
//   This decouples the hot-picks generator from SportRadar's live status field
//   and uses the 30 games-with-odds already sitting in the database.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { runGameSimulation }        from '@/lib/ai/claude-agent'
import { supabaseAdmin }            from '@/lib/database/supabase-admin'
import { RECOMMENDATION_THRESHOLD } from '@/lib/ai/edge-classifier'

export async function GET(req: NextRequest) {
  // Accept auth via Authorization header OR ?secret= query param
  const authHeader  = req.headers.get('authorization')
  const querySecret = new URL(req.url).searchParams.get('secret')
  const provided    = authHeader?.replace('Bearer ', '') || querySecret

  if (provided !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — pass ?secret=YOUR_CRON_SECRET or Authorization: Bearer header' },
      { status: 401 }
    )
  }

  const activeSports = ['ncaab']
  const allResults:  any[] = []
  const errors:      string[] = []
  const now          = new Date().toISOString()

  for (const sport of activeSports) {
    console.log(`[HOT PICKS] Processing ${sport} from DB...`)

    // ── Read eligible games from sports_events table ────────────────────────
    // These were already fetched + stored by trigger-fetch / fetch-events cron.
    // We filter to games that haven't started yet and have odds.
    const { data: dbGames, error: dbError } = await supabaseAdmin
      .from('sports_events')
      .select(`
        id,
        external_event_id,
        home_team,
        away_team,
        commence_time,
        odds_data,
        home_team_sr_id,
        away_team_sr_id,
        neutral_site,
        sport_key
      `)
      .eq('sport_key', sport)
      .gt('commence_time', now)
      .not('odds_data', 'is', null)
      .order('commence_time', { ascending: true })
      .limit(20)

    if (dbError) {
      console.error(`[HOT PICKS] DB error for ${sport}:`, dbError.message)
      errors.push(`${sport} DB read: ${dbError.message}`)
      continue
    }

    if (!dbGames || dbGames.length === 0) {
      console.log(`[HOT PICKS] No upcoming ${sport} games in DB with odds`)
      continue
    }

    // Filter to games that actually have spread + total in odds_data
    const eligibleGames = dbGames.filter(g => {
      const o = g.odds_data
      if (!o) return false
      const odds = typeof o === 'string' ? JSON.parse(o) : o
      return odds.spread_home !== null && odds.spread_home !== undefined
          && odds.total       !== null && odds.total       !== undefined
    })

    console.log(`[HOT PICKS] ${sport}: ${eligibleGames.length} eligible games (of ${dbGames.length} upcoming with odds)`)

    for (const game of eligibleGames) {
      try {
        const odds = typeof game.odds_data === 'string'
          ? JSON.parse(game.odds_data)
          : game.odds_data

        const sim = await runGameSimulation({
          event_id:        game.external_event_id || game.id,
          home_team:       game.home_team,
          away_team:       game.away_team,
          home_team_sr_id: game.home_team_sr_id ?? '',
          away_team_sr_id: game.away_team_sr_id ?? '',
          sport:           game.sport_key,
          spread_home:     odds.spread_home      ?? -3,
          total:           odds.total            ?? 140,
          odds_spread:     odds.spread_home_odds ?? -110,
          odds_total:      odds.total_over_odds  ?? -110,
          odds_ml_home:    odds.moneyline_home   ?? -150,
          odds_ml_away:    odds.moneyline_away   ?? 130,
          neutral_site:    game.neutral_site     ?? false,
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

        await new Promise(r => setTimeout(r, 1100))
      } catch (err: any) {
        errors.push(`${game.home_team} vs ${game.away_team}: ${err.message}`)
      }
    }
  }

  // ── Select top picks ───────────────────────────────────────────────────────
  let qualifiedPicks = allResults
    .filter(r => r.recommendation === 'BET' && r.edge_up_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE)
    .sort((a, b) => b.edge_up_score - a.edge_up_score)
    .slice(0, 5)

  // Fallback: surface top 3 by edge score if nothing clears threshold
  if (qualifiedPicks.length === 0 && allResults.length > 0) {
    console.log(`[HOT PICKS] No picks cleared threshold — using top-3 fallback`)
    qualifiedPicks = allResults
      .sort((a, b) => b.edge_up_score - a.edge_up_score)
      .slice(0, 3)
  }

  // ── Write to database ──────────────────────────────────────────────────────
  if (qualifiedPicks.length > 0) {
    await supabaseAdmin
      .from('ai_predictions')
      .update({ is_daily_pick: false, daily_pick_rank: null })
      .eq('is_daily_pick', true)

    for (let i = 0; i < qualifiedPicks.length; i++) {
      await supabaseAdmin
        .from('ai_predictions')
        .update({ is_daily_pick: true, daily_pick_rank: i + 1 })
        .eq('id', qualifiedPicks[i].prediction_id)
    }
  }

  console.log(`[HOT PICKS] Complete: ${qualifiedPicks.length} picks from ${allResults.length} simulated, ${errors.length} errors`)

  return NextResponse.json({
    success:         true,
    games_processed: allResults.length,
    picks_qualified: qualifiedPicks.length,
    top_picks:       qualifiedPicks,
    errors,
  })
}