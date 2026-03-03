// src/app/api/predictions/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'
import { runGameSimulation } from '@/lib/ai/claude-agent'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      eventId,
      sport,
      betType,
      userId,
      home_team,
      away_team,
      home_team_sr_id,
      away_team_sr_id,
      spread_home,
      total,
      moneyline_home,
      moneyline_away,
    } = body

    console.log('[API] Prediction request received:', { eventId, sport, betType, userId })

    // ── Validate inputs ───────────────────────────────────────────────────────
    if (!eventId || !sport || !betType || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, sport, betType, userId' },
        { status: 400 }
      )
    }

    if (!home_team_sr_id || !away_team_sr_id) {
      return NextResponse.json(
        { error: 'Missing SportRadar team IDs (home_team_sr_id, away_team_sr_id)' },
        { status: 400 }
      )
    }

    // ── Check user simulation limits ─────────────────────────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      console.error('[API] Profile error:', profileError)
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    const dailyLimit   = profile.daily_simulation_limit      || 3
    const currentCount = profile.daily_simulation_count      || 0
    const rollover     = profile.monthly_simulation_rollover || 0

    if (currentCount >= dailyLimit + rollover) {
      return NextResponse.json(
        { error: `Daily simulation limit reached (${currentCount}/${dailyLimit + rollover})` },
        { status: 429 }
      )
    }

    // ── Get event data ────────────────────────────────────────────────────────
    const { data: event, error: eventError } = await supabaseAdmin
      .from('sports_events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      console.error('[API] Event not found:', eventError)
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    // ── Parse odds from event or request body ─────────────────────────────────
    let oddsData: any = {}
    try {
      oddsData = typeof event.odds_data === 'string'
        ? JSON.parse(event.odds_data)
        : (event.odds_data || {})
    } catch {
      oddsData = {}
    }

    const resolvedSpreadHome   = spread_home    ?? oddsData.spread_home    ?? 0
    const resolvedTotal        = total          ?? oddsData.total          ?? 140
    const resolvedMlHome       = moneyline_home ?? oddsData.moneyline_home ?? -150
    const resolvedMlAway       = moneyline_away ?? oddsData.moneyline_away ?? 130
    const resolvedSpreadOdds   = oddsData.spread_home_odds ?? -110
    const resolvedTotalOdds    = oddsData.total_over_odds  ?? -110

    console.log('[API] Running simulation with:', {
      home: home_team || event.home_team,
      away: away_team || event.away_team,
      sport,
      betType,
      spread: resolvedSpreadHome,
      total:  resolvedTotal,
    })

    // ── Run the real simulation ───────────────────────────────────────────────
    const result = await runGameSimulation({
      event_id:        eventId,
      home_team:       home_team       || event.home_team,
      away_team:       away_team       || event.away_team,
      home_team_sr_id: home_team_sr_id || event.home_team_sr_id,
      away_team_sr_id: away_team_sr_id || event.away_team_sr_id,
      sport:           sport as 'ncaab' | 'nba' | 'nfl' | 'ncaaf',
      spread_home:     resolvedSpreadHome,
      total:           resolvedTotal,
      odds_spread:     resolvedSpreadOdds,
      odds_total:      resolvedTotalOdds,
      odds_ml_home:    resolvedMlHome,
      odds_ml_away:    resolvedMlAway,
      neutral_site:    event.neutral_site || false,
      user_id:         userId,
      is_hot_pick:     false,
      game_time:       event.commence_time,
    })

    // ── Increment user simulation count ──────────────────────────────────────
    await supabaseAdmin
      .from('profiles')
      .update({
        daily_simulation_count:   currentCount + 1,
        monthly_simulation_count: (profile.monthly_simulation_count || 0) + 1,
      })
      .eq('id', userId)

    console.log('[API] Simulation complete. Edge:', result.edge_up_score, 'Tier:', result.edge_tier)

    return NextResponse.json({
      success:    true,
      prediction: result,
    })

  } catch (error: any) {
    console.error('[API] Simulation error:', error.message, error.stack)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}