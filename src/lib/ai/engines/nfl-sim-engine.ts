// src/lib/ai/engines/nfl-sim-engine.ts
//
// NFL Drive-Outcome Monte Carlo Simulation Engine
// Two-stage model from NCAA_NFL_SIM_Model.xlsx (FB PARAM Engine — NFL column):
//   Stage 1 — Turnover probability per drive
//   Stage 2 — Sustained drive → TD (7pts) / FG (3pts) / Empty (0pts)
//
// Also exports shared types and helpers used by ncaaf-sim-engine.ts,
// following the same import pattern that nba-sim-engine uses from cbb-sim-engine.
//
// Input: NFLGameInput (home/away NFLTeamStats + lines)
// Output: CBBSimResults — drop-in compatible with claude-agent.ts pipeline
// ─────────────────────────────────────────────────────────────────────────────

import { RECOMMENDATION_THRESHOLD } from '../edge-classifier'
import {
  CBBSimResults, BetEdge, BetSide,
} from './cbb-sim-engine'

// Re-export for downstream consumers (ncaaf-sim-engine, claude-agent)
export type { CBBSimResults, BetEdge, BetSide }

// ── NFL stat types ────────────────────────────────────────────────────────────
// Mirrors the NFLStatLine already in stats.ts (kept here so engine layer
// has no dependency on the MSF layer)
export interface NFLStatLine {
  points_per_game:   number  // standings.pointsFor / gp
  points_allowed:    number  // standings.pointsAgainst / gp
  plays_per_game:    number  // miscellaneous.offensePlays / gp
  yards_per_play:    number  // miscellaneous.offenseAvgYds
  turnover_rate:     number  // (passInt + fumLost) / gp
  third_down_pct:    number  // miscellaneous.thirdDownsPct / 100
  red_zone_pct:      number  // hardcoded 0.58 NFL / 0.62 NCAAF — no MSF RZ field
  sacks_allowed_pg:  number  // passing.passSacks / gp
  havoc_rate:        number  // (tackles.sacks + TFLs) / def_snaps_per_game
  def_turnovers_pg:  number  // (def_INTs + fum_forced) / gp
}

export interface NFLTeamStats {
  name:   string
  season: NFLStatLine
  last5:  NFLStatLine
}

export interface NFLGameInput {
  home:         NFLTeamStats
  away:         NFLTeamStats
  spread_home:  number   // negative = home fav (e.g. -3.5)
  total:        number   // O/U line
  odds_spread:  number   // American odds for home spread
  odds_total:   number   // American odds for Over
  odds_ml_home: number
  odds_ml_away: number
  neutral_site: boolean
}

// ── NFL Drive-Outcome parameters ──────────────────────────────────────────────
// Source: NCAA_NFL_SIM_Model.xlsx → FB PARAM Engine sheet — NFL column
export interface FBSimParams {
  // League baselines
  Lg_Avg_PPD:             number
  Lg_Avg_Drives:          number
  Lg_Avg_YPP:             number
  Lg_Avg_Success:         number
  Lg_Avg_Explosive:       number
  Lg_Avg_TO_Per_Drive:    number
  Lg_Avg_3D_Conv:         number
  Lg_Avg_RZ_TD:           number
  Lg_Avg_Plays_Per_Drive: number
  // Profile weights
  W_Season:   number
  W_Recent:   number
  // Matchup weights
  W_Offense:  number
  W_Defense:  number
  W_Regress:  number
  // Drive volume
  K_Tempo:                number
  K_PlaysPerDrive:        number
  K_Explosive_DriveBoost: number
  Min_Drives:             number
  Max_Drives:             number
  // Turnover
  Base_TO_Prob:     number
  K_TO_Edge:        number
  K_Sack_TO:        number
  Lg_Avg_Sacks_PD:  number  // league-avg sacks allowed per drive
  TO_Floor:         number
  TO_Ceiling:       number
  Lg_Avg_Havoc:     number  // league-avg defensive havoc rate per snap
  // Sustain
  Base_Sustain_Prob: number
  K_Success:         number
  K_3D:              number
  K_YPP:             number
  K_Explosive:       number
  K_Havoc:           number
  Sustain_Floor:     number
  Sustain_Ceiling:   number
  // TD | Sustained
  Base_TD_Given_Sustain: number
  K_RZTD:               number
  K_Finish_YPP:         number
  K_Explosive_Finish:   number
  TD_Floor:             number
  TD_Ceiling:           number
  // FG | Sustained
  Base_FG_Given_Sustain: number
  K_FG_Defense:          number
  K_Stall:               number
  K_Explosive_FG_Offset: number
  FG_Floor:              number
  FG_Ceiling:            number
  // Home field
  Home_Field_Points: number
  K_Home_Sustain:    number
  K_Home_TO:         number
  // Variance / correlation
  Base_Drive_Variance:      number
  Explosive_Variance_Boost: number
  TO_Variance_Boost:        number
  Score_Correlation:        number
  // Simulation count
  Sims_N: number
}

