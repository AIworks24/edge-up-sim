// src/lib/msf/client.ts
// HTTP client for MySportsFeeds v2.1
// Auth: HTTP Basic with API key as username and "MYSPORTSFEEDS" as password

import { MSF_CONFIG } from './config'

// Simple in-process rate limiter — MSF allows reasonable request rates
// but we add a small delay to be polite during batch operations
const RATE_LIMIT_MS = 500

class RateLimiter {
  private lastCall = 0
  async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastCall
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed))
    }
    this.lastCall = Date.now()
  }
}

const limiter = new RateLimiter()

function buildAuthHeader(): string {
  const credentials = `${MSF_CONFIG.API_KEY}:${MSF_CONFIG.PASSWORD}`
  return 'Basic ' + Buffer.from(credentials).toString('base64')
}

export async function msfFetch<T>(
  league: string,
  season: string,
  feed: string,
  params: Record<string, string> = {},
): Promise<T> {
  await limiter.throttle()

  const url = new URL(`${MSF_CONFIG.BASE}/${league}/${season}/${feed}.json`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization':    buildAuthHeader(),
      'Accept':           'application/json',
      'Accept-Encoding':  'gzip',
    },
    // Don't cache — always fetch fresh data for odds and schedules
    cache: 'no-store',
  })

  if (res.status === 403) throw new Error(`MSF 403: ${league}/${season}/${feed} — check addon subscription`)
  if (res.status === 400) throw new Error(`MSF 400: ${league}/${season}/${feed} — check required parameters`)
  if (!res.ok)            throw new Error(`MSF ${res.status}: ${league}/${season}/${feed}`)

  return res.json() as Promise<T>
}