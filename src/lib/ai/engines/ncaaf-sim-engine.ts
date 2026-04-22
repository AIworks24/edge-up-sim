// src/lib/ai/engines/ncaaf-sim-engine.ts
//
// NCAA Football Drive-Outcome Monte Carlo Simulation Engine
// Uses the same two-stage drive model as nfl-sim-engine.ts with
// NCAAF-calibrated parameters from NCAA_NFL_SIM_Model.xlsx
// (FB PARAM Engine sheet — NCAA column).
//
// Follows the same import pattern as nba-sim-engine.ts importing from cbb-sim-engine.ts:
// shared types and helpers come from nfl-sim-engine.ts; only params and the
// exported function are defined here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CBBSimResults, BetEdge, BetSide,
  NFLStatLine, NFLTeamStats,
  FBSimParams,
  randn, clampFB, buildBetEdge,
  blendDriveStats, computeDriveProbs, simulateTeamScore,
} from './nfl-sim-engine'

// Re-export shared types for any downstream consumers
export type { CBBSimResults, BetEdge, BetSide, NFLStatLine, NFLTeamStats }

// ── NCAAF Game Input ──────────────────────────────────────────────────────────
// Same shape as NFLGameInput — reused since football stats are identical structure
export interface NCAAFGameInput {
  home:         NFLTeamStats
  away:         NFLTeamStats
  spread_home:  number
  total:        number
  odds_spread:  number
  odds_total:   number
  odds_ml_home: number
  odds_ml_away: number
  neutral_site: boolean
}

// ── NCAAF Drive-Outcome parameters ───────────────────────────────────────────
// Source: NCAA_NFL_SIM_Model.xlsx → FB PARAM Engine sheet — NCAA column
export const NCAAF_PARAMS: FBSimParams = {
  Lg_Avg_PPD: 2.20, Lg_Avg_Drives: 12, Lg_Avg_YPP: 5.8,
  Lg_Avg_Success: 0.43, Lg_Avg_Explosive: 0.12,
  Lg_Avg_TO_Per_Drive: 0.11, Lg_Avg_3D_Conv: 0.40,
  Lg_Avg_RZ_TD: 0.62, Lg_Avg_Plays_Per_Drive: 5.8,

  W_Season: 0.55, W_Recent: 0.30,
  W_Offense: 0.44, W_Defense: 0.44, W_Regress: 0.11,

  K_Tempo: 0.40, K_PlaysPerDrive: 0.30, K_Explosive_DriveBoost: 0.20,
  Min_Drives: 8.5, Max_Drives: 15.5,

  Base_TO_Prob: 0.11, K_TO_Edge: 0.35, K_Sack_TO: 0.18,
  TO_Floor: 0.03, TO_Ceiling: 0.28,

  Base_Sustain_Prob: 0.44,
  K_Success: 0.22, K_3D: 0.12, K_YPP: 0.08, K_Explosive: 0.07,
  K_Havoc: -0.16,
  Sustain_Floor: 0.32, Sustain_Ceiling: 0.56,

  Base_TD_Given_Sustain: 0.49,
  K_RZTD: 0.24, K_Finish_YPP: 0.007, K_Explosive_Finish: 0.05,
  TD_Floor: 0.22, TD_Ceiling: 0.60,

  Base_FG_Given_Sustain: 0.20,
  K_FG_Defense: 0.06, K_Stall: 0.05, K_Explosive_FG_Offset: -0.03,
  FG_Floor: 0.10, FG_Ceiling: 0.24,

  Home_Field_Points: 3.5, K_Home_Sustain: 0.015, K_Home_TO: -0.008,

  Base_Drive_Variance: 1.0, Explosive_Variance_Boost: 0.18, TO_Variance_Boost: 0.16,
  Score_Correlation: 0.14,
  Sims_N: 1000,
}

