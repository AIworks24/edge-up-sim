// src/lib/sportradar/games.ts
//
// CONFIRMED from live SportRadar API (schedule endpoint):
//   game.home.name   = "Maryland Terrapins"  (full name — NO separate market field)
//   game.home.id     = UUID for stats calls
//   game.home.alias  = "MD"
//   game.home_points = final score (top-level, NOT game.home.points)
//   game.away_points = final score (top-level)
//   game.venue.neutral_site = boolean (on venue, NOT game root)
//   game.status      = "scheduled" | "time-tbd" | "inprogress" | "closed"
//   game.scheduled   = ISO datetime
//   game.season.year = 2025 (for 2025-26 season)
// ─────────────────────────────────────────────────────────────────────────────

import { srFetch } from './client'
import { SportKey } from './config'

export interface NormalizedGame {
  id:            string
  sport:         SportKey
  status:        string
  commence_time: string    // ISO — kept same field name as Odds API for frontend compat
  season_year:   number

  home_team:     string    // Full name e.g. "Maryland Terrapins"
  away_team:     string
  home_team_id:  string    // SR UUID — needed for stats API calls
  away_team_id:  string
  home_alias:    string    // e.g. "MD"
  away_alias:    string

  venue_name:    string
  neutral_site:  boolean

  // Final scores (only when status === 'closed')
  home_score:    number | null
  away_score:    number | null

  // Odds — attached later via attachOddsToGames()
  spread_home:      number | null
  spread_home_odds: number | null
  spread_away_odds: number | null
  total:            number | null
  total_over_odds:  number | null
  total_under_odds: number | null
  moneyline_home:   number | null
  moneyline_away:   number | null
}

// ── Today's games ─────────────────────────────────────────────────────────────
export async function getTodaysGames(sport: SportKey): Promise<NormalizedGame[]> {
  const { y, m, d } = todayParts()
  const endpoint = dailyScheduleEndpoint(sport, y, m, d)
  const data     = await srFetch<any>(endpoint)
  return (data.games || []).map((g: any) => normalizeGame(g, sport))
}

// ── Upcoming games (used by cron + game listings) ─────────────────────────────
export async function getUpcomingGames(sport: SportKey, days = 3): Promise<NormalizedGame[]> {
  const all: NormalizedGame[] = []

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')

    try {
      const data  = await srFetch<any>(dailyScheduleEndpoint(sport, y, m, d))
      const games = (data.games || [])
        .filter((g: any) => g.status === 'scheduled' || g.status === 'time-tbd')
        .map((g: any) => normalizeGame(g, sport))
      all.push(...games)
    } catch {
      // No games on this date — continue silently
    }
  }
  return all
}

// ── Game result (for score-update cron) ──────────────────────────────────────
export async function getGameResult(gameId: string, sport: SportKey): Promise<{
  status:     string
  home_score: number | null
  away_score: number | null
} | null> {
  try {
    // FIX: game summary is flat — data.status, data.home.points (NOT data.game.*)
    const sportPath = sport === 'ncaab' ? 'ncaamb' : sport
    const data      = await srFetch<any>(
      `/${sportPath}/trial/v8/en/games/${gameId}/summary.json`
    )
    return {
      status:     data.status       || 'unknown',
      home_score: data.home?.points ?? null,
      away_score: data.away?.points ?? null,
    }
  } catch {
    return null
  }
}

// ── URL builder ───────────────────────────────────────────────────────────────
function dailyScheduleEndpoint(sport: SportKey, y: number, m: string, d: string): string {
  const sportPath = sport === 'ncaab' ? 'ncaamb' : sport  // FIX: ncaab → ncaamb
  return `/${sportPath}/trial/v8/en/games/${y}/${m}/${d}/schedule.json`
}

// ── Normalize raw SportRadar schedule game object ─────────────────────────────
function normalizeGame(raw: any, sport: SportKey): NormalizedGame {
  const seasonYear = raw.season?.year ?? new Date().getFullYear()

  const srNeutral   = raw.venue?.neutral_site === true
  const hasRound    = raw.round != null
  const venueName   = (raw.venue?.name || '').toLowerCase()
  // NCAA tournament games are at neutral venues that don't belong to either team.
  // Detect by checking if venue city is NOT the home team's city.
  // Simpler: flag known tournament arena names. This list covers 2026 NCAA brackets.
  const NEUTRAL_VENUE_KEYWORDS = [
    'bon secours',   // Greenville SC — First/Second Round 2026
    'spectrum center',  // Charlotte NC  
    'ball arena',    // Denver CO
    'gainbridge',    // Indianapolis
    'barclays',      // Brooklyn
    'ppg paints',    // Pittsburgh
    'lenovo center', // Raleigh
    'amalie',        // Tampa
    'rocket mortgage', // Cleveland
    'enterprise center', // St. Louis
    'target center', // Minneapolis
    'paycom',        // Oklahoma City
    'bok center',    // Tulsa
    'mvp arena',     // Albany
    'chi health',    // Omaha
    'spokane',       // Spokane
    'united center', // Chicago
    'kfc yum',       // Louisville
    'fiserv',        // Milwaukee
    'golden 1',      // Sacramento
    'sap center',    // San Jose
    'moda center',   // Portland
    'climate pledge', // Seattle
    'toyota center', // Houston
    'american airlines', // Dallas
    'frost bank',    // San Antonio
  ]
  const isNeutralVenue = NEUTRAL_VENUE_KEYWORDS.some(kw => venueName.includes(kw))
  const neutralSite = srNeutral || hasRound || isNeutralVenue

  // FIX: game.home.name already contains full team name ("Maryland Terrapins")
  // There is NO game.home.market at the schedule level — don't try to concat them
  const homeName = raw.home?.name || 'TBD'
  const awayName = raw.away?.name || 'TBD'

  // FIX: final scores are game.home_points / game.away_points (top-level)
  // NOT game.home.points — those don't exist in the schedule response
  return {
    id:            raw.id              || '',
    sport,
    status:        raw.status          || 'scheduled',
    commence_time: raw.scheduled       || new Date().toISOString(),
    season_year:   seasonYear,

    home_team:     homeName,
    away_team:     awayName,
    home_team_id:  raw.home?.id        || '',
    away_team_id:  raw.away?.id        || '',
    home_alias:    raw.home?.alias     || '',
    away_alias:    raw.away?.alias     || '',

    venue_name:    raw.venue?.name     || '',
    neutral_site:  neutralSite,

    home_score:    raw.home_points     ?? null,
    away_score:    raw.away_points     ?? null,

    // Odds populated later by attachOddsToGames()
    spread_home:      null,
    spread_home_odds: null,
    spread_away_odds: null,
    total:            null,
    total_over_odds:  null,
    total_under_odds: null,
    moneyline_home:   null,
    moneyline_away:   null,
  }
}

function todayParts() {
  const now = new Date()
  return {
    y: now.getFullYear(),
    m: String(now.getMonth() + 1).padStart(2, '0'),
    d: String(now.getDate()).padStart(2, '0'),
  }
}