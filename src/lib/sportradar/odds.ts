// src/lib/sportradar/odds.ts
//
// Rewritten based on confirmed OC Regular API v1 response structure.
//
// KEY FACTS from live API test:
//   Base URL: https://api.sportradar.com/oddscomparison/trial/v1/en/us
//   NCAAB tournament ID: sr:tournament:648
//   Event structure:
//     - event.id = "sr:match:XXXXXXX" (OC-specific ID, NOT the NCAAMB UUID)
//     - event.uuids = "ncaamb-uuid,other-uuid" (comma-separated — contains our NCAAMB game UUID)
//     - event.consensus = best source for lines (consensus across all books)
//     - event.consensus.lines[] has: moneyline_current, spread_current, total_current
//   Odds are STRINGS: "+700", "-110", "16.5" — must parseFloat()
//   Spread: consensus.lines spread_current.spread = "16.5" (home perspective, positive = home dog)
//           home outcome spread = "16.5" means home is +16.5 (underdog)
//           away outcome spread = "-16.5" means away is -16.5 (favourite)
//
// MATCHING STRATEGY:
//   event.uuids contains the NCAAMB schedule UUID (our game.id).
//   Split on comma and check if any UUID matches.

import { srFetch }        from './client'
import { NormalizedGame } from './games'

// OC Regular uses a different base path — override srFetch base with full URL
const OC_BASE = 'https://api.sportradar.com/oddscomparison/trial/v1/en/us'

const NBA_TOURNAMENT_ID = 'sr:tournament:132'

// Cache resolved tournament IDs for the process lifetime
const tournamentIdCache = new Map<string, string>()

// NCAAB: dynamically resolved because SR rotates tournament IDs each season/phase
// Regular season → March Madness → NIT all have different IDs
async function resolveNcaabTournamentId(): Promise<string | null> {
  if (tournamentIdCache.has('ncaab')) return tournamentIdCache.get('ncaab')!

  const url = `${OC_BASE}/tournaments.json`
  const res = await fetch(url, {
    headers: { 'x-api-key': process.env.SPORTRADAR_API_KEY || '' },
  })
  if (!res.ok) {
    console.error(`[odds] Tournaments list fetch failed: ${res.status}`)
    return null
  }

  const data = await res.json()
  const tournaments: any[] = data.tournaments || []

  // Collect ALL active USA Basketball tournaments (March Madness + NIT)
  // Priority order: NCAA Division I National Championship first, then NIT
  const matches = tournaments.filter((t: any) =>
    t.sport?.id === 'sr:sport:2' &&
    t.category?.country_code === 'USA' &&
    t.current_season != null &&
    (t.name?.includes('NCAA') || t.name?.includes('National Invitation'))
  ).sort((a: any, b: any) => {
    // NCAA Division I National Championship sorts before NIT
    if (a.name?.includes('National Championship')) return -1
    if (b.name?.includes('National Championship')) return 1
    return 0
  })

  if (matches.length === 0) {
    console.error('[odds] No active NCAAB tournaments found in OC list')
    return null
  }

  const ids = matches.map((t: any) => t.id).join(',')
  console.log(`[odds] Resolved NCAAB tournaments: ${matches.map((t: any) => `${t.name} (${t.id})`).join(' | ')}`)
  tournamentIdCache.set('ncaab', ids)
  return ids
}

async function fetchOCTournamentSchedule(tournamentIds: string): Promise<any[]> {
  const ids = tournamentIds.split(',')
  const allEvents: any[] = []

  for (const tournamentId of ids) {
    const url = `${OC_BASE}/tournaments/${tournamentId.trim()}/schedule.json`
    const res = await fetch(url, {
      headers: { 'x-api-key': process.env.SPORTRADAR_API_KEY || '' },
    })
    if (!res.ok) {
      console.error(`[odds] OC schedule fetch failed: ${res.status} ${url}`)
      continue
    }
    const data = await res.json()
    const events = data.sport_events || data.events || []
    console.log(`[odds] Tournament ${tournamentId.trim()}: ${events.length} events`)
    allEvents.push(...events)
  }

  return allEvents
}

