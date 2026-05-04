// src/app/api/predictions/track-summary/route.ts
//
// Copies a cron-generated game_summary into a user_simulation row
// for the requesting user, without consuming a simulation quota.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { summary_id } = await req.json()
  if (!summary_id) {
    return NextResponse.json({ error: 'summary_id required' }, { status: 400 })
  }

  // Fetch source game_summary row
  const { data: summary, error: fetchErr } = await supabaseAdmin
    .from('ai_predictions')
    .select('*')
    .eq('id', summary_id)
    .eq('prediction_type', 'game_summary')
    .single()

  if (fetchErr || !summary) {
    return NextResponse.json({ error: 'Summary not found' }, { status: 404 })
  }

  // Idempotent — check if user already tracked this event
  const { data: existing } = await supabaseAdmin
    .from('ai_predictions')
    .select('id')
    .eq('requested_by', user.id)
    .eq('event_id', summary.event_id)
    .eq('prediction_type', 'user_simulation')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ tracked: true, id: existing.id, already_tracked: true })
  }

  // Insert user_simulation copy — no quota increment
  const { data: tracked, error: insertErr } = await supabaseAdmin
    .from('ai_predictions')
    .insert({
      prediction_type:      'user_simulation',
      requested_by:         user.id,
      event_id:             summary.event_id,
      confidence_score:     summary.confidence_score,
      edge_score:           summary.edge_score,
      ai_analysis:          summary.ai_analysis,
      key_factors:          summary.key_factors,
      risk_assessment:      summary.risk_assessment,
      recommended_bet_type: summary.recommended_bet_type,
      recommended_line:     summary.recommended_line,
      odds_snapshot:        summary.odds_snapshot,
      sport:                summary.sport,
      home_team:            summary.home_team,
      away_team:            summary.away_team,
      game_time:            summary.game_time,
      edge_tier:            summary.edge_tier,
      projected_home_score: summary.projected_home_score,
      projected_away_score: summary.projected_away_score,
      fair_spread:          summary.fair_spread,
      fair_total:           summary.fair_total,
      market_spread:        summary.market_spread,
      market_total:         summary.market_total,
      sim_home_win_pct:     summary.sim_home_win_pct,
      sim_home_cover_pct:   summary.sim_home_cover_pct,
      sim_over_pct:         summary.sim_over_pct,
      full_response:        summary.full_response,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[track-summary]', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ tracked: true, id: tracked.id })
}