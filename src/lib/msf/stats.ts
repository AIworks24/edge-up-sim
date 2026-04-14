// src/lib/msf/stats.ts
//
// Maps MySportsFeeds team_stats_totals response to the AdvancedStats
// shape consumed by the simulation engines.
//
// CONFIRMED field paths from live API (April 2026):
//
// NBA (maps to CBB sim engine):
//   stats.gamesPlayed                   = 80
//   stats.offense.ptsPerGame            = 118.4   → ppg
//   stats.defense.ptsAgainstPerGame     = 115.9   → opp_ppg
//   stats.fieldGoals.fgAttPerGame       = 91.9    → fga
//   stats.fieldGoals.fg3PtAttPerGame    = 39.4    → three_pa
//   stats.freeThrows.ftAttPerGame       = 21.5    → fta
//   stats.rebounds.offRebPerGame        = 10.9    → orb
//   stats.rebounds.defRebPerGame        = 32.6    → drb (proxy for opp_drb)
//   stats.defense.tovPerGame            = 13.4    → player_tov
//
// NFL (maps to NFLStatLine):
//   stats.gamesPlayed                           = 17
//   stats.standings.pointsFor                   / gamesPlayed → points_per_game
//   stats.standings.pointsAgainst               / gamesPlayed → points_allowed
//   stats.miscellaneous.offensePlays            / gamesPlayed → plays_per_game (pace)
//   stats.miscellaneous.offenseAvgYds           = 5.9          → yards_per_play
//   stats.passing.passInt + stats.fumbles.fumLost / gamesPlayed → turnover_rate
//   stats.miscellaneous.thirdDownsPct           / 100          → third_down_pct
//   stats.miscellaneous.fourthDownsPct          / 100          → red_zone_pct (proxy)
//   stats.passing.passNetYards                  / gamesPlayed  → yards_per_game (passing)
//   stats.rushing.rushYards                     / gamesPlayed  → rush_yards_per_game
// ─────────────────────────────────────────────────────────────────────────────

import { msfFetch }                          from './client'
import { SportKey, MSF_LEAGUE, getMSFSeason, getMSFSeasonCandidates } from './config'

// ── Types shared with the simulation engines ──────────────────────────────────

// Used by CBB (NCAAB/NBA) simulation engine — same shape as Sportradar stats
export interface AdvancedStats {
  ORtg:     number   // Offensive rating
  DRtg:     number   // Defensive rating
  Pace:     number   // Possessions per game
  ThreePAR: number   // 3-point attempt rate
  TOV:      number   // Turnover rate
  FTr:      number   // Free throw rate
  ORB:      number   // Offensive rebound %
}

export interface TeamSimStats {
  team_id:      string
  team_name:    string
  market:       string
  games_played: number
  season:       AdvancedStats
  last10:       AdvancedStats   // Falls back to season if gamelogs unavailable
  raw_season:   RawCBBStats
}

export interface RawCBBStats {
  ppg:             number
  opp_ppg:         number
  fga:             number
  three_pa:        number
  fta:             number
  orb:             number
  drb:             number
  player_tov:      number
  team_tov_total:  number
  games_played:    number
  opp_drb:         number
}

// Used by NFL simulation engine
export interface NFLTeamStats {
  name:   string
  season: NFLStatLine
  last5:  NFLStatLine
}

export interface NFLStatLine {
  points_per_game:          number
  points_allowed:           number
  plays_per_game:           number   // pace
  turnover_rate:            number   // turnovers per game
  red_zone_pct:             number   // proxy: thirdDownsPct (real RZ not in MSF)
  yards_per_play:           number
  yards_allowed_per_play:   number   // proxy: derived from opp yards
  third_down_pct:           number
}

// ── National averages ─────────────────────────────────────────────────────────
const NBA_NATIONAL_AVG: AdvancedStats = {
  ORtg: 113, DRtg: 113, Pace: 98,
  ThreePAR: 0.43, TOV: 0.14, FTr: 0.23, ORB: 0.25,
}

