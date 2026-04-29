// src/lib/msf/odds.ts
//
// CONFIRMED field structure from live MSF odds_gamelines response (April 9, 2026):
//
// Top level: data.gameLines[] = array of game entries
// Each entry:
//   entry.game.id                       ← game ID for matching
//   entry.lines[]                       ← array of bookmaker sources
//     source.source.name                ← "888Sport", "Bovada", etc.
//     source.pointSpreads[]
//       .asOfTime                       ← timestamp for line movement history
//       .pointSpread.gameSegment        ← filter: "FULL" only
//       .pointSpread.homeSpread         ← e.g. -4.5 (negative = home favourite)
//       .pointSpread.homeLine.american  ← e.g. -110
//       .pointSpread.awaySpread         ← e.g. 4.5
//       .pointSpread.awayLine.american  ← e.g. -110
//     source.overUnders[]
//       .asOfTime
//       .overUnder.gameSegment          ← filter: "FULL" only
//       .overUnder.overUnder            ← total line e.g. 236.5
//       .overUnder.overLine.american    ← e.g. -110
//       .overUnder.underLine.american   ← e.g. -110
//     source.moneyLines[]
//       .asOfTime
//       .moneyLine.gameSegment          ← filter: "FULL" only
//       .moneyLine.homeLine.american    ← e.g. -200
//       .moneyLine.awayLine.american    ← e.g. 160
//
// KEY: Each array is LINE MOVEMENT HISTORY — sort by asOfTime desc and take first
// KEY: Must filter gameSegment === 'FULL' to exclude halves/quarters
// ─────────────────────────────────────────────────────────────────────────────

import { msfFetch }                          from './client'
import { NormalizedGame }                    from './games'
import { SportKey, MSF_LEAGUE, getMSFSeason, getMSFSeasonCandidates } from './config'
import { roundToHalf } from '@/lib/utils/format'

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

function toMSFDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// Get the most recent FULL-game entry from a line movement history array
// betKey: 'pointSpread' | 'overUnder' | 'moneyLine'
function latestFull(entries: any[], betKey: string): any | null {
  const full = (entries || []).filter(e => e[betKey]?.gameSegment === 'FULL')
  if (full.length === 0) return null
  return full.sort((a, b) =>
    new Date(b.asOfTime).getTime() - new Date(a.asOfTime).getTime()
  )[0]
}

