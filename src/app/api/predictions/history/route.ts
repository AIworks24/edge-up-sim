// src/app/api/predictions/history/route.ts
//
// Returns the current user's simulation history from ai_predictions.
// Uses supabaseAdmin to bypass RLS — auth is verified via the session token.
// This avoids any RLS policy gaps that cause the browser client to return 0 rows.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  // Verify the user's session from the Authorization header
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')

  // Use the anon client just to verify the token — get the user id
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('type') // 'all' | 'hot_pick' | 'user_simulation'
  const limit  = parseInt(searchParams.get('limit') || '50')

  // Build query — admin client bypasses RLS so we always get the user's rows
  let query = supabaseAdmin
    .from('ai_predictions')
    .select(`
      id, home_team, away_team, sport, game_time, created_at,
      edge_score, edge_tier, confidence_score,
      recommended_bet_type, recommended_line,
      projected_home_score, projected_away_score,
      ai_analysis, key_factors, risk_assessment,
      market_spread, market_total, fair_spread, fair_total,
      sim_home_win_pct, sim_home_cover_pct, sim_over_pct,
      prediction_type, is_daily_pick, daily_pick_rank,
      was_correct, actual_winner, actual_score,
      user_feedback, odds_snapshot
    `)
    .eq('requested_by', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filter && filter !== 'all') {
    query = query.eq('prediction_type', filter)
  }

  const { data, error } = await query

  if (error) {
    console.error('[HISTORY API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also return hot picks from today (not user-specific — publicly curated)
  const today = new Date().toISOString().split('T')[0]
  const { data: hotPicks } = await supabaseAdmin
    .from('ai_predictions')
    .select(`
      id, home_team, away_team, sport, game_time,
      edge_score, edge_tier, confidence_score,
      recommended_bet_type, recommended_line,
      ai_analysis, key_factors, daily_pick_rank,
      projected_home_score, projected_away_score
    `)
    .eq('is_daily_pick', true)
    .gte('created_at', `${today}T00:00:00.000Z`)
    .order('daily_pick_rank', { ascending: true })
    .limit(5)

  return NextResponse.json({
    simulations: data || [],
    hot_picks:   hotPicks || [],
    user_id:     user.id,
  })
}