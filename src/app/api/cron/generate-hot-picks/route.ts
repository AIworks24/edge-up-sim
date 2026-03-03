// src/app/api/cron/generate-hot-picks/route.ts
//
// FIXES vs original guide:
//   1. Table: ai_predictions (NOT predictions — that table doesn't exist)
//   2. Filter uses is_daily_pick column (added by migration to ai_predictions)
//   3. auth check on CRON_SECRET header
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getTodaysGames }            from '@/lib/sportradar/games'
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

  // Phase 1: CBB only. Phase 2: add 'nfl'. Phase 3: add 'nba'.
  const activeSports = ['ncaab'] as const

  const allResults: any[] = []
  const errors:    string[] = []

  for (const sport of activeSports) {
    console.log(`[HOT PICKS] Processing ${sport}...`)

    let games = await getTodaysGames(sport)
    if (games.length === 0) {
      console.log(`[HOT PICKS] No ${sport} games today`)
      continue
    }

    games = await attachOddsToGames(games, sport)

    // Only games starting 2+ hours from now that have odds
    const now = new Date()
    const eligibleGames = games.filter(g => {
      const gameTime = new Date(g.commence_time)
      return (
        gameTime.getTime() > now.getTime() + 2 * 60 * 60 * 1000
        && g.spread_home !== null
        && g.total       !== null
      )
    })

    console.log(`[HOT PICKS] ${sport}: ${eligibleGames.length} eligible games`)

    for (const game of eligibleGames) {
      try {
        const sim = await runGameSimulation({
          event_id:        game.id,
          home_team:       game.home_team,
          away_team:       game.away_team,
          home_team_sr_id: game.home_team_id,
          away_team_sr_id: game.away_team_id,
          sport,
          spread_home:     game.spread_home   ?? -3,
          total:           game.total         ?? 140,
          odds_spread:     game.spread_home_odds ?? -110,
          odds_total:      game.total_over_odds  ?? -110,
          odds_ml_home:    game.moneyline_home   ?? -150,
          odds_ml_away:    game.moneyline_away   ?? 130,
          neutral_site:    game.neutral_site,
          game_time:       game.commence_time,
          is_hot_pick:     true,
        })

        allResults.push({
          prediction_id:  sim.prediction_id,
          game:           `${game.away_team} @ ${game.home_team}`,
          sport,
          edge_up_score:  sim.edge_up_score,
          edge_tier:      sim.edge_tier,
          recommendation: sim.recommendation,
          bet_side:       sim.bet_side,
        })

        await new Promise(r => setTimeout(r, 1100))  // SR rate limit
      } catch (err: any) {
        errors.push(`${game.home_team} vs ${game.away_team}: ${err.message}`)
      }
    }
  }

  // Top 5 qualifying picks sorted by edge score
  const qualifiedPicks = allResults
    .filter(r => r.recommendation === 'BET' && r.edge_up_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE)
    .sort((a, b) => b.edge_up_score - a.edge_up_score)
    .slice(0, 5)

  // Mark picks in ai_predictions table (FIX: not predictions)
  if (qualifiedPicks.length > 0) {
    const today = new Date().toISOString().split('T')[0]

    // Clear today's existing picks
    await supabaseAdmin
      .from('ai_predictions')    // ← FIX: your actual table name
      .update({ is_daily_pick: false, daily_pick_rank: null })
      .eq('is_daily_pick', true)
      .gte('created_at', `${today}T00:00:00.000Z`)

    // Set new picks
    for (let i = 0; i < qualifiedPicks.length; i++) {
      await supabaseAdmin
        .from('ai_predictions')
        .update({ is_daily_pick: true, daily_pick_rank: i + 1 })
        .eq('id', qualifiedPicks[i].prediction_id)
    }
  }

  console.log(`[HOT PICKS] Complete: ${qualifiedPicks.length} picks selected, ${errors.length} errors`)

  return NextResponse.json({
    success:          true,
    games_processed:  allResults.length,
    picks_qualified:  qualifiedPicks.length,
    top_picks:        qualifiedPicks,
    errors,
  })
}