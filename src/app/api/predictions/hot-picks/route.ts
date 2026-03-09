// src/app/api/predictions/hot-picks/route.ts
//
// Returns today's hot picks from ai_predictions.
// Primary: rows marked is_daily_pick = true (set by generate-hot-picks cron)
// Fallback: top 5 by edge_score from today if cron hasn't run yet
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Primary: officially curated daily picks
    const { data: marked, error: markedError } = await supabaseAdmin
      .from('ai_predictions')
      .select(`
        id, home_team, away_team, sport, game_time,
        edge_score, edge_tier, confidence_score,
        recommended_bet_type, recommended_line,
        projected_home_score, projected_away_score,
        ai_analysis, market_spread, market_total,
        fair_spread, fair_total,
        sim_home_win_pct, sim_home_cover_pct, sim_over_pct,
        daily_pick_rank, prediction_type, key_factors,
        full_response
      `)
      .eq('is_daily_pick', true)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .order('daily_pick_rank', { ascending: true })
      .limit(5)

    if (markedError) {
      console.error('[HOT PICKS API] Error:', markedError)
      return NextResponse.json({ error: markedError.message }, { status: 500 })
    }

    if (marked && marked.length > 0) {
      return NextResponse.json({ picks: marked, source: 'curated' })
    }

    // Fallback: cron hasn't run yet — return top simulations from today
    // so dashboard always shows something when simulations exist
    const { data: topToday, error: topError } = await supabaseAdmin
      .from('ai_predictions')
      .select(`
        id, home_team, away_team, sport, game_time,
        edge_score, edge_tier, confidence_score,
        recommended_bet_type, recommended_line,
        projected_home_score, projected_away_score,
        ai_analysis, market_spread, market_total,
        fair_spread, fair_total,
        sim_home_win_pct, sim_home_cover_pct, sim_over_pct,
        prediction_type, key_factors,
        full_response
      `)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .gt('game_time', new Date().toISOString())
      .order('edge_score', { ascending: false })
      .limit(5)

    if (topError) {
      console.error('[HOT PICKS API] Fallback error:', topError)
      return NextResponse.json({ picks: [] })
    }

    return NextResponse.json({ picks: topToday || [], source: 'auto' })

  } catch (err: any) {
    console.error('[HOT PICKS API] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}