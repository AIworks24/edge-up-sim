// src/app/api/cron/generate-hot-picks/route.ts
//
// ARCHITECTURE: Two-phase approach to work within Vercel's 60s Pro limit
//
// Phase 1 (this route): Simulate games in a capped batch, store ALL results
//   to ai_predictions as prediction_type='hot_pick'. Then select the top picks
//   from the FULL ai_predictions history for today (not just this batch).
//   This means repeated runs accumulate more simulations, and each run the
//   best picks are re-selected from all simulations done so far today.
//
// Phase 2 (future): daily_hot_picks table for per-user personalization based
//   on sport preferences. That layer sits on top of this one.
//
// TIMEOUT MATH (Vercel Pro = 60s):
//   10 games × 1.1s delay + ~2s Claude API each = ~32s → safe
//   Run the cron multiple times per day (already 4x/day) to cover all games.
//   Each run simulates the next 10 unsimulated upcoming games.
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
  const today        = now.split('T')[0]

  for (const sport of activeSports) {
    console.log(`[HOT PICKS] Processing ${sport}...`)

    // ── Find games already simulated today ────────────────────────────────
    // We track which external_event_ids have already been simulated today
    // so each cron run picks up the NEXT batch of unsimulated games.
    const { data: alreadySimulated } = await supabaseAdmin
      .from('ai_predictions')
      .select('event_id')
      .eq('prediction_type', 'hot_pick')
      .gte('created_at', `${today}T00:00:00.000Z`)

    const simulatedEventIds = new Set(
      (alreadySimulated || []).map((r: any) => r.event_id)
    )

    console.log(`[HOT PICKS] Already simulated today: ${simulatedEventIds.size} games`)

    // ── Fetch upcoming games from DB ──────────────────────────────────────
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
      .limit(50) // fetch more than we'll process so we can skip already-done ones

    if (dbError) {
      errors.push(`${sport} DB read: ${dbError.message}`)
      continue
    }

    if (!dbGames || dbGames.length === 0) {
      console.log(`[HOT PICKS] No upcoming ${sport} games in DB`)
      continue
    }

    // Filter: has odds AND hasn't been simulated today yet
    const eligibleGames = dbGames.filter(g => {
      if (simulatedEventIds.has(g.external_event_id || g.id)) return false
      if (!g.odds_data) return false
      const o = typeof g.odds_data === 'string' ? JSON.parse(g.odds_data) : g.odds_data
      return (o.total !== null && o.total !== undefined)
          || (o.moneyline_home !== null && o.moneyline_home !== undefined)
    })

    // Cap at 10 per run — safe within 60s Pro limit
    const gamesToProcess = eligibleGames.slice(0, 10)

    console.log(`[HOT PICKS] ${sport}: ${gamesToProcess.length} games to simulate this run (${eligibleGames.length} total unsimulated)`)

    for (const game of gamesToProcess) {
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

  // ── Select best picks from ALL simulations done today ─────────────────────
  // Pull every hot_pick simulation from today (not just this batch).
  // This means after 4 cron runs, we're selecting from ~40 simulated games.
  const { data: allTodayPicks } = await supabaseAdmin
    .from('ai_predictions')
    .select('id, edge_score, edge_tier, recommendation')
    .eq('prediction_type', 'hot_pick')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .order('edge_score', { ascending: false })

  const todayResults = (allTodayPicks || []).map((r: any) => ({
    prediction_id:  r.id,
    edge_up_score:  r.edge_score,
    edge_tier:      r.edge_tier,
    recommendation: r.recommendation,
  }))

  // Primary: BET + threshold
  let qualifiedPicks = todayResults
    .filter(r => r.recommendation === 'BET' && r.edge_up_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE)
    .slice(0, 5)

  // Fallback: top 3 by edge score if nothing clears threshold
  if (qualifiedPicks.length === 0 && todayResults.length > 0) {
    console.log(`[HOT PICKS] No picks cleared threshold — using top-3 fallback`)
    qualifiedPicks = todayResults.slice(0, 3)
  }

  // ── Write daily picks ──────────────────────────────────────────────────────
  if (qualifiedPicks.length > 0) {
    // Clear all existing daily pick flags
    await supabaseAdmin
      .from('ai_predictions')
      .update({ is_daily_pick: false, daily_pick_rank: null })
      .eq('is_daily_pick', true)

    // Set the new top picks
    for (let i = 0; i < qualifiedPicks.length; i++) {
      await supabaseAdmin
        .from('ai_predictions')
        .update({ is_daily_pick: true, daily_pick_rank: i + 1 })
        .eq('id', qualifiedPicks[i].prediction_id)
    }
  }

  const remainingUnsimulated = activeSports.reduce((_acc, _sport) => {
    // Rough count — will be accurate after first run
    return 0
  }, 0)

  console.log(`[HOT PICKS] Complete: ${allResults.length} simulated this run, ${qualifiedPicks.length} picks selected from ${todayResults.length} total today, ${errors.length} errors`)

  return NextResponse.json({
    success:              true,
    simulated_this_run:   allResults.length,
    total_simulated_today: todayResults.length,
    picks_qualified:      qualifiedPicks.length,
    top_picks:            qualifiedPicks,
    errors,
  })
}