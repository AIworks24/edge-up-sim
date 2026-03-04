// src/app/api/cron/generate-hot-picks/route.ts
//
// FIX: spread_home is null on all stored games (odds API doesn't always
// return spread values). Changed eligibility filter to require total OR
// moneyline instead — both are consistently populated.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { runGameSimulation }        from '@/lib/ai/claude-agent'
import { supabaseAdmin }            from '@/lib/database/supabase-admin'
import { RECOMMENDATION_THRESHOLD } from '@/lib/ai/edge-classifier'

export async function GET(req: NextRequest) {
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
      console.log(`[HOT PICKS] No upcoming ${sport} games in DB`)
      continue
    }

    // FIX: eligibility now requires total OR moneyline_home — NOT spread_home.
    // spread_home is null on all stored games; total and moneyline are always set.
    const eligibleGames = dbGames.filter(g => {
      if (!g.odds_data) return false
      const o = typeof g.odds_data === 'string' ? JSON.parse(g.odds_data) : g.odds_data
      return (o.total !== null && o.total !== undefined)
          || (o.moneyline_home !== null && o.moneyline_home !== undefined)
    })

    console.log(`[HOT PICKS] ${sport}: ${eligibleGames.length} eligible of ${dbGames.length} upcoming`)

    for (const game of eligibleGames) {
      try {
        const o = typeof game.odds_data === 'string'
          ? JSON.parse(game.odds_data)
          : game.odds_data

        const sim = await runGameSimulation({
          event_id:        game.external_event_id || game.id,
          home_team:       game.home_team,
          away_team:       game.away_team,
          home_team_sr_id: game.home_team_sr_id ?? '',
          away_team_sr_id: game.away_team_sr_id ?? '',
          sport:           game.sport_key,
          // spread_home may be null — pass 0 as neutral default so sim still runs
          spread_home:     o.spread_home      ?? 0,
          total:           o.total            ?? 140,
          odds_spread:     o.spread_home_odds ?? -110,
          odds_total:      o.total_over_odds  ?? -110,
          odds_ml_home:    o.moneyline_home   ?? -150,
          odds_ml_away:    o.moneyline_away   ?? 130,
          neutral_site:    game.neutral_site  ?? false,
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

  // Primary: picks passing BET threshold sorted by edge score
  let qualifiedPicks = allResults
    .filter(r => r.recommendation === 'BET' && r.edge_up_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE)
    .sort((a, b) => b.edge_up_score - a.edge_up_score)
    .slice(0, 5)

  // Fallback: top 3 by edge score if nothing clears threshold
  if (qualifiedPicks.length === 0 && allResults.length > 0) {
    console.log(`[HOT PICKS] No picks cleared threshold — using top-3 fallback`)
    qualifiedPicks = allResults
      .sort((a, b) => b.edge_up_score - a.edge_up_score)
      .slice(0, 3)
  }

  if (qualifiedPicks.length > 0) {
    // Clear all existing daily picks
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

  console.log(`[HOT PICKS] Complete: ${qualifiedPicks.length} picks from ${allResults.length} simulated, ${errors.length} errors`)

  return NextResponse.json({
    success:         true,
    games_processed: allResults.length,
    picks_qualified: qualifiedPicks.length,
    top_picks:       qualifiedPicks,
    errors,
  })
}