// ── Internal: convert NFLStatLine → drive-model stats using NCAAF baselines ──
// Mirrors toNFLDriveStats() in nfl-sim-engine.ts but uses NCAAF league averages
function toNCAAFDriveStats(line: NFLStatLine, P: FBSimParams) {
  const drives = clampFB(
    line.plays_per_game > 0 ? line.plays_per_game / P.Lg_Avg_Plays_Per_Drive : P.Lg_Avg_Drives,
    P.Min_Drives,
    P.Max_Drives,
  )
  const playsPerDrive = drives > 0 ? line.plays_per_game / drives : P.Lg_Avg_Plays_Per_Drive
  const offPPD  = drives > 0 ? line.points_per_game / drives : P.Lg_Avg_PPD
  const defPPDA = drives > 0 ? line.points_allowed  / drives : P.Lg_Avg_PPD
  const toPD    = drives > 0 ? line.turnover_rate   / drives : P.Lg_Avg_TO_Per_Drive

  // NCAAF: success rate proxy uses slightly lower coefficient (less predictive 3D data)
  const success_rate   = clampFB(line.third_down_pct * 0.80 + 0.08, 0.28, 0.62)
  // NCAAF: explosive rate — higher baseline than NFL, more variance in YPP
  const explosive_rate = clampFB((line.yards_per_play - 3.8) * 0.030 + 0.09, 0.06, 0.22)

  return {
    off_ppd:         offPPD,
    def_ppd_allow:   defPPDA,
    drives,
    ypp:             line.yards_per_play,
    success_rate,
    explosive_rate,
    to_per_drive:    toPD,
    third_down_off:  line.third_down_pct,
    third_down_def:  line.third_down_pct,
    rztd_off:        line.red_zone_pct,
    rztd_def:        1 - line.red_zone_pct,
    plays_per_drive: playsPerDrive,
  }
}

// ── Helper functions (local — not needed from nfl-sim-engine) ─────────────────
function toFairML(winPct: number): number {
  if (winPct >= 1) return -99999
  if (winPct <= 0) return 99999
  if (winPct >= 0.5) return -Math.round(100 * winPct / (1 - winPct))
  return Math.round(100 * (1 - winPct) / winPct)
}

// ── Main NCAAF simulation ─────────────────────────────────────────────────────
export function runNCAAFSimulation(
  input:  NCAAFGameInput,
  params: FBSimParams = NCAAF_PARAMS,
): CBBSimResults {
  const P = params

  // ── Step 1: Blend season + last5 ─────────────────────────────────────────
  const total = P.W_Season + P.W_Recent
  const wS    = P.W_Season / total
  const wR    = P.W_Recent / total

  const homeSeason = toNCAAFDriveStats(input.home.season, P)
  const homeLast5  = toNCAAFDriveStats(input.home.last5,  P)
  const awaySeason = toNCAAFDriveStats(input.away.season, P)
  const awayLast5  = toNCAAFDriveStats(input.away.last5,  P)

  const homeW = blendDriveStats(homeSeason, homeLast5, wS, wR)
  const awayW = blendDriveStats(awaySeason, awayLast5, wS, wR)

  // ── Step 2: Drive probabilities ───────────────────────────────────────────
  const isNeutral = input.neutral_site
  const dpHome = computeDriveProbs(P, homeW, awayW, !isNeutral)
  const dpAway = computeDriveProbs(P, awayW, homeW, false)

  // ── Step 3: Drive variance ────────────────────────────────────────────────
  const homeVar = P.Base_Drive_Variance
    * (1 + P.Explosive_Variance_Boost * Math.max(0, homeW.explosive_rate - P.Lg_Avg_Explosive))
    * (1 + P.TO_Variance_Boost        * Math.max(0, homeW.to_per_drive   - P.Lg_Avg_TO_Per_Drive))
  const awayVar = P.Base_Drive_Variance
    * (1 + P.Explosive_Variance_Boost * Math.max(0, awayW.explosive_rate - P.Lg_Avg_Explosive))
    * (1 + P.TO_Variance_Boost        * Math.max(0, awayW.to_per_drive   - P.Lg_Avg_TO_Per_Drive))

  // ── Step 4: Deterministic expected scores ─────────────────────────────────
  const homePPD  = (1 - dpHome.to_prob) * dpHome.sustain
    * (dpHome.td_given_sust * 7 + dpHome.fg_given_sust * 3)
  const awayPPD  = (1 - dpAway.to_prob) * dpAway.sustain
    * (dpAway.td_given_sust * 7 + dpAway.fg_given_sust * 3)
  const homeMean = dpHome.proj_drives * homePPD + (isNeutral ? 0 : P.Home_Field_Points)
  const awayMean = dpAway.proj_drives * awayPPD

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
  const fairSpread = -(sumMargin / N)
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

  const allEdges = Object.values(bets)
  const best     = allEdges.reduce((a, b) => b.edge_pct > a.edge_pct ? b : a)

  const toStatLine = (s: typeof homeW) => ({
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