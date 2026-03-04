// src/app/api/predictions/hot-picks/route.ts
//
// Fetches today's hot picks from ai_predictions table.
// Returns up to 5 picks marked is_daily_pick = true for today.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data: picks, error } = await supabaseAdmin
      .from('ai_predictions')
      .select(`
        id,
        home_team,
        away_team,
        sport,
        game_time,
        edge_score,
        edge_tier,
        confidence_score,
        recommended_bet_type,
        recommended_line,
        projected_home_score,
        projected_away_score,
        ai_analysis,
        market_spread,
        market_total,
        fair_spread,
        fair_total,
        sim_home_win_pct,
        sim_home_cover_pct,
        sim_over_pct,
        daily_pick_rank,
        prediction_type
      `)
      .eq('is_daily_pick', true)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .order('daily_pick_rank', { ascending: true })
      .limit(5)

    if (error) {
      console.error('[HOT PICKS API] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ picks: picks || [] })
  } catch (err: any) {
    console.error('[HOT PICKS API] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}