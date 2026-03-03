// src/app/api/sports/events/route.ts
//
// Returns upcoming games from cache (sports_events table) or live from SportRadar.
// FIX: table name is sports_events (correct — this matches your actual schema).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingGames }   from '@/lib/sportradar/games'
import { attachOddsToGames }  from '@/lib/sportradar/odds'
import { supabaseAdmin }      from '@/lib/database/supabase-admin'
import { SportKey }           from '@/lib/sportradar/config'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sport = (searchParams.get('sport') || 'ncaab') as SportKey

  // 1. Try Supabase cache first (populated by trigger-fetch cron)
  const { data: cached } = await supabaseAdmin
    .from('sports_events')     // ← your actual table name
    .select('*')
    .eq('sport_key', sport)
    .eq('event_status', 'upcoming')
    .gte('commence_time', new Date().toISOString())
    .order('commence_time', { ascending: true })
    .limit(50)

  if (cached && cached.length > 0) {
    return NextResponse.json({ events: cached, source: 'cache' })
  }

  // 2. Fallback: fetch live from SportRadar if cache is empty
  try {
    let games = await getUpcomingGames(sport, 3)
    games     = await attachOddsToGames(games, sport)
    return NextResponse.json({ events: games, source: 'live' })
  } catch (err: any) {
    console.error('[EVENTS] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch events', events: [] }, { status: 500 })
  }
}