// src/app/api/admin/debug-odds/route.ts
// One-time debug endpoint — shows the raw OC v1 API response for first event
// Hit: https://your-app.vercel.app/api/admin/debug-odds?secret=YOUR_CRON_SECRET

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const OC_BASE = 'https://api.sportradar.com/oddscomparison/trial/v1/en/us/'
  const url = `${OC_BASE}/tournaments.json`

  const res = await fetch(url, {
    headers: { 'x-api-key': process.env.SPORTRADAR_API_KEY || '' },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `SR fetch failed: ${res.status}` }, { status: 502 })
  }

  const data = await res.json()

  // Just dump the raw response so we can see tournament names and IDs
  return NextResponse.json({
    raw_keys: Object.keys(data),
    tournaments: data.tournaments || [],
  })
}