const NCAAB_NATIONAL_AVG: AdvancedStats = {
  ORtg: 104, DRtg: 104, Pace: 69,
  ThreePAR: 0.39, TOV: 0.18, FTr: 0.30, ORB: 0.30,
}

// ── CBB (NBA/NCAAB) stats derivation ─────────────────────────────────────────
// Same formulas as the existing Sportradar stats.ts — only field paths change

function deriveCBBStats(raw: RawCBBStats): AdvancedStats {
  const { ppg, opp_ppg, fga, three_pa, fta, orb, drb, player_tov, games_played } = raw

  // Pace: estimated possessions per game
  // FGA + 0.475*FTA - ORB + TOV (simplified Oliver formula)
  const tov_pg = player_tov
  const pace   = fga + 0.475 * fta - orb + tov_pg

  // ORtg: points per 100 possessions
  const ORtg = pace > 0 ? (ppg / pace) * 100 : 100

  // DRtg: opponent points per 100 possessions
  const DRtg = pace > 0 ? (opp_ppg / pace) * 100 : 100

  // ThreePAR: 3PA / FGA
  const ThreePAR = fga > 0 ? three_pa / fga : 0.39

  // TOV: turnover rate = TOV / (FGA + 0.44*FTA + TOV)
  const denomTOV = fga + 0.44 * fta + tov_pg
  const TOV      = denomTOV > 0 ? tov_pg / denomTOV : 0.18

  // FTr: free throw attempt rate = FTA / FGA
  const FTr = fga > 0 ? fta / fga : 0.30

  // ORB%: offensive rebound % = ORB / (ORB + opp_DRB)
  // opp_drb is estimated as our drb (roughly symmetric)
  const opp_drb = raw.opp_drb > 0 ? raw.opp_drb : drb
  const ORB     = (orb + opp_drb) > 0 ? orb / (orb + opp_drb) : 0.30

  return {
    ORtg:     Math.round(ORtg * 10) / 10,
    DRtg:     Math.round(DRtg * 10) / 10,
    Pace:     Math.round(pace * 10) / 10,
    ThreePAR: Math.round(ThreePAR * 1000) / 1000,
    TOV:      Math.round(TOV * 1000) / 1000,
    FTr:      Math.round(FTr * 1000) / 1000,
    ORB:      Math.round(ORB * 1000) / 1000,
  }
}

function extractCBBRaw(data: any): RawCBBStats {
  const s  = data.stats || {}
  const fg = s.fieldGoals  || {}
  const ft = s.freeThrows  || {}
  const rb = s.rebounds    || {}
  const of = s.offense     || {}
  const df = s.defense     || {}
  const gp = s.gamesPlayed || 1

  return {
    ppg:             of.ptsPerGame         ?? 100,
    opp_ppg:         df.ptsAgainstPerGame  ?? 100,
    fga:             fg.fgAttPerGame       ?? 80,
    three_pa:        fg.fg3PtAttPerGame    ?? 30,
    fta:             ft.ftAttPerGame       ?? 20,
    orb:             rb.offRebPerGame      ?? 10,
    drb:             rb.defRebPerGame      ?? 30,
    player_tov:      df.tovPerGame         ?? 13,
    team_tov_total:  (df.tov ?? 0),
    games_played:    gp,
    // MSF doesn't return opponent breakdown — use own drb as approximation
    opp_drb:         rb.defRebPerGame      ?? 30,
  }
}

// ── NFL stats extraction ──────────────────────────────────────────────────────

