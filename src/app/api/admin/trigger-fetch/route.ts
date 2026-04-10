// src/app/api/admin/trigger-fetch/route.ts
//
// Converted from Sportradar → MySportsFeeds (MSF).
// Manual trigger to populate sports_events table.
// Browser test: /api/admin/trigger-fetch?secret=YOUR_CRON_SECRET&sport=nba

import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingGames }  from '@/lib/msf/games'
import { attachOddsToGames } from '@/lib/msf/odds'
import { supabaseAdmin }     from '@/lib/database/supabase-admin'
import { SportKey }          from '@/lib/msf/config'

function sportTitle(sport: string): string {
  const map: Record<string, string> = {
    ncaab: 'NCAA Basketball',
    nba:   'NBA',
    nfl:   'NFL Football',
    ncaaf: 'NCAA Football',
  }
  return map[sport] ?? sport.toUpperCase()
}

export async function GET(req: NextRequest) {
  const authHeader  = req.headers.get('authorization')
  const querySecret = new URL(req.url).searchParams.get('secret')
  const provided    = authHeader?.replace('Bearer ', '') || querySecret

  if (provided !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — pass ?secret=YOUR_CRON_SECRET or Authorization: Bearer header' },
      { status: 401 }
    )
  }

  // Allow ?sport=nba or ?sport=nfl to target a single sport; default fetches all active
  const sportParam = new URL(req.url).searchParams.get('sport') as SportKey | null
  const sports: SportKey[] = sportParam ? [sportParam] : ['nba', 'ncaab']

  const results: Record<string, any> = {}
  const errors:  string[] = []

  for (const sport of sports) {
    console.log(`\n[trigger-fetch] ── ${sport} ──`)

    try {
      // Step 1: Schedule
      let games = await getUpcomingGames(sport, 7)
      console.log(`[trigger-fetch] ${sport}: ${games.length} upcoming games`)

      if (games.length > 0) {
        console.log(`[trigger-fetch] First game:`, {
          id:   games[0].id,
          home: games[0].home_team,
          away: games[0].away_team,
          time: games[0].commence_time,
        })
      }

      // Step 2: Odds
      games = await attachOddsToGames(games, sport)
      const withOdds = games.filter(g => g.spread_home !== null || g.total !== null).length
      console.log(`[trigger-fetch] ${sport}: ${withOdds}/${games.length} games have odds`)

      if (games.length === 0) {
        results[sport] = { fetched: 0, stored: 0, note: 'MSF returned 0 games' }
        continue
      }

      // Step 3: Upsert to sports_events
      const rows = games.map(g => ({
        external_event_id: g.id,
        sport_key:         g.sport,
        sport_title:       sportTitle(g.sport),
        commence_time:     g.commence_time,
        home_team:         g.home_team,
        away_team:         g.away_team,
        event_status:      'upcoming',
        odds_data: {
          spread_home:      g.spread_home,
          spread_home_odds: g.spread_home_odds,
          spread_away_odds: g.spread_away_odds,
          total:            g.total,
          total_over_odds:  g.total_over_odds,
          total_under_odds: g.total_under_odds,
          moneyline_home:   g.moneyline_home,
          moneyline_away:   g.moneyline_away,
        },
        home_team_sr_id:  g.home_team_id,
        away_team_sr_id:  g.away_team_id,
        neutral_site:     g.neutral_site,
        season_year:      g.season_year,
        home_alias:       g.home_alias,
        away_alias:       g.away_alias,
        venue_name:       g.venue_name,
        last_odds_update: new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      }))

      console.log(`[trigger-fetch] Upserting ${rows.length} rows for ${sport}`)

      const { data, error } = await supabaseAdmin
        .from('sports_events')
        .upsert(rows, { onConflict: 'external_event_id' })
        .select('id')

      if (error) throw error

      results[sport] = { fetched: games.length, stored: data?.length ?? 0, with_odds: withOdds }
      console.log(`[trigger-fetch] Done: ${sport} →`, results[sport])

    } catch (err: any) {
      console.error(`[trigger-fetch] ERROR ${sport}:`, err.message)
      errors.push(`${sport}: ${err.message}`)
      results[sport] = { error: err.message }
    }
  }

  return NextResponse.json({
    success:   errors.length === 0,
    results,
    errors,
    timestamp: new Date().toISOString(),
  })
}