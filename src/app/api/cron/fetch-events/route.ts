// src/app/api/cron/fetch-events/route.ts
//
// Converted from Sportradar → MySportsFeeds (MSF).
// Active sports: ncaab, nba. Add ncaaf/nfl when seasons start.

import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingGames }  from '@/lib/msf/games'
import { attachOddsToGames } from '@/lib/msf/odds'
import { supabaseAdmin }     from '@/lib/database/supabase-admin'
import { SportKey }          from '@/lib/msf/config'

const ACTIVE_SPORTS: SportKey[] = ['nba', 'ncaab']

function sportTitle(sport: string): string {
  const titles: Record<string, string> = {
    ncaab: "NCAA Men's Basketball",
    nba:   'NBA',
    nfl:   'NFL Football',
    ncaaf: 'NCAA Football',
  }
  return titles[sport] ?? sport.toUpperCase()
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/fetch-events] Starting MSF fetch...')

  const results = {
    fetched: 0,
    updated: 0,
    errors:  [] as string[],
  }

  for (const sport of ACTIVE_SPORTS) {
    try {
      let games = await getUpcomingGames(sport, 7)
      console.log(`[cron/fetch-events] ${sport}: ${games.length} games from schedule`)

      if (games.length === 0) continue

      games = await attachOddsToGames(games, sport)
      const withOdds = games.filter(g => g.spread_home !== null || g.total !== null).length
      console.log(`[cron/fetch-events] ${sport}: ${withOdds}/${games.length} games have odds`)

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

      const { data, error } = await supabaseAdmin
        .from('sports_events')
        .upsert(rows, { onConflict: 'external_event_id' })
        .select('id')

      if (error) {
        console.error(`[cron/fetch-events] upsert error for ${sport}:`, error.message)
        results.errors.push(`${sport}: ${error.message}`)
      } else {
        results.fetched += games.length
        results.updated += data?.length ?? 0
        console.log(`[cron/fetch-events] ${sport}: upserted ${data?.length ?? 0} rows`)
      }

    } catch (err: any) {
      console.error(`[cron/fetch-events] error for ${sport}:`, err.message)
      results.errors.push(`${sport}: ${err.message}`)
    }
  }

  // Clean up completed events older than 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  await supabaseAdmin
    .from('sports_events')
    .delete()
    .eq('event_status', 'completed')
    .lt('commence_time', sevenDaysAgo.toISOString())

  console.log('[cron/fetch-events] Complete:', results)

  return NextResponse.json({
    success:   results.errors.length === 0,
    ...results,
    timestamp: new Date().toISOString(),
  })
}