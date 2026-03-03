// src/app/api/admin/trigger-fetch/route.ts
//
// Manual trigger to populate sports_events from SportRadar.
// EASY BROWSER TEST: /api/admin/trigger-fetch?secret=YOUR_CRON_SECRET
// OR with header:    Authorization: Bearer YOUR_CRON_SECRET
//
// FIXES:
//   1. Accepts ?secret= query param for browser testing (no header needed)
//   2. Verbose console logging so you can see exactly what SR returns
//   3. sport_key stored as 'ncaab' — matches simulate page SPORT_KEY_MAP
//   4. sport_title is human-readable string for UI
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingGames }  from '@/lib/sportradar/games'
import { attachOddsToGames } from '@/lib/sportradar/odds'
import { supabaseAdmin }     from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  // Accept auth via header OR ?secret= query param (easier for browser testing)
  const authHeader  = req.headers.get('authorization')
  const querySecret = new URL(req.url).searchParams.get('secret')
  const provided    = authHeader?.replace('Bearer ', '') || querySecret

  if (provided !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — pass ?secret=YOUR_CRON_SECRET or Authorization: Bearer header' },
      { status: 401 }
    )
  }

  const sports  = ['ncaab'] as const   // Phase 1: CBB only
  const results: Record<string, any> = {}
  const errors:  string[] = []

  for (const sport of sports) {
    console.log(`\n[trigger-fetch] ── ${sport} ──`)

    try {
      // Step 1: Schedule
      console.log(`[trigger-fetch] getUpcomingGames('${sport}', 3)`)
      let games = await getUpcomingGames(sport, 3)
      console.log(`[trigger-fetch] Schedule: ${games.length} games`)
      if (games.length > 0) {
        console.log(`[trigger-fetch] First game:`, {
          id: games[0].id,
          home: games[0].home_team,
          away: games[0].away_team,
          time: games[0].commence_time,
        })
      }

      // Step 2: Odds
      games = await attachOddsToGames(games, sport)
      const withOdds = games.filter(g => g.spread_home !== null || g.total !== null).length
      console.log(`[trigger-fetch] Odds: ${withOdds}/${games.length} games have odds`)

      if (games.length === 0) {
        results[sport] = { fetched: 0, stored: 0, note: 'SportRadar returned 0 games' }
        continue
      }

      // Step 3: Upsert
      // sport_key MUST be 'ncaab' (not 'basketball_ncaab') — simulate page queries by this value
      const rows = games.map(g => ({
        external_event_id: g.id,
        sport_key:         g.sport,           // 'ncaab' | 'nfl' | 'nba'
        sport_title:       sportTitle(g.sport),
        commence_time:     g.commence_time,
        home_team:         g.home_team,
        away_team:         g.away_team,
        event_status:      'upcoming',

        // Flat odds object (SportRadar format — NOT Odds API bookmaker array)
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

        home_team_sr_id: g.home_team_id,
        away_team_sr_id: g.away_team_id,
        neutral_site:    g.neutral_site,
        season_year:     g.season_year,
        home_alias:      g.home_alias,
        away_alias:      g.away_alias,
        venue_name:      g.venue_name,

        last_odds_update: new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      }))

      console.log(`[trigger-fetch] Upserting ${rows.length} rows, sport_key='${rows[0]?.sport_key}'`)

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

function sportTitle(sport: string): string {
  const map: Record<string, string> = {
    ncaab: 'NCAA Basketball',
    nba:   'NBA',
    nfl:   'NFL Football',
  }
  return map[sport] ?? sport.toUpperCase()
}