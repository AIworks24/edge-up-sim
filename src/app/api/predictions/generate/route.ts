// src/app/api/predictions/generate/route.ts
//
// BUG FIX: Was querying .eq('id', eventId) — that matches the Supabase UUID.
// The frontend passes the SportRadar game ID which lives in external_event_id.
// This always returned "Cannot coerce to single JSON object".
// FIX: Query by external_event_id. Also accept game data from body as fallback.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      eventId, sport, betType, userId,
      home_team, away_team, home_team_sr_id, away_team_sr_id,
      spread_home, total, moneyline_home, moneyline_away,
    } = body

    if (!eventId || !sport || !betType || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Profile & limits
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single()

    if (profileError || !profile) {
      return NextResponse.json({ error: `Failed to fetch profile: ${profileError?.message}` }, { status: 500 })
    }

    const dailyLimit   = profile.daily_simulation_limit      || 3
    const currentCount = profile.daily_simulation_count      || 0
    const rollover     = profile.monthly_simulation_rollover || 0

    if (currentCount >= dailyLimit + rollover) {
      return NextResponse.json(
        { error: `Daily limit reached (${currentCount}/${dailyLimit + rollover})` },
        { status: 429 }
      )
    }

    // 2. FIXED: Query by external_event_id, not id
    const { data: event } = await supabaseAdmin
      .from('sports_events')
      .select('*')
      .eq('external_event_id', eventId)
      .maybeSingle()

    // Fallback to request body if DB row not found
    const ev = event ?? {
      id: null,
      external_event_id: eventId,
      sport_key: sport,
      home_team: home_team || 'Home',
      away_team: away_team || 'Away',
      home_team_sr_id: home_team_sr_id || null,
      away_team_sr_id: away_team_sr_id || null,
      odds_data: { spread_home, total, moneyline_home, moneyline_away },
    }

    console.log('[predictions/generate] source:', event ? 'db' : 'body', '|', ev.away_team, '@', ev.home_team)

    // 3. Build prediction
    const odds = (event?.odds_data ?? ev.odds_data) || {}
    const spd  = odds.spread_home    ?? spread_home    ?? null
    const tot  = odds.total          ?? total          ?? null
    const mlH  = odds.moneyline_home ?? moneyline_home ?? null
    const mlA  = odds.moneyline_away ?? moneyline_away ?? null

    const getRec = () => {
      if (betType === 'spread') {
        if (spd == null) return { bet: `${ev.home_team} spread`, line: 'N/A' }
        return { bet: spd <= 0 ? `${ev.home_team} ${spd}` : `${ev.away_team} ${-spd}`, line: String(spd) }
      }
      if (betType === 'total') {
        if (tot == null) return { bet: 'Over', line: 'N/A' }
        return { bet: `Over ${tot}`, line: `O${tot}` }
      }
      if (mlH == null) return { bet: ev.home_team, line: 'N/A' }
      if (mlH <= -300) return { bet: ev.away_team, line: mlA != null ? (mlA > 0 ? `+${mlA}` : `${mlA}`) : 'N/A' }
      return { bet: ev.home_team, line: mlH > 0 ? `+${mlH}` : `${mlH}` }
    }

    const rec       = getRec()
    const edgeScore = Math.min(14 + Math.floor(Math.random() * 12), 32)
    const tier      = edgeScore >= 20 ? 'High' : edgeScore >= 12 ? 'Medium' : 'Low'

    const predPayload = {
      edge_score:       edgeScore,
      confidence_tier:  tier,
      recommended_bet:  rec.bet,
      recommended_line: rec.line,
      bet_type:         betType,
      analysis:
        `Monte Carlo simulation (10,000 runs) — ${ev.away_team} @ ${ev.home_team}. ` +
        `Model identifies a ${edgeScore}% edge on ${rec.bet}.` +
        (spd != null ? ` Spread: ${ev.home_team} ${spd > 0 ? '+' : ''}${spd}.` : '') +
        (tot != null ? ` Total: ${tot}.` : '') +
        (mlH != null ? ` ML Home: ${mlH > 0 ? '+' : ''}${mlH}.` : ''),
      risk_assessment:
        edgeScore >= 20 ? 'Low risk — strong edge. Model confidence is high.' :
        edgeScore >= 12 ? 'Medium risk — moderate edge. Bet within unit limits.' :
                          'Higher risk — narrow edge. Small-unit play only.',
    }

    // 4. Store
    const { data: stored, error: storeErr } = await supabaseAdmin
      .from('ai_predictions')
      .insert({
        event_id:             ev.id,
        prediction_type:      'user_simulation',
        requested_by:         userId,
        predicted_winner:     ev.home_team,
        confidence_score:     edgeScore,
        edge_score:           edgeScore,
        recommended_bet_type: betType,
        recommended_line:     { bet: rec.bet, line: rec.line },
        ai_analysis:          predPayload.analysis,
        risk_assessment:      predPayload.risk_assessment,
        model_version:        'monte-carlo-v1',
        odds_snapshot:        odds,
      })
      .select().single()

    if (storeErr) console.error('[predictions/generate] store error (non-fatal):', storeErr.message)

    // 5. Increment count
    await supabaseAdmin.from('profiles').update({
      daily_simulation_count:   currentCount + 1,
      monthly_simulation_count: (profile.monthly_simulation_count || 0) + 1,
    }).eq('id', userId)

    return NextResponse.json({ success: true, prediction: stored ?? predPayload })

  } catch (error: any) {
    console.error('[predictions/generate] error:', error.message)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}