// NFL params — source: FB PARAM Engine sheet, NFL column
export const NFL_PARAMS: FBSimParams = {
  Lg_Avg_PPD: 2.05, Lg_Avg_Drives: 10.5, Lg_Avg_YPP: 5.5,
  Lg_Avg_Success: 0.45, Lg_Avg_Explosive: 0.10,
  Lg_Avg_TO_Per_Drive: 0.10, Lg_Avg_3D_Conv: 0.41,
  Lg_Avg_RZ_TD: 0.58, Lg_Avg_Plays_Per_Drive: 5.9,

  W_Season: 0.55, W_Recent: 0.30,
  W_Offense: 0.42, W_Defense: 0.42, W_Regress: 0.16,

  K_Tempo: 0.25, K_PlaysPerDrive: 0.25, K_Explosive_DriveBoost: 0.15,
  Min_Drives: 8, Max_Drives: 13,

  Base_TO_Prob: 0.10, K_TO_Edge: 0.35, K_Sack_TO: 0.18,
  Lg_Avg_Sacks_PD: 0.238,   // NFL avg: ~2.5 sacks/game ÷ 10.5 drives
  TO_Floor: 0.03, TO_Ceiling: 0.28,
  Lg_Avg_Havoc: 0.088,      // NFL avg confirmed: (1.76 sacks + 4.18 TFLs) / 67.4 snaps

  Base_Sustain_Prob: 0.45,
  K_Success: 0.42, K_3D: 0.22, K_YPP: 0.16, K_Explosive: 0.14,
  K_Havoc: -0.20,
  Sustain_Floor: 0.18, Sustain_Ceiling: 0.80,

  Base_TD_Given_Sustain: 0.52,
  K_RZTD: 0.38, K_Finish_YPP: 0.12, K_Explosive_Finish: 0.10,
  TD_Floor: 0.22, TD_Ceiling: 0.82,

  Base_FG_Given_Sustain: 0.30,
  K_FG_Defense: 0.10, K_Stall: 0.08, K_Explosive_FG_Offset: -0.06,
  FG_Floor: 0.08, FG_Ceiling: 0.45,

  Home_Field_Points: 1.8, K_Home_Sustain: 0.01, K_Home_TO: -0.005,

  Base_Drive_Variance: 0.9, Explosive_Variance_Boost: 0.12, TO_Variance_Boost: 0.14,
  Score_Correlation: 0.10,
  Sims_N: 1000,
}

// ── Shared helpers (exported for ncaaf-sim-engine.ts) ─────────────────────────

