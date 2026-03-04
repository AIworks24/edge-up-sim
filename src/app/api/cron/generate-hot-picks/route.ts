// src/app/api/cron/generate-hot-picks/route.ts
//
// HOW THIS WORKS:
//   Does NOT run any simulations itself. Instead reads ai_predictions rows
//   that were already stored by user simulations today, ranks them by
//   edge_score, and marks the top 5 as is_daily_pick = true.
//
//   This means:
//   - Hot Picks are always powered by the real full simulation engine
//   - No separate simulation step needed in this cron
//   - The more users simulate, the richer the hot picks pool becomes
//   - Also includes any hot_pick type rows stored by other means
//
//   The cron runs 4x/day. Each run re-evaluates and updates picks as
//   new simulations come in throughout the day.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  const authHeader  = req.headers.get('authorization')
  const querySecret = new URL(req.url).searchParams.get('secret')
  const provided    = authHeader?.replace('Bearer ', '') || querySecret

  if (provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now   = new Date().toISOString()
  const today = now.split('T')[0]

  // ── 1. Pull all simulations created today ─────────────────────────────────
  const { data: todaySims, error } = await supabaseAdmin
    .from('ai_predictions')
    .select('id, edge_score, edge_tier, recommendation, game_time, home_team, away_team, sport, confidence_score, prediction_type')
    .gte('created_at', `${today}T00:00:00.000Z`)
    .not('edge_score', 'is', null)
    .order('edge_score', { ascending: false })

  if (error) {
    return NextResponse.json({ error: `DB read failed: ${error.message}` }, { status: 500 })
  }

  if (!todaySims || todaySims.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No simulations stored today yet.',
      picks_selected: 0,
      top_picks: [],
    })
  }

  // ── 2. Filter to games that haven't started yet ───────────────────────────
  const futureSims = todaySims.filter(s => {
    if (!s.game_time) return true
    return new Date(s.game_time) > new Date(now)
  })

  console.log(`[HOT PICKS] ${todaySims.length} total sims today, ${futureSims.length} for future games`)

  if (futureSims.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'All simulations today are for games that have already started or finished.',
      picks_selected: 0,
      top_picks: [],
    })
  }

  // ── 3. Pick the best — prefer BET recommendation, highest edge score ───────
  let topPicks = futureSims
    .filter(s => s.recommendation === 'BET')
    .slice(0, 5)

  // Fallback: no BET recommendations yet — take top 3 by edge score
  if (topPicks.length === 0) {
    console.log('[HOT PICKS] No BET recommendations found — using top-3 fallback')
    topPicks = futureSims.slice(0, 3)
  }

  // ── 4. Clear all existing daily pick flags, set new ones ──────────────────
  await supabaseAdmin
    .from('ai_predictions')
    .update({ is_daily_pick: false, daily_pick_rank: null })
    .eq('is_daily_pick', true)

  for (let i = 0; i < topPicks.length; i++) {
    const { error: updateErr } = await supabaseAdmin
      .from('ai_predictions')
      .update({ is_daily_pick: true, daily_pick_rank: i + 1 })
      .eq('id', topPicks[i].id)

    if (updateErr) {
      console.error(`[HOT PICKS] Failed to mark pick ${topPicks[i].id}:`, updateErr.message)
    }
  }

  console.log(`[HOT PICKS] Marked ${topPicks.length} picks from ${futureSims.length} eligible simulations`)

  return NextResponse.json({
    success:          true,
    total_sims_today: todaySims.length,
    future_game_sims: futureSims.length,
    picks_selected:   topPicks.length,
    top_picks: topPicks.map((p, i) => ({
      rank:       i + 1,
      game:       `${p.away_team} @ ${p.home_team}`,
      sport:      p.sport,
      edge_score: p.edge_score,
      edge_tier:  p.edge_tier,
      type:       p.prediction_type,
    })),
  })
}