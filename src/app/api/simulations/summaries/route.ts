// src/app/api/simulations/summaries/route.ts
// FULL REPLACEMENT
//
// Root cause of original failure: storePrediction never wrote event_id,
// so the sports_events!inner join returned 0 rows.
//
// This version queries ai_predictions directly (no join required).
// SR IDs and odds_data are fetched in a second query keyed by home_team
// + away_team so the modal can run full simulations.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
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

  const { searchParams } = new URL(req.url)
  const sport = searchParams.get('sport')   // e.g. 'ncaab'
  const today = new Date().toISOString().split('T')[0]

  try {
    // ── Step 1: Query game_summary predictions directly — no join needed ────
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
        odds_snapshot
      `)
      .eq('prediction_type', 'game_summary')
      .gt('game_time', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
      .lte('game_time', new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString())
      .order('edge_score', { ascending: false })

    if (sport) {
      query = query.eq('sport', sport)
    }

    const { data: predictions, error: predError } = await query

    if (predError) {
      console.error('[summaries] Predictions query error:', predError.message)
      return NextResponse.json({ error: predError.message }, { status: 500 })
    }

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({ summaries: [], count: 0, date: today })
    }

    // ── Step 2: Look up SR IDs + odds_data from sports_events ──────────────
    // Try by event_id first (works for rows written after the storePrediction fix).
    // Fall back to matching by home_team + away_team for older rows.

    const eventIds     = predictions.map(p => p.event_id).filter(Boolean)
    const homeTeams    = predictions.map(p => p.home_team)

    // Fetch matching sports_events rows
    const { data: events } = await supabaseAdmin
      .from('sports_events')
      .select('id, external_event_id, home_team, away_team, home_team_sr_id, away_team_sr_id, neutral_site, odds_data')
      .or(
        eventIds.length > 0
          ? `id.in.(${eventIds.join(',')}),home_team.in.(${homeTeams.map(t => `"${t}"`).join(',')})`
          : `home_team.in.(${homeTeams.map(t => `"${t}"`).join(',')})`
      )

    // Build a lookup map: home_team → event row
    const eventByHomeTeam: Record<string, any> = {}
    const eventById:       Record<string, any> = {}
    for (const ev of events ?? []) {
      eventByHomeTeam[ev.home_team] = ev
      eventById[ev.id]              = ev
    }

    // ── Step 3: Merge and shape response ───────────────────────────────────
    const summaries = predictions.map(pred => {
      // Prefer lookup by event_id, fall back to home_team match
      const ev = (pred.event_id && eventById[pred.event_id])
        ? eventById[pred.event_id]
        : eventByHomeTeam[pred.home_team]

      // Parse odds — prefer live sports_events row, fall back to odds_snapshot
      let oddsData: any = {}
      if (ev?.odds_data) {
        oddsData = typeof ev.odds_data === 'string' ? JSON.parse(ev.odds_data) : ev.odds_data
      } else if (pred.odds_snapshot) {
        const snap = typeof pred.odds_snapshot === 'string'
          ? JSON.parse(pred.odds_snapshot)
          : pred.odds_snapshot
        // odds_snapshot shape: { spread, total, ml_home, ml_away }
        oddsData = {
          spread_home:   snap.spread    ?? null,
          total:         snap.total     ?? null,
          moneyline_home: snap.ml_home  ?? null,
          moneyline_away: snap.ml_away  ?? null,
        }
      }

      return {
        id:                   pred.id,
        event_id:             pred.event_id ?? ev?.id ?? null,
        sport:                pred.sport,
        home_team:            pred.home_team,
        away_team:            pred.away_team,
        game_time:            pred.game_time,
        edge_score:           pred.edge_score,
        edge_tier:            pred.edge_tier,
        confidence_score:     pred.confidence_score,
        recommended_bet_type: pred.recommended_bet_type,
        recommended_line:     pred.recommended_line,
        projected_home_score: pred.projected_home_score,
        projected_away_score: pred.projected_away_score,
        ai_analysis:          pred.ai_analysis,
        key_factors:          pred.key_factors,
        market_spread:        pred.market_spread,
        market_total:         pred.market_total,
        fair_spread:          pred.fair_spread,
        fair_total:           pred.fair_total,
        sim_home_win_pct:     pred.sim_home_win_pct,
        sim_home_cover_pct:   pred.sim_home_cover_pct,
        sim_over_pct:         pred.sim_over_pct,
        // SR IDs needed by the simulate modal
        home_team_sr_id:      ev?.home_team_sr_id  ?? null,
        away_team_sr_id:      ev?.away_team_sr_id  ?? null,
        neutral_site:         ev?.neutral_site     ?? false,
        odds_data:            oddsData,
      }
    })

    return NextResponse.json({ summaries, count: summaries.length, date: today })

  } catch (err: any) {
    console.error('[summaries] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}