// src/lib/sportradar/odds.ts
//
// Switches from OC v1 (tournament schedule) to OC v2 (sport events).
// OC v1 returns spread JUICE only — the spread LINE value is missing.
// OC v2 returns complete odds including spread line (handicap field).
//
// Match strategy: OC v2 event.sport_event.id = "sr:match:XXXXXXX"
// Our games have the NCAAMB UUID. OC v2 also exposes uuids for cross-matching.
// ─────────────────────────────────────────────────────────────────────────────

import { NormalizedGame } from './games'

const OC_BASE = 'https://api.sportradar.com/oddscomparison/trial/v2/en'

const OC_SPORT_PATH: Record<string, string> = {
  ncaab: 'basketball',
  nba:   'basketball',
  nfl:   'americanfootball',
}

interface ParsedOdds {
  spread_home:      number | null
  spread_home_odds: number | null
  spread_away_odds: number | null
  total:            number | null
  total_over_odds:  number | null
  total_under_odds: number | null
  moneyline_home:   number | null
  moneyline_away:   number | null
}

async function fetchOCv2Events(sportPath: string): Promise<any[]> {
  const url = `${OC_BASE}/sports/${sportPath}/events.json`
  const res = await fetch(url, {
    headers: { 'x-api-key': process.env.SPORTRADAR_API_KEY || '' },
  })
  if (!res.ok) {
    console.error(`[odds] OC v2 fetch failed: ${res.status} ${url}`)
    return []
  }
  const data = await res.json()
  return data.events || data.sport_events || []
}

export async function attachOddsToGames(
  games: NormalizedGame[],
  sport: string
): Promise<NormalizedGame[]> {
  try {
    const sportPath = OC_SPORT_PATH[sport]
    if (!sportPath) {
      console.warn(`[odds] No OC v2 path for sport: ${sport}`)
      return games
    }

    const events = await fetchOCv2Events(sportPath)
    console.log(`[odds] OC v2 returned ${events.length} events for ${sportPath}`)
    if (events.length === 0) return games

    // Build ID map — try sr:match ID and uuids field
    const idMap = new Map<string, ParsedOdds>()

    for (const event of events) {
      const parsed = parseOCv2Event(event)
      if (!parsed) continue

      const srId = event.sport_event?.id || event.id
      if (srId) idMap.set(srId, parsed)

      // uuids field contains NCAAMB game UUID (comma-separated)
      const uuids = event.sport_event?.uuids || event.uuids
      if (uuids) {
        for (const uuid of String(uuids).split(',').map((u: string) => u.trim())) {
          if (uuid) idMap.set(uuid, parsed)
        }
      }
    }

    console.log(`[odds] ID map: ${idMap.size} entries`)

    let matched = 0
    const result = games.map(game => {
      const odds = idMap.get(game.id)
      if (!odds) return game
      matched++
      return {
        ...game,
        spread_home:      odds.spread_home,
        spread_home_odds: odds.spread_home_odds,
        spread_away_odds: odds.spread_away_odds,
        total:            odds.total,
        total_over_odds:  odds.total_over_odds,
        total_under_odds: odds.total_under_odds,
        moneyline_home:   odds.moneyline_home,
        moneyline_away:   odds.moneyline_away,
      }
    })

    const withSpread = result.filter(g => g.spread_home !== null).length
    const withOdds   = result.filter(g => g.total !== null || g.moneyline_home !== null).length
    console.log(`[odds] Matched ${matched}/${games.length} — ${withSpread} with spread, ${withOdds} with odds`)

    return result

  } catch (err: any) {
    console.error('[odds] attachOddsToGames error:', err.message)
    return games
  }
}

function parseOCv2Event(event: any): ParsedOdds | null {
  const toNum = (v: any): number | null => {
    if (v == null) return null
    const n = parseFloat(String(v))
    return isNaN(n) ? null : n
  }

  // OC v2: consensus.markets[] or markets[] directly on event
  const markets: any[] = event.consensus?.markets || event.markets || []
  if (markets.length === 0) return null

  // Market IDs: 1=2way(ML), 3=totals, 4=spread/handicap
  const mlMkt  = markets.find((m: any) => m.id === '1'  || m.id === 1  || m.name === '2way')
  const totMkt = markets.find((m: any) => m.id === '3'  || m.id === 3  || m.name === 'total')
  const spdMkt = markets.find((m: any) => m.id === '4'  || m.id === 4  || m.name === 'spread' || m.name === 'handicap')

  const getOutcome = (market: any, type: string): any => {
    if (!market) return null
    const outcomes = market.outcomes || market.books?.[0]?.outcomes || []
    return outcomes.find((o: any) => o.type === type) ?? null
  }

  const mlHome  = getOutcome(mlMkt,  'home')
  const mlAway  = getOutcome(mlMkt,  'away')
  const spdHome = getOutcome(spdMkt, 'home')
  const spdAway = getOutcome(spdMkt, 'away')
  const totOver = getOutcome(totMkt, 'over')
  const totUndr = getOutcome(totMkt, 'under')

  // Debug: log the raw spdHome object so we can confirm the spread field name
  if (spdHome) {
    console.log(`[odds DEBUG] spdHome keys: ${Object.keys(spdHome).join(', ')} | handicap=${spdHome.handicap} spread=${spdHome.spread} line=${spdHome.line}`)
  }

  // OC v2 uses "handicap" for spread line value — falls back to "spread" and "line"
  const spreadVal = toNum(spdHome?.handicap ?? spdHome?.spread ?? spdHome?.line)
  const totalVal  = toNum(totOver?.total    ?? totOver?.handicap ?? totOver?.line)

  if (!mlHome && !totOver && !spdHome) return null

  return {
    spread_home:      spreadVal,
    spread_home_odds: toNum(spdHome?.odds),
    spread_away_odds: toNum(spdAway?.odds),
    total:            totalVal,
    total_over_odds:  toNum(totOver?.odds),
    total_under_odds: toNum(totUndr?.odds),
    moneyline_home:   toNum(mlHome?.odds),
    moneyline_away:   toNum(mlAway?.odds),
  }
}