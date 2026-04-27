// src/lib/msf/games.ts
//
// CONFIRMED field paths from live MSF API diagnostic (April 2026):
//   game.schedule.id                    = 134312
//   game.schedule.week                  = 1           (NFL only)
//   game.schedule.startTime             = "2024-09-06T00:20:00.000Z"
//   game.schedule.playedStatus          = "COMPLETED" | "UNPLAYED" | "LIVE"
//   game.schedule.awayTeam.id           = 56
//   game.schedule.awayTeam.abbreviation = "BAL"
//   game.schedule.homeTeam.id           = 73
//   game.schedule.homeTeam.abbreviation = "KC"
//   game.schedule.venue.name            = "GEHA Field at Arrowhead Stadium"
//   game.schedule.venueAllegiance       = "HOME" | "NEUTRAL"
//   game.score.awayScoreTotal           = 20
//   game.score.homeScoreTotal           = 27
// ─────────────────────────────────────────────────────────────────────────────

import { msfFetch }                                     from './client'
import { SportKey, MSF_LEAGUE, getMSFSeason, getMSFSeasonCandidates, getTeamName } from './config'

export interface NormalizedGame {
  id:            string
  sport:         SportKey
  status:        string
  commence_time: string      // ISO — same field name as existing codebase
  season_year:   number

  home_team:     string      // Full name e.g. "Kansas City Chiefs"
  away_team:     string
  home_team_id:  string      // MSF numeric ID as string — used for stats calls
  away_team_id:  string
  home_alias:    string      // Abbreviation e.g. "KC"
  away_alias:    string

  venue_name:    string
  neutral_site:  boolean

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

function normalizeStatus(playedStatus: string): string {
  const s = (playedStatus || '').toUpperCase()
  if (s === 'COMPLETED')                  return 'completed'
  if (s === 'LIVE' || s === 'INPROGRESS') return 'inprogress'
  return 'scheduled'  // UNPLAYED, POSTPONED, SUSPENDED, etc.
}

function normalizeGame(raw: any, sport: SportKey): NormalizedGame {
  const sched = raw.schedule || {}
  const score = raw.score    || {}

  const homeAbbr   = sched.homeTeam?.abbreviation || ''
  const awayAbbr   = sched.awayTeam?.abbreviation || ''
  const status     = normalizeStatus(sched.playedStatus || '')
  const startTime  = sched.startTime || ''
  const seasonYear = startTime ? new Date(startTime).getFullYear() : new Date().getFullYear()

  return {
    id:            String(sched.id),
    sport,
    status,
    commence_time: startTime,
    season_year:   seasonYear,

    home_team:    getTeamName(homeAbbr, sport),
    away_team:    getTeamName(awayAbbr, sport),
    home_team_id: String(sched.homeTeam?.id || ''),
    away_team_id: String(sched.awayTeam?.id || ''),
    home_alias:   homeAbbr,
    away_alias:   awayAbbr,

    venue_name:   sched.venue?.name || '',
    // venueAllegiance === 'NEUTRAL' = neutral site (bowl games, playoff sites)
    neutral_site: sched.venueAllegiance === 'NEUTRAL',

    home_score: status === 'completed' ? (score.homeScoreTotal ?? null) : null,
    away_score: status === 'completed' ? (score.awayScoreTotal ?? null) : null,

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

// ── Format date as YYYYMMDD for MSF date-scoped endpoints ────────────────────
function toMSFDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// ── Fetch upcoming games (next N days) ───────────────────────────────────────
// Used by the cron job and /api/sports/events
export async function getUpcomingGames(sport: SportKey, days = 7): Promise<NormalizedGame[]> {
  const league     = MSF_LEAGUE[sport]
  const candidates = getMSFSeasonCandidates(sport)
  const all: NormalizedGame[] = []

  for (let i = 0; i < days; i++) {
    const date    = new Date()
    date.setDate(date.getDate() + i)
    const msfDate = toMSFDate(date)

    // Try each season candidate in order — first one that returns games wins
    for (const season of candidates) {
      try {
        const data  = await msfFetch<any>(league, season, `date/${msfDate}/games`)
        const games = (data.games || []).filter((g: any) =>
          normalizeStatus(g.schedule?.playedStatus || '') !== 'completed'
        )
        if (games.length > 0) {
          all.push(...games.map((g: any) => normalizeGame(g, sport)))
          break  // Found games for this date — don't try other season slugs
        }
      } catch {
        // This season slug returned nothing for this date — try next candidate
      }
    }
  }

  return all
}

// ── Fetch all games for a full season (used for admin/cron full refresh) ─────
export async function getAllGames(sport: SportKey, season?: string): Promise<NormalizedGame[]> {
  const league = MSF_LEAGUE[sport]
  const s      = season || getMSFSeason(sport)
  const data   = await msfFetch<any>(league, s, 'games')
  return (data.games || []).map((g: any) => normalizeGame(g, sport))
}

// ── Fetch a single game result (for score-update cron) ───────────────────────
export async function getGameResult(
  gameId: string,
  sport:  SportKey,
): Promise<{ status: string; home_score: number | null; away_score: number | null } | null> {
  try {
    const league = MSF_LEAGUE[sport]
    const season = getMSFSeason(sport)
    // MSF game lookup: filter the full schedule by id — no single-game endpoint
    // Use the season games feed and find by id
    const data   = await msfFetch<any>(league, season, 'games')
    const game   = (data.games || []).find((g: any) => String(g.schedule?.id) === gameId)
    if (!game) return null

    const status = normalizeStatus(game.schedule?.playedStatus || '')
    return {
      status,
      home_score: game.score?.homeScoreTotal ?? null,
      away_score: game.score?.awayScoreTotal ?? null,
    }
  } catch {
    return null
  }
}