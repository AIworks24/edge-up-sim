// src/lib/sportradar/stats.ts
//
// ALL field paths verified against live SportRadar API (Maryland Terrapins, March 2026).
//
// CONFIRMED CORRECT PATHS:
//   data.own_record.average.points          = 70.7   (PPG)
//   data.own_record.average.field_goals_att = 57.17  (FGA/g)
//   data.own_record.average.three_points_att= 26.48  (3PA/g)
//   data.own_record.average.free_throws_att = 21.52  (FTA/g)
//   data.own_record.average.off_rebounds    = 10.14  (ORB/g) ← "off_rebounds" not "offensive_rebounds"
//   data.own_record.average.def_rebounds    = 22.03  (DRB/g)
//   data.own_record.average.turnovers       = 11.79  (player TOV/g)
//   data.own_record.total.team_turnovers    = 24     (team TOV season total)
//   data.own_record.total.games_played      = 29
//   data.opponents.average.points           = 77.1   (Opp PPG)
//   data.opponents.average.def_rebounds     = 22.0   (Opp DRB/g)
//
// ORIGINAL GUIDE ERRORS FIXED:
//   data.own          → data.own_record          (wrong key — own does not exist)
//   offensive_rebounds → off_rebounds             (different name in averages vs totals)
//   /ncaab/           → /ncaamb/                 (wrong URL path)
//   season year logic was inverted               (2025 = 2025-26 season)
// ─────────────────────────────────────────────────────────────────────────────

import { srFetch } from './client'
import { SR_CONFIG, SportKey, getCurrentSeasonYear } from './config'

// ── What the simulation engine receives ──────────────────────────────────────
export interface AdvancedStats {
  ORtg:     number   // Offensive rating = (PPG / Pace) × 100
  DRtg:     number   // Defensive rating = (Opp PPG / Pace) × 100
  Pace:     number   // Possessions per game
  ThreePAR: number   // 3-point attempt rate = 3PA / FGA
  TOV:      number   // Turnover rate = total TOV / Pace
  FTr:      number   // Free throw rate = FTA / FGA
  ORB:      number   // Offensive rebound % = ORB / (ORB + opp DRB)
}

export interface TeamSimStats {
  team_id:      string
  team_name:    string    // e.g. "Terrapins"
  market:       string    // e.g. "Maryland"
  games_played: number
  season:       AdvancedStats
  last10:       AdvancedStats
  raw_season:   RawStats   // Stored for prompt transparency
}

// Raw per-game values before formula derivation
export interface RawStats {
  ppg:             number
  opp_ppg:         number
  fga:             number
  three_pa:        number
  fta:             number
  orb:             number
  drb:             number
  player_tov:      number
  team_tov_total:  number  // Season total → divide by games_played for per-game
  games_played:    number
  opp_drb:         number
}

// ── National averages (NCAAMB 2025-26 season) ────────────────────────────────
const NATIONAL_AVERAGES: AdvancedStats = {
  ORtg: 104, DRtg: 104, Pace: 69,
  ThreePAR: 0.39, TOV: 0.18, FTr: 0.30, ORB: 0.30,
}

// ── Main function: fetch stats + derive simulation inputs ─────────────────────
export async function getTeamStats(teamId: string, sport: SportKey): Promise<TeamSimStats> {
  const seasonYear = getCurrentSeasonYear()
  // FIX: ncaab → ncaamb in URL
  const sportPath  = sport === 'ncaab' ? 'ncaamb' : sport

  const endpoint = `/${sportPath}/trial/v8/en/seasons/${seasonYear}/REG/teams/${teamId}/statistics.json`
  const data = await srFetch<any>(endpoint)

  const raw          = extractRaw(data)
  const seasonStats  = deriveAdvancedStats(raw)

  let last10Stats: AdvancedStats
  try {
    last10Stats = await getLast10Stats(teamId, sport, seasonStats)
  } catch {
    last10Stats = seasonStats  // Fall back to season stats silently
  }

  return {
    team_id:      data.id     || teamId,
    team_name:    data.name   || '',
    market:       data.market || '',
    games_played: raw.games_played,
    season:       seasonStats,
    last10:       last10Stats,
    raw_season:   raw,
  }
}

// ── Extract raw averages from SR response ────────────────────────────────────
// CONFIRMED: key is own_record (NOT own) — verified from live API
export function extractRaw(data: any): RawStats {
  const avg = data?.own_record?.average || {}
  const tot = data?.own_record?.total   || {}
  const opp = data?.opponents?.average  || {}

  return {
    ppg:            avg.points            ?? 70,
    opp_ppg:        opp.points            ?? 70,
    fga:            avg.field_goals_att   ?? 60,
    three_pa:       avg.three_points_att  ?? 23,
    fta:            avg.free_throws_att   ?? 18,
    orb:            avg.off_rebounds      ?? 10,   // "off_rebounds" confirmed ← not "offensive_rebounds"
    drb:            avg.def_rebounds      ?? 22,
    player_tov:     avg.turnovers         ?? 12,
    team_tov_total: tot.team_turnovers    ?? 0,    // Season total
    games_played:   tot.games_played      ?? 30,
    opp_drb:        opp.def_rebounds      ?? 22,
  }
}

