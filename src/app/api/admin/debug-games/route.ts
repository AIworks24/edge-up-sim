// src/app/api/admin/debug-games/route.ts
// UPDATED - dumps raw odds_data and finds rows with actual spread values

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  const querySecret = new URL(req.url).searchParams.get('secret')
  if (querySecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()

  // 1. Total rows and sport key breakdown
  const { count: totalCount } = await supabaseAdmin
    .from('sports_events')
    .select('*', { count: 'exact', head: true })

  const { data: sportKeys } = await supabaseAdmin
    .from('sports_events')
    .select('sport_key')
    .limit(500)
  const uniqueSportKeys = [...new Set((sportKeys || []).map((r: any) => r.sport_key))]

  // 2. Future ncaab rows
  const { count: ncaabFutureCount } = await supabaseAdmin
    .from('sports_events')
    .select('*', { count: 'exact', head: true })
    .eq('sport_key', 'ncaab')
    .gt('commence_time', now)

  // 3. Raw odds_data from 3 future ncaab games — show the full object
  const { data: rawSample } = await supabaseAdmin
    .from('sports_events')
    .select('home_team, away_team, commence_time, odds_data, sport_key')
    .eq('sport_key', 'ncaab')
    .gt('commence_time', now)
    .limit(3)

  // 4. Check trigger-fetch stored rows — look for basketball_ncaab sport_key
  const { data: altKeySample } = await supabaseAdmin
    .from('sports_events')
    .select('home_team, away_team, commence_time, odds_data, sport_key')
    .eq('sport_key', 'basketball_ncaab')
    .gt('commence_time', now)
    .limit(3)

  // 5. Any rows at all where odds_data has a non-null spread_home at top level
  const { data: allFuture } = await supabaseAdmin
    .from('sports_events')
    .select('home_team, sport_key, commence_time, odds_data')
    .gt('commence_time', now)
    .limit(10)

  const withRealSpread = (allFuture || []).filter((g: any) => {
    try {
      const o = typeof g.odds_data === 'string' ? JSON.parse(g.odds_data) : g.odds_data
      return o && o.spread_home !== null && o.spread_home !== undefined
    } catch { return false }
  })

  return NextResponse.json({
    server_now:        now,
    total_rows:        totalCount,
    unique_sport_keys: uniqueSportKeys,
    ncaab_future_rows: ncaabFutureCount,

    // Full raw odds_data objects — this shows what's actually stored
    raw_odds_sample: (rawSample || []).map((g: any) => ({
      sport_key:    g.sport_key,
      home_team:    g.home_team,
      commence_time: g.commence_time,
      odds_data_raw: g.odds_data,  // full dump, no parsing
    })),

    // basketball_ncaab key sample (from trigger-fetch path)
    alt_key_sample: (altKeySample || []).map((g: any) => ({
      sport_key:    g.sport_key,
      home_team:    g.home_team,
      commence_time: g.commence_time,
      odds_data_raw: g.odds_data,
    })),

    // How many future games actually have a real spread value
    future_with_real_spread_count: withRealSpread.length,
    future_with_real_spread_sample: withRealSpread.slice(0, 3).map((g: any) => ({
      sport_key:  g.sport_key,
      home_team:  g.home_team,
      odds_data:  g.odds_data,
    })),
  })
}