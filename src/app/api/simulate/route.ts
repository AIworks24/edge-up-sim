// src/app/api/simulate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runGameSimulation } from '@/lib/ai/claude-agent'
import { supabaseAdmin }     from '@/lib/database/supabase-admin'

export async function POST(req: NextRequest) {
  const body = await req.json()

  const {
    event_id, home_team, away_team,
    home_team_sr_id, away_team_sr_id,
    sport, spread_home, total,
    odds_spread, odds_total, odds_ml_home, odds_ml_away,
    neutral_site, user_id, game_time,
  } = body

  if (!user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const availableSports = ['ncaab']
  if (!availableSports.includes(sport)) {
    return NextResponse.json({
      error:            `${sport.toUpperCase()} simulations coming soon`,
      available_sports: availableSports,
    }, { status: 400 })
  }

  const limitCheck = await checkSimLimit(user_id)
  if (!limitCheck.allowed) {
    return NextResponse.json({
      error:     'Daily simulation limit reached',
      limit:     limitCheck.limit,
      used:      limitCheck.used,
      resets_at: limitCheck.resets_at,
    }, { status: 429 })
  }

  try {
    // Read neutral_site from DB — never trust the client value
    const { data: dbEvent } = await supabaseAdmin
      .from('sports_events')
      .select('neutral_site')
      .or(`id.eq.${event_id},external_event_id.eq.${event_id}`)
      .single()
    // ADD THIS LINE:
    console.log('[SIMULATE] event_id:', event_id, 'dbEvent:', dbEvent, 'dbNeutralSite:', dbEvent?.neutral_site)
    
    const dbNeutralSite = dbEvent?.neutral_site ?? false

    const result = await runGameSimulation({
      event_id, home_team, away_team,
      home_team_sr_id, away_team_sr_id,
      sport, spread_home, total,
      odds_spread,
      odds_total,
      odds_ml_home: odds_ml_home || -110,
      odds_ml_away: odds_ml_away || -110,
      neutral_site: dbNeutralSite,
      user_id, game_time,
      is_hot_pick: false,
    })

    // Increment using your actual columns: daily_simulation_count, monthly_simulation_count
    await supabaseAdmin
      .from('profiles')
      .update({
        daily_simulation_count:   limitCheck.used + 1,
        monthly_simulation_count: limitCheck.monthly_used + 1,
        updated_at:               new Date().toISOString(),
      })
      .eq('id', user_id)

    return NextResponse.json(result)

  } catch (err: any) {
    console.error('[SIMULATE] Error:', err)
    return NextResponse.json({ error: err.message || 'Simulation failed' }, { status: 500 })
  }
}

async function checkSimLimit(userId: string): Promise<{
  allowed: boolean; limit: number; used: number; monthly_used: number; resets_at: string
}> {
  const { data: user } = await supabaseAdmin
    .from('profiles')
    .select('subscription_tier, daily_simulation_count, daily_simulation_limit, monthly_simulation_count, monthly_simulation_rollover, last_simulation_reset, reset_timezone')
    .eq('id', userId)
    .single()

  if (!user) return { allowed: false, limit: 0, used: 0, monthly_used: 0, resets_at: '' }

  const dailyLimit = user.daily_simulation_limit    || 3
  const dailyUsed  = user.daily_simulation_count    || 0
  const rollover   = user.monthly_simulation_rollover || 0
  const totalAvail = dailyLimit + rollover

  const tz        = user.reset_timezone || 'America/New_York'
  const nextReset = getNextMidnight(tz)

  return {
    allowed:      dailyUsed < totalAvail,
    limit:        totalAvail,
    used:         dailyUsed,
    monthly_used: user.monthly_simulation_count || 0,
    resets_at:    nextReset,
  }
}

function getNextMidnight(timezone: string): string {
  const now      = new Date()
  const userDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const midnight = new Date(userDate)
  midnight.setDate(midnight.getDate() + 1)
  midnight.setHours(0, 0, 0, 0)
  return midnight.toISOString()
}