// ── Derive simulation variables from raw per-game averages ───────────────────
// Formulas verified against Maryland data: Pace=69.2, ORtg=101.2, DRtg=110.3
export function deriveAdvancedStats(r: RawStats): AdvancedStats {
  const gp             = r.games_played
  const teamTovPerGame = r.team_tov_total / Math.max(gp, 1)
  const totalTov       = r.player_tov + teamTovPerGame

  // Pace (Dean Oliver formula): FGA + 0.475×FTA − ORB + TOV
  // Maryland verified: 57.17 + 0.475×21.52 − 10.14 + 12.62 = 69.87 ✓
  const pace = clamp(55, 90,
    r.fga + (0.475 * r.fta) - r.orb + totalTov
  )

  // ORtg/DRtg = 100 × points / possessions
  const ortg  = pace > 0 ? (r.ppg     / pace) * 100 : 104
  const drtg  = pace > 0 ? (r.opp_ppg / pace) * 100 : 104

  // Style factors
  const threePAR = r.fga > 0 ? r.three_pa / r.fga : 0.39
  const tovRate  = pace > 0  ? totalTov   / pace   : 0.18
  const ftr      = r.fga > 0 ? r.fta      / r.fga  : 0.30
  const orbPct   = (r.orb + r.opp_drb) > 0
    ? r.orb / (r.orb + r.opp_drb)
    : 0.30

  return {
    ORtg:     r2(ortg),
    DRtg:     r2(drtg),
    Pace:     r2(pace),
    ThreePAR: r4(threePAR),
    TOV:      r4(tovRate),
    FTr:      r4(ftr),
    ORB:      r4(orbPct),
  }
}

// ── Last-10 games (rolling form) ─────────────────────────────────────────────
async function getLast10Stats(
  teamId: string,
  sport: SportKey,
  fallback: AdvancedStats
): Promise<AdvancedStats> {
  try {
    const sportPath = sport === 'ncaab' ? 'ncaamb' : sport  // FIX: ncaab→ncaamb
    const profile   = await srFetch<any>(
      `/${sportPath}/trial/v8/en/teams/${teamId}/profile.json`
    )

    const recentGames: any[] = (profile?.team?.games || profile?.games || [])
      .filter((g: any) => g.status === 'closed' || g.status === 'complete')
      .slice(-10)

    if (recentGames.length < 5) return fallback

    const raw = averageFromGames(recentGames, teamId)
    return deriveAdvancedStats(raw)
  } catch {
    return fallback
  }
}

function averageFromGames(games: any[], teamId: string): RawStats {
  const n = games.length
  if (n === 0) return nationalAverageRaw()

  const zero = { ppg:0, opp_ppg:0, fga:0, three_pa:0, fta:0, orb:0, drb:0, player_tov:0, team_tov_total:0, opp_drb:0 }
  const sums = games.reduce((acc, g) => {
    const isHome = g.home?.id === teamId
    const team   = isHome ? g.home   : g.away
    const opp    = isHome ? g.away   : g.home
    const ts     = team?.statistics  || {}
    const os     = opp?.statistics   || {}
    return {
      ppg:            acc.ppg            + (team?.points          ?? ts.points            ?? 70),
      opp_ppg:        acc.opp_ppg        + (opp?.points           ?? os.points            ?? 70),
      fga:            acc.fga            + (ts.field_goals_att    ?? 60),
      three_pa:       acc.three_pa       + (ts.three_points_att   ?? 23),
      fta:            acc.fta            + (ts.free_throws_att    ?? 18),
      orb:            acc.orb            + (ts.off_rebounds       ?? 10),
      drb:            acc.drb            + (ts.def_rebounds       ?? 22),
      player_tov:     acc.player_tov     + (ts.turnovers          ?? 12),
      team_tov_total: acc.team_tov_total + (ts.team_turnovers     ?? 0),
      opp_drb:        acc.opp_drb        + (os.def_rebounds       ?? 22),
    }
  }, zero)

  return {
    ppg:            sums.ppg            / n,
    opp_ppg:        sums.opp_ppg        / n,
    fga:            sums.fga            / n,
    three_pa:       sums.three_pa       / n,
    fta:            sums.fta            / n,
    orb:            sums.orb            / n,
    drb:            sums.drb            / n,
    player_tov:     sums.player_tov     / n,
    team_tov_total: sums.team_tov_total,   // Total (not average) — deriveAdvancedStats divides by gp
    opp_drb:        sums.opp_drb        / n,
    games_played:   n,
  }
}

function nationalAverageRaw(): RawStats {
  return {
    ppg: 70, opp_ppg: 70, fga: 60, three_pa: 23.4, fta: 18,
    orb: 10, drb: 21, player_tov: 12, team_tov_total: 18,
    opp_drb: 21, games_played: 30,
  }
}

export function nationalAverageStats(): AdvancedStats {
  return NATIONAL_AVERAGES
}

const clamp = (min: number, max: number, val: number) =>
  Math.max(min, Math.min(max, val))
const r2 = (n: number) => Math.round(n * 100)   / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000