function extractNFLStatLine(data: any): NFLStatLine {
  const s    = data.stats        || {}
  const pass = s.passing         || {}
  const rush = s.rushing         || {}
  const misc = s.miscellaneous   || {}
  const fumb = s.fumbles         || {}
  const stnd = s.standings       || {}
  const gp   = s.gamesPlayed     || 1

  const points_per_game  = (stnd.pointsFor     || 0) / gp
  const points_allowed   = (stnd.pointsAgainst || 0) / gp
  const plays_per_game   = (misc.offensePlays  || 0) / gp
  const yards_per_play   = misc.offenseAvgYds  || 5.5
  const turnovers_game   = ((pass.passInt || 0) + (fumb.fumLost || 0)) / gp
  const third_down_pct   = (misc.thirdDownsPct || 40) / 100
  // Red zone: not in MSF data — use fourth down conversion as proxy
  // This is an approximation; a future enhancement could compute from gamelogs
  const red_zone_pct     = (misc.fourthDownsPct || 55) / 100

  // Yards allowed per play: MSF has no opponent yards — estimate from points allowed
  // Rough conversion: ~6 pts per scoring drive, ~7 plays/drive, ~5.5 yds/play baseline
  // Better approach: compute from opponent team stats (requires second API call)
  // For now use a league-avg-adjusted estimate based on points_allowed vs league avg
  const leagueAvgPts   = 23.4
  const ratio          = points_allowed > 0 ? points_allowed / leagueAvgPts : 1.0
  const yards_allowed  = 5.5 * ratio

  return {
    points_per_game:        Math.round(points_per_game   * 10) / 10,
    points_allowed:         Math.round(points_allowed    * 10) / 10,
    plays_per_game:         Math.round(plays_per_game    * 10) / 10,
    turnover_rate:          Math.round(turnovers_game    * 100) / 100,
    red_zone_pct:           Math.round(red_zone_pct      * 1000) / 1000,
    yards_per_play:         Math.round(yards_per_play    * 100) / 100,
    yards_allowed_per_play: Math.round(yards_allowed     * 100) / 100,
    third_down_pct:         Math.round(third_down_pct    * 1000) / 1000,
  }
}

// ── Rolling last-N stats from team gamelogs ───────────────────────────────────
// URL pattern (confirmed from API docs PDF): /date/{date}/team_gamelogs.json
// We fetch the last N days of completed games for this team

