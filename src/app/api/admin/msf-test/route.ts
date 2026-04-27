import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey   = process.env.MSF_API_KEY   || 'NOT_SET'
  const password = process.env.MSF_PASSWORD  || 'MYSPORTSFEEDS'
  const auth     = 'Basic ' + Buffer.from(`${apiKey}:${password}`).toString('base64')
  const url      = 'https://api.mysportsfeeds.com/v2.1/pull/nba/2025-2026-playoff/date/20260428/games.json'

  try {
    const res  = await fetch(url, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
      cache:   'no-store',
    })
    const text = await res.text()
    return NextResponse.json({
      http_status:   res.status,
      ok:            res.ok,
      api_key_set:   apiKey !== 'NOT_SET',
      api_key_first4: apiKey.slice(0, 4),
      response:      text.slice(0, 1000),
    })
  } catch (err: any) {
    return NextResponse.json({ fetch_error: err.message })
  }
}