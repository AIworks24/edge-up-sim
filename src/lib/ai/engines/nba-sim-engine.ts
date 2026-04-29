// src/lib/ai/engines/nba-sim-engine.ts
//
// NBA simulation engine — same formula as cbb-sim-engine.ts, NBA-calibrated params.
// Key difference from CBB:
//   - NO neutral site logic (NBA always has a designated home team)
//   - neutral_site is always treated as false — HCA always applied
//   - No tournament factors (no pace/PPP dampening, no SD factor)
//   - w_Last10 weighted more heavily (more games = recent form more predictive)
//
// Imports and re-exports CBBSimResults so claude-agent.ts stays unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { RECOMMENDATION_THRESHOLD } from '../edge-classifier'
import {
  CBBSimResults, BetEdge, BetSide,
  TeamStats, StatLine, CBBGameInput,
} from './cbb-sim-engine'

// Re-export shared types so downstream code can import from either engine
export type { CBBSimResults, BetEdge, BetSide, TeamStats, StatLine }
export type { CBBGameInput as NBAGameInput }

// ── NBA-calibrated parameters ─────────────────────────────────────────────────
export interface NBASimParams {
  NatAvg_ORtg:  number   // 113  (NBA ~113 pts/100 poss)
  NatAvg_DRtg:  number   // 113
  NatAvg_Pace:  number   // 98   (NBA ~98 possessions/game)
  NatAvg_3PAR:  number   // 0.42 (NBA slightly higher 3PAR)
  NatAvg_TOV:   number   // 0.13 (NBA lower TO rate — more skilled)
  NatAvg_FTr:   number   // 0.23
  NatAvg_ORB:   number   // 0.26 (NBA lower ORB%)
  HCA_Points:   number   // 2.5  (NBA home court advantage)
  Sims_N:       number   // 20000
  Base_SD:      number   // 11.0 (NBA slightly less variance than CBB)
  Corr_Base:    number   // 0.22 (slightly less correlated than CBB)
  k_SD_3PAR:    number   // 0.55
  k_SD_TOV:     number   // 0.30
  k_SD_FTr:     number   // 0.20
  k_SD_ORB:     number   // 0.15
  c_Style_3PAR: number   // 2.2
  c_Style_TOV:  number   // 3.0
  c_Style_FTr:  number   // 2.0
  c_Style_ORB:  number   // 2.0
  w_Season:     number   // 0.45 (NBA: recent form matters more)
  w_Last10:     number   // 0.55
  w_Style:      number   // 0.12
  // Playoff adjustment factors (applied when input.is_playoff = true)
  Playoff_Pace_Factor:      number  // 0.960 — -4% possessions, tighter rotations
  Playoff_SD_Factor:        number  // 1.05  — slightly more game-to-game variance
  Playoff_Corr_Bump:        number  // 0.05  — tighter games = higher score correlation
  Playoff_Blowout_Spread_1: number  // 6     — blowout suppression threshold 1
  Playoff_Blowout_Factor_1: number  // 0.97  — mean pts multiplier when |spread| >= 6
  Playoff_Blowout_Spread_2: number  // 10    — blowout suppression threshold 2
  Playoff_Blowout_Factor_2: number  // 0.95  — mean pts multiplier when |spread| >= 10
}

export const NBA_PARAMS: NBASimParams = {
  NatAvg_ORtg:  113,
  NatAvg_DRtg:  113,
  NatAvg_Pace:  98,
  NatAvg_3PAR:  0.42,
  NatAvg_TOV:   0.13,
  NatAvg_FTr:   0.23,
  NatAvg_ORB:   0.26,
  HCA_Points:   2.5,
  Sims_N:       20000,
  Base_SD:      11.0,
  Corr_Base:    0.22,
  k_SD_3PAR:    0.55,
  k_SD_TOV:     0.30,
  k_SD_FTr:     0.20,
  k_SD_ORB:     0.15,
  c_Style_3PAR: 2.2,
  c_Style_TOV:  3.0,
  c_Style_FTr:  2.0,
  c_Style_ORB:  2.0,
  w_Season:     0.65,
  w_Last10:     0.35,
  w_Style:      0.12,
  // Playoff factors
  Playoff_Pace_Factor:      0.960,
  Playoff_SD_Factor:        1.05,
  Playoff_Corr_Bump:        0.05,
  Playoff_Blowout_Spread_1: 6,
  Playoff_Blowout_Factor_1: 0.97,
  Playoff_Blowout_Spread_2: 10,
  Playoff_Blowout_Factor_2: 0.95,
}

