// src/app/api/simulations/summaries/route.ts
//
// Returns today's game_summary predictions for the simulate page feed.
// Sorted by edge_score DESC so highest-edge games appear first.
// Also includes the SR IDs needed to run a full simulation from the modal.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  // Require auth
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sport = searchParams.get('sport')   // e.g. 'ncaab'
  const today = new Date().toISOString().split('T')[0]

  try {
    // Query game_summary predictions — join sports_events for SR IDs
    let query = supabaseAdmin
      .from('ai_predictions')
      .select(`
        id,
        event_id,
        sport,
        home_team,
        away_team,
        game_time,
        edge_score,
        edge_tier,
        confidence_score,
        recommended_bet_type,
        recommended_line,
        projected_home_score,
        projected_away_score,
        ai_analysis,
        key_factors,
        market_spread,
        market_total,
        fair_spread,
        fair_total,
        sim_home_win_pct,
        sim_home_cover_pct,
        sim_over_pct,
        sports_events!inner (
          id,
          external_event_id,
          home_team_sr_id,
          away_team_sr_id,
          neutral_site,
          odds_data,
          venue_name,
          commence_time
        )
      `)
      .eq('prediction_type', 'game_summary')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .gt('game_time', new Date().toISOString())   // only future games
      .order('edge_score', { ascending: false })

    if (sport) {
      query = query.eq('sport', sport)
    }

    const { data, error } = await query

    if (error) {
      console.error('[summaries] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Shape response — pull SR IDs out of the joined events row
    const summaries = (data || []).map((row: any) => {
      const ev = row.sports_events
      return {
        id:                  row.id,
        event_id:            row.event_id,
        sport:               row.sport,
        home_team:           row.home_team,
        away_team:           row.away_team,
        game_time:           row.game_time,
        edge_score:          row.edge_score,
        edge_tier:           row.edge_tier,
        confidence_score:    row.confidence_score,
        recommended_bet_type: row.recommended_bet_type,
        recommended_line:    row.recommended_line,
        projected_home_score: row.projected_home_score,
        projected_away_score: row.projected_away_score,
        ai_analysis:         row.ai_analysis,
        key_factors:         row.key_factors,
        market_spread:       row.market_spread,
        market_total:        row.market_total,
        fair_spread:         row.fair_spread,
        fair_total:          row.fair_total,
        sim_home_win_pct:    row.sim_home_win_pct,
        sim_home_cover_pct:  row.sim_home_cover_pct,
        sim_over_pct:        row.sim_over_pct,
        // SR IDs needed to run full simulation from modal
        home_team_sr_id:     ev?.home_team_sr_id ?? null,
        away_team_sr_id:     ev?.away_team_sr_id ?? null,
        neutral_site:        ev?.neutral_site    ?? false,
        // Flat odds for the simulate API call body
        odds_data: (() => {
          if (!ev?.odds_data) return {}
          return typeof ev.odds_data === 'string' ? JSON.parse(ev.odds_data) : ev.odds_data
        })(),
      }
    })

    return NextResponse.json({ summaries, count: summaries.length, date: today })

  } catch (err: any) {
    console.error('[summaries] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}