async function getLastNGameStats(
  teamId:  string,
  teamAbbr: string,
  sport:   SportKey,
  n:       number = 10,
): Promise<{ cbb?: AdvancedStats; nfl?: NFLStatLine } | null> {
  try {
    const league     = MSF_LEAGUE[sport]
    const candidates = getMSFSeasonCandidates(sport)
    const season     = candidates[0]  // Use most current season for gamelogs

    // Fetch gamelogs for the last 90 days — enough to capture last N games
    const toDate   = new Date()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 90)

    // CONFIRMED URL pattern (April 2026):
    //   /nba/2025-2026-regular/date/{YYYYMMDD}/team_gamelogs.json?team=bos
    // Must iterate individual dates — no date range in path.
    // The game appears on the date BEFORE its UTC startTime due to timezone offsets.

    const recentDates: string[] = []
    for (let i = 0; i < 21; i++) {   // scan last 21 days to find N game days
      const d = new Date()
      d.setDate(d.getDate() - i)
      recentDates.push(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`)
    }

    const allLogs: any[] = []
    for (const dateStr of recentDates) {
      if (allLogs.length >= n) break
      try {
        const data = await msfFetch<any>(league, season, `date/${dateStr}/team_gamelogs`, { team: teamAbbr })
        const dayLogs: any[] = data.teamGamelogTotals || data.gamelogs || []
        allLogs.unshift(...dayLogs)  // prepend so most recent is at end
      } catch {
        // No game on this date — continue
      }
    }

    // Take the most recent N
    const recent = allLogs.slice(-n)

    // CONFIRMED gamelog field paths from live API (April 2026):
    //   log.stats.offense.pts             = single-game points scored
    //   log.stats.defense.ptsAgainst      = single-game points allowed
    //   log.stats.fieldGoals.fgAtt        = single-game FGA
    //   log.stats.fieldGoals.fg3PtAtt     = single-game 3PA
    //   log.stats.freeThrows.ftAtt        = single-game FTA
    //   log.stats.rebounds.offReb         = single-game ORB
    //   log.stats.rebounds.defReb         = single-game DRB
    //   log.stats.defense.tov             = single-game TOV
    //   (same structure as season stats — just single-game totals)

    if (sport === 'nba' || sport === 'ncaab') {
      const avg = (field: (g: any) => number) =>
        recent.reduce((sum, g) => sum + (field(g) || 0), 0) / recent.length

      const raw: RawCBBStats = {
        ppg:             avg(g => g.stats?.offense?.pts         ?? 0),
        opp_ppg:         avg(g => g.stats?.defense?.ptsAgainst  ?? 0),
        fga:             avg(g => g.stats?.fieldGoals?.fgAtt    ?? 0),
        three_pa:        avg(g => g.stats?.fieldGoals?.fg3PtAtt ?? 0),
        fta:             avg(g => g.stats?.freeThrows?.ftAtt    ?? 0),
        orb:             avg(g => g.stats?.rebounds?.offReb     ?? 0),
        drb:             avg(g => g.stats?.rebounds?.defReb     ?? 0),
        player_tov:      avg(g => g.stats?.defense?.tov         ?? 0),
        team_tov_total:  0,
        games_played:    recent.length,
        opp_drb:         avg(g => g.stats?.rebounds?.defReb     ?? 0),
      }
      return { cbb: deriveCBBStats(raw) }
    }

    if (sport === 'nfl' || sport === 'ncaaf') {
      const avg = (field: (g: any) => number) =>
        recent.reduce((sum, g) => sum + (field(g) || 0), 0) / recent.length

      // Reconstruct season-style totals so extractNFLStatLine can normalise by gamesPlayed
      const fakeSeasonData = {
        stats: {
          gamesPlayed: recent.length,
          passing: {
            passInt:     avg(g => g.stats?.passing?.passInt    ?? 0) * recent.length,
          },
          fumbles: {
            fumLost:     avg(g => g.stats?.fumbles?.fumLost    ?? 0) * recent.length,
          },
          miscellaneous: {
            offensePlays:   avg(g => g.stats?.miscellaneous?.offensePlays  ?? 0) * recent.length,
            offenseAvgYds:  avg(g => g.stats?.miscellaneous?.offenseAvgYds ?? 0),
            thirdDownsPct:  avg(g => g.stats?.miscellaneous?.thirdDownsPct ?? 0),
            fourthDownsPct: avg(g => g.stats?.miscellaneous?.fourthDownsPct ?? 0),
          },
          standings: {
            pointsFor:     avg(g => g.stats?.offense?.pts        ?? 0) * recent.length,
            pointsAgainst: avg(g => g.stats?.defense?.ptsAgainst ?? 0) * recent.length,
          },
        },
      }
      return { nfl: extractNFLStatLine(fakeSeasonData) }
    }

    return null
  } catch (err: any) {
    console.warn(`[msf/stats] getLastNGameStats failed for ${teamAbbr}:`, err.message)
    return null
  }
}

// ── In-memory cache for team_stats_totals ────────────────────────────────────
// Avoids fetching all 30 teams on every simulation call (2 calls per sim).
// TTL: 5 minutes — enough to stay fresh for odds/lineup changes during a session.

const statsCache = new Map<string, { data: any; expires: number }>()

async function getAllTeamStats(league: string, season: string): Promise<any> {
  const key = `${league}/${season}`
  const cached = statsCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.data

  const data = await msfFetch<any>(league, season, 'team_stats_totals')
  statsCache.set(key, { data, expires: Date.now() + 5 * 60 * 1000 })
  return data
}

// ── Main export: getTeamStats ─────────────────────────────────────────────────
// Drop-in replacement for Sportradar's getTeamStats()
// teamId = MSF numeric team ID (string), sport = 'nba' | 'nfl' | 'ncaab'

export async function getTeamStats(
  teamId: string,
  sport:  SportKey,
): Promise<TeamSimStats> {
  const league = MSF_LEAGUE[sport]
  const season = getMSFSeason(sport)

  // CRITICAL: Do NOT pass { team: teamId } as a filter here.
  // MSF's team_stats_totals filter silently fails with numeric IDs, returning
  // all 30 teams. Taking [0] then gives every team the same (first alphabetical)
  // stats — producing near-zero fair spreads and 200%+ fake edge scores.
  //
  // Fix: fetch all teams once (cached), find the correct team by numeric ID.
  const data      = await getAllTeamStats(league, season)
  const allTeams: any[] = data.teamStatsTotals || []

  // Match by numeric team ID (primary) or abbreviation (fallback)
  const teamData = allTeams.find((t: any) => String(t.team?.id) === String(teamId))
    ?? allTeams.find((t: any) => t.team?.abbreviation?.toUpperCase() === teamId.toUpperCase())

  if (!teamData) throw new Error(`[msf/stats] No stats found for team ${teamId} (${sport}) — available IDs: ${allTeams.map((t: any) => t.team?.id).join(', ')}`)

  const team   = teamData.team  || {}
  const abbr   = team.abbreviation || teamId
  const name   = team.name         || abbr
  const city   = team.city         || ''

  if (sport === 'nba' || sport === 'ncaab') {
    const raw          = extractCBBRaw(teamData)
    const seasonStats  = deriveCBBStats(raw)

    // Try to get last-10 game rolling stats — fall back to season if unavailable
    let last10Stats = seasonStats
    try {
      const rolling = await getLastNGameStats(teamId, abbr, sport, 10)
      if (rolling?.cbb) last10Stats = rolling.cbb
    } catch {
      // Gamelogs may not be available mid-season or off-season
    }

    return {
      team_id:      teamId,
      team_name:    name,
      market:       city,
      games_played: raw.games_played,
      season:       seasonStats,
      last10:       last10Stats,
      raw_season:   raw,
    }
  }

  // NFL/NCAAF — return NFL shape wrapped in TeamSimStats for compatibility
  // The NFL sim engine reads req.home_team_stats / req.away_team_stats separately
  const seasonLine = extractNFLStatLine(teamData)
  let last5Line    = seasonLine
  try {
    const rolling = await getLastNGameStats(teamId, abbr, sport, 5)
    if (rolling?.nfl) last5Line = rolling.nfl
  } catch {
    // Fall back to season stats
  }

  // Store NFL stats in a compatible wrapper
  // Claude-agent.ts will read these from req.nfl_home_stats / req.nfl_away_stats
  const raw: RawCBBStats = {
    ppg:             seasonLine.points_per_game,
    opp_ppg:         seasonLine.points_allowed,
    fga:             seasonLine.plays_per_game,
    three_pa:        0,
    fta:             0,
    orb:             0,
    drb:             0,
    player_tov:      seasonLine.turnover_rate,
    team_tov_total:  0,
    games_played:    teamData.stats?.gamesPlayed || 1,
    opp_drb:         0,
  }

  // Attach NFL-specific stats as extended properties
  const simStats: any = {
    team_id:      teamId,
    team_name:    name,
    market:       city,
    games_played: raw.games_played,
    season:       deriveCBBStats(raw),  // placeholder — NFL engine ignores this
    last10:       deriveCBBStats(raw),
    raw_season:   raw,
    // NFL-specific — read by NFL sim engine
    nfl_season:   seasonLine,
    nfl_last5:    last5Line,
  }

  return simStats as TeamSimStats
}

// ── Export NFL stat extractor for direct use ──────────────────────────────────
export { extractNFLStatLine, extractCBBRaw, deriveCBBStats }
export type { AdvancedStats as CBBAdvancedStats }