// ── Stat helpers (identical to CBB engine) ────────────────────────────────────
function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
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
  if (winPct >= 0.5) return -Math.round(100 * winPct / (1 - winPct))
  return Math.round(100 * (1 - winPct) / winPct)
}

function buildBetEdge(side: BetSide, label: string, winPct: number, odds: number): BetEdge {
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

// ── Main NBA simulation ───────────────────────────────────────────────────────
// input.neutral_site is accepted for interface compatibility but IGNORED —
// NBA always has a home team with full HCA applied.
export function runNBASimulation(
  input: CBBGameInput,
  params: NBASimParams = NBA_PARAMS,
): CBBSimResults {
  const P = params

  // STEP 1 — Weighted Stats (45% season / 55% last-10 for NBA) ─────────────
  const weight = (s: TeamStats): StatLine => ({
    ORtg:     s.season.ORtg     * P.w_Season + s.last10.ORtg     * P.w_Last10,
    DRtg:     s.season.DRtg     * P.w_Season + s.last10.DRtg     * P.w_Last10,
    Pace:     s.season.Pace     * P.w_Season + s.last10.Pace     * P.w_Last10,
    ThreePAR: s.season.ThreePAR * P.w_Season + s.last10.ThreePAR * P.w_Last10,
    TOV:      s.season.TOV      * P.w_Season + s.last10.TOV      * P.w_Last10,
    FTr:      s.season.FTr      * P.w_Season + s.last10.FTr      * P.w_Last10,
    ORB:      s.season.ORB      * P.w_Season + s.last10.ORB      * P.w_Last10,
  })
  const homeW = weight(input.home)
  const awayW = weight(input.away)

  // STEP 2 — Expected Possessions (same formula as CBB, no neutral site) ────
  // 0.65 × avg(Pace_H, Pace_A) + 0.35 × min(Pace_H, Pace_A)
  // Playoff: apply -4% pace factor — tighter rotations reduce possessions
  const rawExpPoss = 0.65 * ((homeW.Pace + awayW.Pace) / 2) + 0.35 * Math.min(homeW.Pace, awayW.Pace)
  const expPoss    = input.is_playoff ? rawExpPoss * P.Playoff_Pace_Factor : rawExpPoss

  // STEP 3 — Points Per Possession ─────────────────────────────────────────
  // Same formula as CBB: (ORtg + (OppDRtg − NatAvg)) / 100
  // No neutral site PPP dampening — HCA always in effect
  const homePPP = (homeW.ORtg + (awayW.DRtg - P.NatAvg_ORtg)) / 100
  const awayPPP = (awayW.ORtg + (homeW.DRtg - P.NatAvg_ORtg)) / 100

  // STEP 4 — Style Adjustment ───────────────────────────────────────────────
  // Same formula as CBB, no style dampening (no neutral site)
  const styleAdj = (w: StatLine): number =>
    P.w_Style * (
      P.c_Style_3PAR * (w.ThreePAR - P.NatAvg_3PAR) +
      P.c_Style_TOV  * (P.NatAvg_TOV - w.TOV)       +   // NOTE: Nat - TOV (higher TOV hurts)
      P.c_Style_FTr  * (w.FTr        - P.NatAvg_FTr) +
      P.c_Style_ORB  * (w.ORB        - P.NatAvg_ORB)
    )
  const homeStyleAdj = styleAdj(homeW)
  const awayStyleAdj = styleAdj(awayW)

  // STEP 5 — Mean Points (HCA always applied for NBA) ───────────────────────
  // Playoff blowout suppression: large-spread games trend toward pace collapse
  // =IF(ABS(Spread)>=10, 0.95, IF(ABS(Spread)>=6, 0.97, 1.0))
  const blowoutFactor = !input.is_playoff ? 1.0
    : Math.abs(input.spread_home) >= P.Playoff_Blowout_Spread_2 ? P.Playoff_Blowout_Factor_2
    : Math.abs(input.spread_home) >= P.Playoff_Blowout_Spread_1 ? P.Playoff_Blowout_Factor_1
    : 1.0
  const homeMean = (expPoss * homePPP + homeStyleAdj + P.HCA_Points) * blowoutFactor
  const awayMean = (expPoss * awayPPP + awayStyleAdj) * blowoutFactor

  // STEP 6 — Standard Deviation ─────────────────────────────────────────────
  // Same formula as CBB — raw signed deviations, no neutral site SD factor
  const calcSD = (w: StatLine): number =>
    Math.max(6,
      P.Base_SD * Math.sqrt(expPoss / P.NatAvg_Pace) * (
        1 +
        P.k_SD_3PAR * (w.ThreePAR - P.NatAvg_3PAR) +
        P.k_SD_TOV  * (w.TOV      - P.NatAvg_TOV)  +
        P.k_SD_FTr  * (w.FTr      - P.NatAvg_FTr)  +
        P.k_SD_ORB  * (w.ORB      - P.NatAvg_ORB)
      )
    )
  const playoffSDFactor = input.is_playoff ? P.Playoff_SD_Factor : 1.0
  const homeSD = calcSD(homeW) * playoffSDFactor
  const awaySD = calcSD(awayW) * playoffSDFactor

  // STEP 7 — Score Correlation ──────────────────────────────────────────────
  // Playoff: tighter defensive games = slightly higher score correlation
  const corrBase = input.is_playoff ? P.Corr_Base + P.Playoff_Corr_Bump : P.Corr_Base
  const corr     = Math.min(0.55, Math.max(0.05, corrBase))
  const corrTerm = Math.sqrt(1 - corr * corr)

  // STEP 8 — Monte Carlo (20,000 iterations) ────────────────────────────────
  let homeWins = 0, homeCovers = 0, overs = 0
  let sumMargin = 0, sumTotal = 0

  for (let i = 0; i < P.Sims_N; i++) {
    const z1    = randn()
    const z2    = randn()
    const zHome = z1
    const zAway = corr * z1 + corrTerm * z2

    const hPts   = Math.max(0, Math.round(homeMean + homeSD * zHome))
    const aPts   = Math.max(0, Math.round(awayMean + awaySD * zAway))
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

  // STEP 9 — Fair Lines ─────────────────────────────────────────────────────
  const fairSpread = sumMargin / N
  const fairTotal  = sumTotal  / N
  const fairMLHome = toFairML(homeWinPct)
  const fairMLAway = toFairML(1 - homeWinPct)

  // STEP 10 — EV / Edge for all 6 bet sides ─────────────────────────────────
  const awaySpread      = -(input.spread_home)
  const awaySpreadLabel = `${input.away.name} ${awaySpread > 0 ? '+' : ''}${awaySpread}`
  const bets = {
    spread_home: buildBetEdge('spread_home', `${input.home.name} ${input.spread_home > 0 ? '+' : ''}${input.spread_home}`, homeCoverPct,         input.odds_spread),
    spread_away: buildBetEdge('spread_away', awaySpreadLabel,                                                              1 - homeCoverPct,      input.odds_spread),
    over:        buildBetEdge('over',        `Over ${input.total}`,                                                        overPct,               input.odds_total),
    under:       buildBetEdge('under',       `Under ${input.total}`,                                                       1 - overPct,           input.odds_total),
    ml_home:     buildBetEdge('ml_home',     `${input.home.name} ML`,                                                      homeWinPct,            input.odds_ml_home),
    ml_away:     buildBetEdge('ml_away',     `${input.away.name} ML`,                                                      1 - homeWinPct,        input.odds_ml_away),
  }

  // Best bet = highest edge_pct across all 6 sides
  const allBets   = Object.values(bets)
  const bestBet   = allBets.reduce((a, b) => b.edge_pct > a.edge_pct ? b : a)
  const bestEdge  = bestBet.edge_pct
  const bestConf  = Math.min(99, Math.max(50, 50 + bestEdge * 2))

  return {
    home_weighted:        homeW,
    away_weighted:        awayW,
    expected_possessions: expPoss,
    home_ppp:             homePPP,
    away_ppp:             awayPPP,
    home_style_adj:       homeStyleAdj,
    away_style_adj:       awayStyleAdj,
    home_mean_pts:        homeMean,
    away_mean_pts:        awayMean,
    home_sd:              homeSD,
    away_sd:              awaySD,
    home_win_pct:         homeWinPct,
    away_win_pct:         1 - homeWinPct,
    home_cover_pct:       homeCoverPct,
    away_cover_pct:       1 - homeCoverPct,
    over_pct:             overPct,
    under_pct:            1 - overPct,
    fair_spread:          fairSpread,
    fair_total:           fairTotal,
    fair_moneyline_home:  fairMLHome,
    fair_moneyline_away:  fairMLAway,
    bets,
    // Backward compat aliases
    edge_spread_home:     bets.spread_home.edge_pct,
    edge_spread_away:     bets.spread_away.edge_pct,
    edge_over:            bets.over.edge_pct,
    edge_under:           bets.under.edge_pct,
    best_bet:             bestBet.side,
    best_edge_score:      bestEdge,
    best_confidence_pct:  bestConf,
    spread_vs_market:     fairSpread + input.spread_home,
    total_vs_market:      fairTotal  - input.total,
  }
}