// Compute median of an array (robust consensus across bookmakers)
function median(arr: number[]): number | null {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid    = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// Parse a single gameLines entry into our flat ParsedOdds shape
function parseGameEntry(entry: any): ParsedOdds {
  const result: ParsedOdds = {
    spread_home: null, spread_home_odds: null, spread_away_odds: null,
    total: null, total_over_odds: null, total_under_odds: null,
    moneyline_home: null, moneyline_away: null,
  }

  const sources: any[] = entry.lines || []
  if (sources.length === 0) return result

  // Collect values across all bookmakers then consensus via median
  const spreads: number[]        = []
  const spreadHomeJuice: number[] = []
  const spreadAwayJuice: number[] = []
  const totals: number[]          = []
  const overJuice: number[]       = []
  const underJuice: number[]      = []
  const homeMl: number[]          = []
  const awayMl: number[]          = []

  for (const src of sources) {
    // ── Point Spread ───────────────────────────────────────────────────────
    const spdEntry = latestFull(src.pointSpreads || [], 'pointSpread')
    if (spdEntry) {
      const ps = spdEntry.pointSpread
      if (ps.homeSpread          != null) spreads.push(parseFloat(String(ps.homeSpread)))
      if (ps.homeLine?.american  != null) spreadHomeJuice.push(ps.homeLine.american)
      if (ps.awayLine?.american  != null) spreadAwayJuice.push(ps.awayLine.american)
    }

    // ── Over/Under ─────────────────────────────────────────────────────────
    const ouEntry = latestFull(src.overUnders || [], 'overUnder')
    if (ouEntry) {
      const ou = ouEntry.overUnder
      if (ou.overUnder           != null) totals.push(parseFloat(String(ou.overUnder)))
      if (ou.overLine?.american  != null) overJuice.push(ou.overLine.american)
      if (ou.underLine?.american != null) underJuice.push(ou.underLine.american)
    }

    // ── Moneyline ──────────────────────────────────────────────────────────
    const mlEntry = latestFull(src.moneyLines || [], 'moneyLine')
    if (mlEntry) {
      const ml = mlEntry.moneyLine
      if (ml.homeLine?.american  != null) homeMl.push(ml.homeLine.american)
      if (ml.awayLine?.american  != null) awayMl.push(ml.awayLine.american)
    }
  }

  result.spread_home      = median(spreads) !== null ? roundToHalf(median(spreads)!) : null
  result.spread_home_odds = median(spreadHomeJuice)
  result.spread_away_odds = median(spreadAwayJuice)
  result.total            = median(totals) !== null ? roundToHalf(median(totals)!) : null
  result.total_over_odds  = median(overJuice)
  result.total_under_odds = median(underJuice)
  result.moneyline_home   = median(homeMl)
  result.moneyline_away   = median(awayMl)

  return result
}

// ── Attach odds to a list of games (used by events route + cron) ──────────────
export async function attachOddsToGames(
  games:  NormalizedGame[],
  sport:  SportKey,
): Promise<NormalizedGame[]> {
  if (games.length === 0) return games

  const league     = MSF_LEAGUE[sport]
  const candidates = getMSFSeasonCandidates(sport)

  // MSF organizes odds by LOCAL game date, not UTC date.
  // A 10:30pm ET game has UTC date of next day — we must query both dates
  // to ensure we catch all games regardless of timezone crossover.
  const dateSet = new Set<string>()
  for (const g of games) {
    if (!g.commence_time) continue
    const utcDate = new Date(g.commence_time)
    dateSet.add(toMSFDate(utcDate))
    // Also add the day before UTC (= local US game date for late-night games)
    const prevDay = new Date(utcDate)
    prevDay.setUTCDate(prevDay.getUTCDate() - 1)
    dateSet.add(toMSFDate(prevDay))
  }

  const oddsMap = new Map<string, ParsedOdds>()

  for (const msfDate of Array.from(dateSet)) {
    // Try each season candidate — playoff slug first during playoff months
    for (const season of candidates) {
      try {
        const data     = await msfFetch<any>(league, season, `date/${msfDate}/odds_gamelines`)
        const entries: any[] = data.gameLines || []

        if (entries.length > 0) {
          for (const entry of entries) {
            const gameId = String(entry.game?.id ?? entry.schedule?.id ?? '')
            if (gameId) oddsMap.set(gameId, parseGameEntry(entry))
          }
          break  // Got odds for this date — don't try other season slugs
        }
      } catch (err: any) {
        console.warn(`[msf/odds] No odds for ${msfDate} (${sport}/${season}):`, err.message)
      }
    }
  }

  return games.map(g => {
    const odds = oddsMap.get(g.id)
    return odds ? { ...g, ...odds } : g
  })
}

// ── Standalone odds fetch for a specific date (diagnostic / admin use) ────────
export async function getOddsForDate(
  sport: SportKey,
  date:  Date,
): Promise<Map<string, ParsedOdds>> {
  const league     = MSF_LEAGUE[sport]
  const candidates = getMSFSeasonCandidates(sport)
  const msfDate    = toMSFDate(date)
  const map        = new Map<string, ParsedOdds>()

  for (const season of candidates) {
    try {
      const data    = await msfFetch<any>(league, season, `date/${msfDate}/odds_gamelines`)
      const entries = data.gameLines || []
      if (entries.length > 0) {
        for (const entry of entries) {
          const gameId = String(entry.game?.id ?? entry.schedule?.id ?? '')
          if (gameId) map.set(gameId, parseGameEntry(entry))
        }
        break  // Got odds — stop trying other seasons
      }
    } catch (err: any) {
      console.warn(`[msf/odds] getOddsForDate ${msfDate} (${season}):`, err.message)
    }
  }

  return map
}