export async function attachOddsToGames(
  games: NormalizedGame[],
  sport: string
): Promise<NormalizedGame[]> {
  try {
    let tournamentId: string | null = null

    if (sport === 'ncaab') {
      tournamentId = await resolveNcaabTournamentId()
    } else if (sport === 'nba') {
      tournamentId = NBA_TOURNAMENT_ID
    } else if (sport === 'nfl') {
      tournamentId = 'sr:tournament:133'
    }

    if (!tournamentId) {
      console.warn(`[odds] No tournament ID resolved for sport: ${sport}`)
      return games
    }

    const events = await fetchOCTournamentSchedule(tournamentId)
    console.log(`[odds] OC returned ${events.length} events for ${sport} (${tournamentId})`)

    if (events.length === 0) return games

    // Build map: NCAAMB UUID → parsed odds
    // event.uuids is a comma-separated string of UUIDs
    // One of those UUIDs matches our NCAAMB schedule game.id
    const oddsMap = new Map<string, ParsedOdds>()

    for (const event of events) {
      const parsed = parseOCEvent(event)
      if (!parsed) continue

      // Map by the OC match ID itself
      oddsMap.set(event.id, parsed)

      // Also map by every UUID in the uuids field (one will be our NCAAMB game UUID)
      if (event.uuids) {
        const uuids = String(event.uuids).split(',').map((u: string) => u.trim())
        for (const uuid of uuids) {
          if (uuid) oddsMap.set(uuid, parsed)
        }
      }
    }

    console.log(`[odds] Odds map built with ${oddsMap.size} entries`)

    let matched = 0
    const result = games.map(game => {
      const o = oddsMap.get(game.id)
      if (!o) return game
      matched++
      return {
        ...game,
        // Any game matched from the NCAA tournament OC feed is neutral site by definition.
        // This overrides whatever the schedule API returned for neutral_site.
        neutral_site:     true,
        spread_home:      o.spread_home,
        spread_home_odds: o.spread_home_odds,
        spread_away_odds: o.spread_away_odds,
        total:            o.total,
        total_over_odds:  o.total_over_odds,
        total_under_odds: o.total_under_odds,
        moneyline_home:   o.moneyline_home,
        moneyline_away:   o.moneyline_away,
      }
    })

    console.log(`[odds] Matched ${matched}/${games.length} games`)
    return result

  } catch (err: any) {
    console.error('[odds] attachOddsToGames error:', err.message)
    return games
  }
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

function parseOCEvent(event: any): ParsedOdds | null {
  if (!event) return null

  // Use consensus lines — most reliable single source
  const consensus = event.consensus
  if (consensus?.lines) {
    return parseFromConsensus(consensus.lines)
  }

  // Fallback: parse from markets array directly (first book with data)
  if (event.markets?.length > 0) {
    return parseFromMarkets(event.markets)
  }

  return null
}

function parseFromConsensus(lines: any[]): ParsedOdds {
  const toNum = (v: any): number | null => {
    if (v == null) return null
    const n = parseFloat(String(v))
    return isNaN(n) ? null : n
  }

  const mlCurrent  = lines.find((l: any) => l.name === 'moneyline_current')
  const spdCurrent = lines.find((l: any) => l.name === 'spread_current')
  const totCurrent = lines.find((l: any) => l.name === 'total_current')

  // Moneyline
  const mlHome = mlCurrent?.outcomes?.find((o: any) => o.type === 'home')
  const mlAway = mlCurrent?.outcomes?.find((o: any) => o.type === 'away')

  // Spread — home outcome spread is the home team's line (e.g. "16.5" = home +16.5)
  // Spread — SR OC API uses "handicap" field (not "spread") on outcome objects
  const spdHome = spdCurrent?.outcomes?.find((o: any) => o.type === 'home')
  const spdAway = spdCurrent?.outcomes?.find((o: any) => o.type === 'away')
  // We store spread_home as the away team's spread (negative = away favoured)
  // Convention: spread_home = -3.5 means home is -3.5 (favourite)
  // In SR data: home spread "16.5" means home is +16.5 (dog), away spread "-16.5" means away -16.5 (fav)
  // So spread_home = home outcome spread value as float
  // Try "handicap" first (SR OC API field name), fall back to "spread"
  const spreadHomeVal = toNum(spdCurrent?.spread)

  // Total
  const totOver  = totCurrent?.outcomes?.find((o: any) => o.type === 'over')
  const totUnder = totCurrent?.outcomes?.find((o: any) => o.type === 'under')
  const totalVal = toNum(totOver?.total ?? totCurrent?.total)

  return {
    spread_home:      spreadHomeVal,
    spread_home_odds: toNum(spdHome?.odds),
    spread_away_odds: toNum(spdAway?.odds),
    total:            totalVal,
    total_over_odds:  toNum(totOver?.odds),
    total_under_odds: toNum(totUnder?.odds),
    moneyline_home:   toNum(mlHome?.odds),
    moneyline_away:   toNum(mlAway?.odds),
  }
}

function parseFromMarkets(markets: any[]): ParsedOdds {
  const toNum = (v: any): number | null => {
    if (v == null) return null
    const n = parseFloat(String(v))
    return isNaN(n) ? null : n
  }

  // odds_type_id: 1 = 2way (moneyline), 3 = total, 4 = spread
  const mlMkt  = markets.find((m: any) => m.odds_type_id === 1 || m.name === '2way')
  const totMkt = markets.find((m: any) => m.odds_type_id === 3 || m.name === 'total')
  const spdMkt = markets.find((m: any) => m.odds_type_id === 4 || m.name === 'spread')

  const getOutcome = (market: any, type: string) => {
    if (!market) return null
    const book = market.books?.[0]
    if (!book) return null
    return book.outcomes?.find((o: any) => o.type === type) ?? null
  }

  const mlHome  = getOutcome(mlMkt, 'home')
  const mlAway  = getOutcome(mlMkt, 'away')
  const spdHome = getOutcome(spdMkt, 'home')
  const spdAway = getOutcome(spdMkt, 'away')
  const totOver = getOutcome(totMkt, 'over')
  const totUndr = getOutcome(totMkt, 'under')

  return {
    spread_home:      toNum(spdHome?.handicap ?? spdHome?.spread),
    spread_home_odds: toNum(spdHome?.odds),
    spread_away_odds: toNum(spdAway?.odds),
    total:            toNum(totOver?.total),
    total_over_odds:  toNum(totOver?.odds),
    total_under_odds: toNum(totUndr?.odds),
    moneyline_home:   toNum(mlHome?.odds),
    moneyline_away:   toNum(mlAway?.odds),
  }
}