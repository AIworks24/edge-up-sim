// src/app/api/admin/debug-games/route.ts
//
// TEMPORARY DIAGNOSTIC — delete after debugging hot picks.
// Shows exactly what's in sports_events so we can see why
// generate-hot-picks is getting 0 games from the DB query.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  const querySecret = new URL(req.url).searchParams.get('secret')
  if (querySecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()

  // 1. All distinct sport_keys in the table
  const { data: sportKeys } = await supabaseAdmin
    .from('sports_events')
    .select('sport_key')
    .limit(200)

  const uniqueSportKeys = [...new Set((sportKeys || []).map((r: any) => r.sport_key))]

  // 2. Total row count
  const { count: totalCount } = await supabaseAdmin
    .from('sports_events')
    .select('*', { count: 'exact', head: true })

  // 3. How many have commence_time > now
  const { count: futureCount } = await supabaseAdmin
    .from('sports_events')
    .select('*', { count: 'exact', head: true })
    .gt('commence_time', now)

  // 4. How many are sport_key = 'ncaab'
  const { count: ncaabCount } = await supabaseAdmin
    .from('sports_events')
    .select('*', { count: 'exact', head: true })
    .eq('sport_key', 'ncaab')

  // 5. How many are ncaab AND future
  const { count: ncaabFutureCount } = await supabaseAdmin
    .from('sports_events')
    .select('*', { count: 'exact', head: true })
    .eq('sport_key', 'ncaab')
    .gt('commence_time', now)

  // 6. How many are ncaab AND future AND have odds_data
  const { count: eligibleCount } = await supabaseAdmin
    .from('sports_events')
    .select('*', { count: 'exact', head: true })
    .eq('sport_key', 'ncaab')
    .gt('commence_time', now)
    .not('odds_data', 'is', null)

  // 7. Sample of 5 most recent rows — show commence_time and sport_key
  const { data: sample } = await supabaseAdmin
    .from('sports_events')
    .select('id, sport_key, home_team, away_team, commence_time, odds_data')
    .order('commence_time', { ascending: false })
    .limit(5)

  // 8. Sample of 5 future ncaab rows (if any)
  const { data: futureSample } = await supabaseAdmin
    .from('sports_events')
    .select('id, sport_key, home_team, away_team, commence_time, odds_data')
    .eq('sport_key', 'ncaab')
    .gt('commence_time', now)
    .limit(5)

  return NextResponse.json({
    server_now:        now,
    total_rows:        totalCount,
    future_rows:       futureCount,
    ncaab_rows:        ncaabCount,
    ncaab_future_rows: ncaabFutureCount,
    ncaab_future_with_odds: eligibleCount,
    unique_sport_keys: uniqueSportKeys,
    most_recent_5:     (sample || []).map((g: any) => ({
      sport_key:    g.sport_key,
      home_team:    g.home_team,
      away_team:    g.away_team,
      commence_time: g.commence_time,
      has_odds:     !!g.odds_data,
      odds_spread:  (typeof g.odds_data === 'string' ? JSON.parse(g.odds_data) : g.odds_data)?.spread_home ?? null,
    })),
    future_ncaab_5: (futureSample || []).map((g: any) => ({
      sport_key:    g.sport_key,
      home_team:    g.home_team,
      away_team:    g.away_team,
      commence_time: g.commence_time,
      has_odds:     !!g.odds_data,
      odds_spread:  (typeof g.odds_data === 'string' ? JSON.parse(g.odds_data) : g.odds_data)?.spread_home ?? null,
    })),
  })
}