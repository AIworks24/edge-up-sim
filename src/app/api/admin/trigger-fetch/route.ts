// src/app/api/admin/trigger-fetch/route.ts
//
// Manual trigger: fetches upcoming games from SportRadar → stores in sports_events table.
// Run this if no games show on dashboard: /api/admin/trigger-fetch
//
// FIX: Uses sports_events table (your actual table name) with correct columns.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingGames }   from '@/lib/sportradar/games'
import { attachOddsToGames }  from '@/lib/sportradar/odds'
import { supabaseAdmin }      from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  // Simple admin auth check
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sports = ['ncaab'] as const
  const results: Record<string, any> = {}

  for (const sport of sports) {
    try {
      let games = await getUpcomingGames(sport, 3)
      games     = await attachOddsToGames(games)

      if (games.length === 0) {
        results[sport] = { fetched: 0, stored: 0 }
        continue
      }

      // Upsert into sports_events — your actual schema uses external_event_id as unique key
      const rows = games.map(g => ({
        external_event_id: g.id,
        sport_key:         g.sport,
        sport_title:       sportTitle(g.sport),
        commence_time:     g.commence_time,
        home_team:         g.home_team,
        away_team:         g.away_team,
        event_status:      'upcoming',

        // Store odds + SR team IDs in odds_data JSONB
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

        // Extended columns added by migration
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

      const { data, error } = await supabaseAdmin
        .from('sports_events')
        .upsert(rows, { onConflict: 'external_event_id' })
        .select('id')

      if (error) throw error

      results[sport] = { fetched: games.length, stored: data?.length ?? 0 }

    } catch (err: any) {
      results[sport] = { error: err.message }
    }
  }

  return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() })
}

function sportTitle(sport: string): string {
  const titles: Record<string, string> = {
    ncaab: 'NCAA Men\'s Basketball',
    nba:   'NBA',
    nfl:   'NFL',
  }
  return titles[sport] || sport.toUpperCase()
}