export function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function clampFB(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function impliedProb(odds: number): number {
  return odds < 0 ? (-odds) / (-odds + 100) : 100 / (odds + 100)
}

function profitPerDollar(odds: number): number {
  return odds < 0 ? 100 / (-odds) : odds / 100
}

function calcEV(winProb: number, odds: number): number {
  return winProb * profitPerDollar(odds) - (1 - winProb)
}

function toFairML(winPct: number): number {
  if (winPct >= 1) return -99999
  if (winPct <= 0) return 99999
  if (winPct >= 0.5) return -Math.round(100 * winPct / (1 - winPct))
  return Math.round(100 * (1 - winPct) / winPct)
}

export function buildBetEdge(
  side:    BetSide,
  label:   string,
  winPct:  number,
  odds:    number,
): BetEdge {
  const ev       = calcEV(winPct, odds)
  const edge_pct = ev * 100
  return {
    side,
    label,
    win_pct:           winPct,
    edge_pct,
    ev_per_dollar:     ev,
    odds,
    profit_per_dollar: profitPerDollar(odds),
    breakeven_pct:     impliedProb(odds),
    verdict: edge_pct >= 20 ? 'BET' : edge_pct >= 10 ? 'LEAN' : 'PASS',
  }
}

// ── Internal drive-model stat shape ───────────────────────────────────────────
// Derived from NFLStatLine inside the engine — not exposed externally
interface DriveStats {
  off_ppd:          number
  def_ppd_allow:    number
  drives:           number
  ypp:              number
  success_rate:     number
  explosive_rate:   number
  to_per_drive:     number
  third_down_off:   number
  third_down_def:   number
  rztd_off:         number
  rztd_def:         number
  plays_per_drive:  number
  sacks_per_drive:  number   // REAL — O-line pressure per drive
  havoc_rate:       number   // REAL — defensive disruption rate per snap
  def_turnovers_pg: number   // REAL — turnovers forced per game
}

// Convert NFLStatLine → DriveStats
// Uses real MSF fields for sacks_allowed_pg, havoc_rate, def_turnovers_pg
function toNFLDriveStats(line: NFLStatLine, P: FBSimParams): DriveStats {
  const drives = clampFB(
    line.plays_per_game > 0 ? line.plays_per_game / P.Lg_Avg_Plays_Per_Drive : P.Lg_Avg_Drives,
    P.Min_Drives,
    P.Max_Drives,
  )
  const playsPerDrive  = drives > 0 ? line.plays_per_game / drives : P.Lg_Avg_Plays_Per_Drive
  const offPPD         = drives > 0 ? line.points_per_game / drives : P.Lg_Avg_PPD
  const defPPDA        = drives > 0 ? line.points_allowed  / drives : P.Lg_Avg_PPD
  const toPD           = drives > 0 ? line.turnover_rate   / drives : P.Lg_Avg_TO_Per_Drive
  const sacks_per_drive = drives > 0 ? line.sacks_allowed_pg / drives : P.Lg_Avg_Sacks_PD
 
  // Proxies (no direct MSF equivalent available)
  const success_rate   = clampFB(line.third_down_pct * 0.80 + 0.10, 0.30, 0.60)
  const explosive_rate = clampFB((line.yards_per_play - 4.0) * 0.025 + 0.08, 0.06, 0.20)
 
  return {
    off_ppd:          offPPD,
    def_ppd_allow:    defPPDA,
    drives,
    ypp:              line.yards_per_play,
    success_rate,
    explosive_rate,
    to_per_drive:     toPD,
    third_down_off:   line.third_down_pct,
    third_down_def:   line.third_down_pct,        // proxy — MSF has no opp 3D data
    rztd_off:         line.red_zone_pct,           // 0.58 NFL / 0.62 NCAAF
    rztd_def:         1 - line.red_zone_pct,       // proxy (inverse)
    plays_per_drive:  playsPerDrive,
    sacks_per_drive,                               // REAL — feeds K_Sack_TO
    havoc_rate:       line.havoc_rate,             // REAL — feeds K_Havoc
    def_turnovers_pg: line.def_turnovers_pg,       // REAL — available for future use
  }
}

// Blend season + last5 into a weighted profile
export function blendDriveStats(
  season: DriveStats,
  last5:  DriveStats,
  wS: number,
  wR: number,
): DriveStats {
  const b = (key: keyof DriveStats) =>
    (season[key] as number) * wS + (last5[key] as number) * wR
  return {
    off_ppd:          b('off_ppd'),
    def_ppd_allow:    b('def_ppd_allow'),
    drives:           b('drives'),
    ypp:              b('ypp'),
    success_rate:     b('success_rate'),
    explosive_rate:   b('explosive_rate'),
    to_per_drive:     b('to_per_drive'),
    third_down_off:   b('third_down_off'),
    third_down_def:   b('third_down_def'),
    rztd_off:         b('rztd_off'),
    rztd_def:         b('rztd_def'),
    plays_per_drive:  b('plays_per_drive'),
    sacks_per_drive:  b('sacks_per_drive'),
    havoc_rate:       b('havoc_rate'),
    def_turnovers_pg: b('def_turnovers_pg'),
  }
}

// ── Drive probability calculations ───────────────────────────────────────────
// Mirrors the FB GAMES calculation sheet formulas exactly

export interface DriveProbs {
  proj_drives:    number
  to_prob:        number
  sustain:        number
  td_given_sust:  number
  fg_given_sust:  number
  // Expose weighted stats for prompt context
  weighted: DriveStats
}

export function computeDriveProbs(
  P:       FBSimParams,
  offTeam: DriveStats,   // attacking team weighted stats
  defTeam: DriveStats,   // defending team weighted stats
  isHome:  boolean,
): DriveProbs {
  const LG = P  // alias for readability

  // ── 1. Projected Drives ──────────────────────────────────────────────────
  const tempoAdj = LG.K_Tempo * ((offTeam.drives / LG.Lg_Avg_Drives) - 1)
  const ppdAdj   = -LG.K_PlaysPerDrive
    * ((offTeam.plays_per_drive / LG.Lg_Avg_Plays_Per_Drive) - 1)
  const explAdj  = LG.K_Explosive_DriveBoost
    * (offTeam.explosive_rate - LG.Lg_Avg_Explosive)
  const homeAdj  = isHome ? 0.12 : 0

  const proj_drives = clampFB(
    LG.Lg_Avg_Drives * (1 + tempoAdj + ppdAdj + explAdj) + homeAdj,
    LG.Min_Drives,
    LG.Max_Drives,
  )

  // ── 2. Turnover Probability ──────────────────────────────────────────────
  const toEdge  = LG.K_TO_Edge * (offTeam.to_per_drive - LG.Lg_Avg_TO_Per_Drive)
  const homeTO  = isHome ? LG.K_Home_TO : 0

  const to_prob = clampFB(
    LG.Base_TO_Prob + toEdge + homeTO,
    LG.TO_Floor,
    LG.TO_Ceiling,
  )

  // ── 3. Sustain Probability ───────────────────────────────────────────────
  const successEdge = LG.W_Offense * (offTeam.success_rate  - LG.Lg_Avg_Success)
                    + LG.W_Defense * (defTeam.third_down_def - LG.Lg_Avg_3D_Conv)
  const threeDEdge  = LG.W_Offense * (offTeam.third_down_off - LG.Lg_Avg_3D_Conv)
                    + LG.W_Defense * (defTeam.third_down_def  - LG.Lg_Avg_3D_Conv)
  const yppEdge     = LG.W_Offense * (offTeam.ypp            - LG.Lg_Avg_YPP)
  const explEdge    = LG.W_Offense * (offTeam.explosive_rate  - LG.Lg_Avg_Explosive)
  const homeSust    = isHome ? LG.K_Home_Sustain : 0

  const sustain = clampFB(
    LG.Base_Sustain_Prob
    + LG.K_Success   * successEdge
    + LG.K_3D        * threeDEdge
    + LG.K_YPP       * yppEdge
    + LG.K_Explosive * explEdge
    + homeSust,
    LG.Sustain_Floor,
    LG.Sustain_Ceiling,
  )

  // ── 4. TD | Sustained ───────────────────────────────────────────────────
  const rztdEdge = LG.W_Offense * (offTeam.rztd_off - LG.Lg_Avg_RZ_TD)
                 + LG.W_Defense * (defTeam.rztd_def  - LG.Lg_Avg_RZ_TD)

  const td_given_sust = clampFB(
    LG.Base_TD_Given_Sustain
    + LG.K_RZTD             * rztdEdge
    + LG.K_Finish_YPP       * (offTeam.ypp           - LG.Lg_Avg_YPP)
    + LG.K_Explosive_Finish * (offTeam.explosive_rate - LG.Lg_Avg_Explosive),
    LG.TD_Floor,
    LG.TD_Ceiling,
  )

  // ── 5. FG | Sustained ───────────────────────────────────────────────────
  const fgDefAdj  = LG.K_FG_Defense * (defTeam.def_ppd_allow - LG.Lg_Avg_PPD)
  const stallAdj  = LG.K_Stall * Math.max(0, LG.Lg_Avg_Success - offTeam.success_rate)
  const explFGAdj = LG.K_Explosive_FG_Offset
    * (offTeam.explosive_rate - LG.Lg_Avg_Explosive)

  const fg_given_sust = clampFB(
    LG.Base_FG_Given_Sustain + fgDefAdj + stallAdj + explFGAdj,
    LG.FG_Floor,
    LG.FG_Ceiling,
  )

  return { proj_drives, to_prob, sustain, td_given_sust, fg_given_sust, weighted: offTeam }
}

// ── Single-team score simulation ─────────────────────────────────────────────
export function simulateTeamScore(
  dp:            DriveProbs,
  driveVariance: number,
  P:             FBSimParams,
): number {
  const rawDrives = dp.proj_drives + driveVariance * randn()
  const numDrives = Math.round(clampFB(rawDrives, P.Min_Drives, P.Max_Drives))

  let score = 0
  for (let d = 0; d < numDrives; d++) {
    if (Math.random() < dp.to_prob)    continue   // Turnover
    if (Math.random() >= dp.sustain)   continue   // Failed to sustain
    const r = Math.random()
    if (r < dp.td_given_sust)                            score += 7  // TD + PAT
    else if (r < dp.td_given_sust + dp.fg_given_sust)   score += 3  // FG
    // else: sustained but empty (missed FG, safety, etc.)
  }
  return score
}

// ── Main NFL simulation ───────────────────────────────────────────────────────
export function runNFLSimulation(
  input:  NFLGameInput,
  params: FBSimParams = NFL_PARAMS,
): CBBSimResults {
  const P = params

  // ── Step 1: Blend season + last5 → weighted profile ──────────────────────
  const total = P.W_Season + P.W_Recent
  const wS    = P.W_Season / total
  const wR    = P.W_Recent / total

  const homeSeason = toNFLDriveStats(input.home.season, P)
  const homeLast5  = toNFLDriveStats(input.home.last5,  P)
  const awaySeason = toNFLDriveStats(input.away.season, P)
  const awayLast5  = toNFLDriveStats(input.away.last5,  P)

  const homeW = blendDriveStats(homeSeason, homeLast5, wS, wR)
  const awayW = blendDriveStats(awaySeason, awayLast5, wS, wR)

  // ── Step 2: Drive probabilities ───────────────────────────────────────────
  const isNeutral = input.neutral_site
  const dpHome = computeDriveProbs(P, homeW, awayW, !isNeutral)
  const dpAway = computeDriveProbs(P, awayW, homeW, false)

  // ── Step 3: Drive count variance ──────────────────────────────────────────
  const homeVar = P.Base_Drive_Variance
    * (1 + P.Explosive_Variance_Boost * Math.max(0, homeW.explosive_rate - P.Lg_Avg_Explosive))
    * (1 + P.TO_Variance_Boost        * Math.max(0, homeW.to_per_drive   - P.Lg_Avg_TO_Per_Drive))
  const awayVar = P.Base_Drive_Variance
    * (1 + P.Explosive_Variance_Boost * Math.max(0, awayW.explosive_rate - P.Lg_Avg_Explosive))
    * (1 + P.TO_Variance_Boost        * Math.max(0, awayW.to_per_drive   - P.Lg_Avg_TO_Per_Drive))

  // ── Step 4: Deterministic expected scores (for display) ───────────────────
  const homePPD   = (1 - dpHome.to_prob) * dpHome.sustain
    * (dpHome.td_given_sust * 7 + dpHome.fg_given_sust * 3)
  const awayPPD   = (1 - dpAway.to_prob) * dpAway.sustain
    * (dpAway.td_given_sust * 7 + dpAway.fg_given_sust * 3)
  const homeMean  = dpHome.proj_drives * homePPD + (isNeutral ? 0 : P.Home_Field_Points)
  const awayMean  = dpAway.proj_drives * awayPPD

  // ── Step 5: Monte Carlo ───────────────────────────────────────────────────
  let homeWins = 0, homeCovers = 0, overs = 0
  let sumMargin = 0, sumTotal = 0

  for (let i = 0; i < P.Sims_N; i++) {
    const hPts   = simulateTeamScore(dpHome, homeVar, P)
      + (isNeutral ? 0 : P.Home_Field_Points)
    const aPts   = simulateTeamScore(dpAway, awayVar, P)
    const margin = hPts - aPts
    const total  = hPts + aPts

    if (margin > 0)                  homeWins++
    if (margin > -input.spread_home) homeCovers++
    if (total  > input.total)        overs++
    sumMargin += margin
    sumTotal  += total
  }

  const N            = P.Sims_N
  const homeWinPct   = homeWins   / N
  const homeCoverPct = homeCovers / N
  const overPct      = overs      / N

  // ── Step 6: Fair lines and bet edges ─────────────────────────────────────
  const fairSpread = -(sumMargin / N)   // from home perspective
  const fairTotal  =  sumTotal  / N
  const fairMLHome = toFairML(homeWinPct)
  const fairMLAway = toFairML(1 - homeWinPct)

  const awaySpread      = -(input.spread_home)
  const awaySpreadLabel = `${input.away.name} ${awaySpread > 0 ? '+' : ''}${awaySpread}`

  const bets: CBBSimResults['bets'] = {
    spread_home: buildBetEdge(
      'spread_home',
      `${input.home.name} ${input.spread_home > 0 ? '+' : ''}${input.spread_home}`,
      homeCoverPct,
      input.odds_spread,
    ),
    spread_away: buildBetEdge('spread_away', awaySpreadLabel, 1 - homeCoverPct, input.odds_spread),
    over:  buildBetEdge('over',  `Over ${input.total}`,  overPct,       input.odds_total),
    under: buildBetEdge('under', `Under ${input.total}`, 1 - overPct,   input.odds_total),
    ml_home: buildBetEdge('ml_home', `${input.home.name} ML`, homeWinPct,     input.odds_ml_home),
    ml_away: buildBetEdge('ml_away', `${input.away.name} ML`, 1 - homeWinPct, input.odds_ml_away),
  }

  const allEdges  = Object.values(bets)
  const best      = allEdges.reduce((a, b) => b.edge_pct > a.edge_pct ? b : a)

  // Map DriveStats → CBBSimResults weighted shape
  // ORtg = off_ppd×100, DRtg = def_ppd×100, Pace = drives — so claude-agent
  // prompt builder can interpret them with football context
  const toStatLine = (s: DriveStats) => ({
    ORtg:     s.off_ppd       * 100,
    DRtg:     s.def_ppd_allow * 100,
    Pace:     s.drives,
    ThreePAR: s.third_down_off,
    TOV:      s.to_per_drive,
    FTr:      s.rztd_off,
    ORB:      s.success_rate,
  })

  return {
    home_mean_pts: Math.round(homeMean * 10) / 10,
    away_mean_pts: Math.round(awayMean * 10) / 10,
    home_sd:       Math.round(homeVar  * 10) / 10,
    away_sd:       Math.round(awayVar  * 10) / 10,

    home_win_pct:   homeWinPct,
    away_win_pct:   1 - homeWinPct,
    home_cover_pct: homeCoverPct,
    away_cover_pct: 1 - homeCoverPct,
    over_pct:       overPct,
    under_pct:      1 - overPct,

    fair_spread:          Math.round(fairSpread * 10) / 10,
    fair_total:           Math.round(fairTotal  * 10) / 10,
    fair_moneyline_home:  fairMLHome,
    fair_moneyline_away:  fairMLAway,
    spread_vs_market:     fairSpread + input.spread_home,
    total_vs_market:      fairTotal  - input.total,

    expected_possessions: Math.round((dpHome.proj_drives + dpAway.proj_drives) * 10) / 10,

    home_weighted:  toStatLine(homeW),
    away_weighted:  toStatLine(awayW),
    home_ppp:       homePPD,
    away_ppp:       awayPPD,
    home_style_adj: isNeutral ? 0 : P.Home_Field_Points,
    away_style_adj: 0,

    bets,
    // Convenience edge aliases (mirrors CBBSimResults shape)
    edge_spread_home: bets.spread_home.edge_pct,
    edge_spread_away: bets.spread_away.edge_pct,
    edge_over:        bets.over.edge_pct,
    edge_under:       bets.under.edge_pct,
    best_bet:         best.side,
    best_edge_score:     best.edge_pct,
    best_confidence_pct: best.win_pct * 100,
  }
}