// src/app/api/cron/update-scores/route.ts
//
// Runs after games complete. Fetches final scores from SportRadar,
// determines if each prediction was correct, updates ai_predictions.
//
// FIX: Table name is ai_predictions (NOT predictions).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getGameResult }   from '@/lib/sportradar/games'
import { supabaseAdmin }   from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find predictions that have a game_time in the past but no result yet
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 4)  // Allow 4 hours after game_time for completion

  const { data: pending } = await supabaseAdmin
    .from('ai_predictions')   // ← your actual table name
    .select(`
      id, sport, home_team, away_team,
      game_time, market_spread, market_total,
      recommended_bet_type, recommended_line,
      sim_home_cover_pct, sim_over_pct,
      actual_home_score, actual_away_score
    `)
    .is('was_correct', null)
    .lt('game_time', cutoff.toISOString())
    .not('game_time', 'is', null)
    .limit(50)

  if (!pending || pending.length === 0) {
    return NextResponse.json({ success: true, updated: 0 })
  }

  let updated = 0
  const errors: string[] = []

  for (const pred of pending) {
    try {
      // Need the SR game ID — get it from sports_events via team names + game_time
      const { data: event } = await supabaseAdmin
        .from('sports_events')
        .select('external_event_id')
        .eq('home_team', pred.home_team)
        .eq('away_team', pred.away_team)
        .gte('commence_time', new Date(pred.game_time).toISOString())
        .limit(1)
        .single()

      if (!event) continue

      const result = await getGameResult(event.external_event_id, pred.sport || 'ncaab')
      if (!result || result.status !== 'closed') continue

      const { home_score, away_score } = result

      if (home_score === null || away_score === null) continue

      // Determine if prediction was correct based on bet type
      const wasCorrect = evaluatePrediction(pred, home_score, away_score)

      await supabaseAdmin
        .from('ai_predictions')
        .update({
          actual_home_score: home_score,
          actual_away_score: away_score,
          was_correct:       wasCorrect,
          resolved_at:       new Date().toISOString(),
        })
        .eq('id', pred.id)

      updated++

      // Also update the parent sports_events record
      if (event.external_event_id) {
        await supabaseAdmin
          .from('sports_events')
          .update({
            event_status: 'completed',
            final_score:  { home: home_score, away: away_score },
            updated_at:   new Date().toISOString(),
          })
          .eq('external_event_id', event.external_event_id)
      }

    } catch (err: any) {
      errors.push(`${pred.home_team} vs ${pred.away_team}: ${err.message}`)
    }
  }

  return NextResponse.json({ success: true, updated, errors, checked: pending.length })
}

function evaluatePrediction(
  pred: any,
  homeScore: number,
  awayScore: number
): boolean {
  const betType   = pred.recommended_bet_type || ''
  const betLine   = pred.recommended_line     || {}
  const spread    = pred.market_spread
  const total     = pred.market_total

  switch (betType.toLowerCase()) {
    case 'spread': {
      const betSide = betLine.bet_side || ''
      if (betSide.includes('Home Cover') || betSide === 'spread_home') {
        return (homeScore - awayScore) > -(spread || 0)
      } else {
        return (awayScore - homeScore) > (spread || 0)
      }
    }
    case 'over_under':
    case 'total': {
      const betSide = betLine.bet_side || ''
      if (betSide.includes('Over') || betSide === 'over') {
        return (homeScore + awayScore) > (total || 140)
      } else {
        return (homeScore + awayScore) < (total || 140)
      }
    }
    case 'moneyline': {
      const betSide = betLine.bet_side || ''
      if (betSide.includes('Home') || betSide === 'ml_home') {
        return homeScore > awayScore
      } else {
        return awayScore > homeScore
      }
    }
    default:
      return false
  }
}