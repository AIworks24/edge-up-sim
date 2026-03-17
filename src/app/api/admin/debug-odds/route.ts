// src/app/api/admin/debug-odds/route.ts
// One-time debug endpoint — shows the raw OC v1 API response for first event
// Hit: https://your-app.vercel.app/api/admin/debug-odds?secret=YOUR_CRON_SECRET

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const OC_BASE = 'https://api.sportradar.com/oddscomparison-regular/trial/v1/en/us/tournaments.json'
  const tournamentId = 'sr:tournament:648'
  const url = `${OC_BASE}/tournaments/${tournamentId}/schedule.json`

  const res = await fetch(url, {
    headers: { 'x-api-key': process.env.SPORTRADAR_API_KEY || '' },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `SR fetch failed: ${res.status}` }, { status: 502 })
  }

  const data = await res.json()
  const events = data.sport_events || data.events || []

  if (events.length === 0) {
    return NextResponse.json({ error: 'No events returned', raw_keys: Object.keys(data) })
  }

  // Return the first event in full — shows exactly what fields SR returns
  const first = events[0]

  // Also dig into consensus lines specifically for spread
  const consensus = first.consensus
  const lines = consensus?.lines || []
  const spdLine = lines.find((l: any) => l.name === 'spread_current')
  const spdHome = spdLine?.outcomes?.find((o: any) => o.type === 'home')

  return NextResponse.json({
    total_events: events.length,
    first_event_id: first.id,
    first_event_uuids: first.uuids,

    // Full consensus lines — this is what we parse
    consensus_lines: lines,

    // Zoomed in on spread specifically
    spread_line_raw: spdLine ?? null,
    spread_home_outcome_raw: spdHome ?? null,
    spread_home_keys: spdHome ? Object.keys(spdHome) : [],
    spread_home_spread_field: spdHome?.spread ?? 'MISSING',
    spread_home_handicap_field: spdHome?.handicap ?? 'MISSING',

    // The full raw first event (truncated markets to avoid huge response)
    first_event_raw: {
      ...first,
      markets: first.markets?.slice(0, 2) ?? [],
    },
  })
}