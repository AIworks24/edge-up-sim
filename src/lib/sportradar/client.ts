const RATE_LIMIT_MS = 1100

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

export async function srFetch<T>(endpoint: string): Promise<T> {
  await limiter.throttle()
  const res = await fetch(`https://api.sportradar.com${endpoint}`, {
    headers: {
      'accept': 'application/json',
      'x-api-key': process.env.SPORTRADAR_API_KEY || '',  // ← KEY FIX: header not URL
    },
    next: { revalidate: 3600 },
  })
  if (res.status === 429) throw new Error('SportRadar rate limit hit')
  if (!res.ok) throw new Error(`SportRadar ${res.status} on ${endpoint}`)
  return res.json()
}