// ====================================================================
// CBB (College Basketball) Monte Carlo Simulation Engine
// Formula source: CBB_SIM_Model_File_022626.xlsx
// Calibrated for: NCAA Men's Basketball
// Verified against: St. Bonaventure vs Rhode Island test case
// Expected outputs: HomeWin 55%, HomeCover 64.5%, Over 64.3%
// ====================================================================

import { RECOMMENDATION_THRESHOLD } from '../edge-classifier'

export interface CBBSimParams {
  NatAvg_ORtg:   number  // 104
  NatAvg_DRtg:   number  // 104
  NatAvg_Pace:   number  // 69
  NatAvg_3PAR:   number  // 0.39
  NatAvg_TOV:    number  // 0.18
  NatAvg_FTr:    number  // 0.30
  NatAvg_ORB:    number  // 0.30
  HCA_Points:    number  // 3
  Sims_N:        number  // 20000
  Base_SD:       number  // 12.5
  Corr_Base:     number  // 0.25
  k_SD_Pace:     number  // 0.45
  k_SD_3PAR:     number  // 0.60
  k_SD_TOV:      number  // 0.35
  k_SD_FTr:      number  // 0.20
  k_SD_ORB:      number  // 0.15
  w_Season:      number  // 0.60
  w_Last10:      number  // 0.40
  w_Style:       number  // 0.12
}

export const CBB_PARAMS: CBBSimParams = {
  NatAvg_ORtg: 104, NatAvg_DRtg: 104, NatAvg_Pace: 69,
  NatAvg_3PAR: 0.39, NatAvg_TOV: 0.18, NatAvg_FTr: 0.30, NatAvg_ORB: 0.30,
  HCA_Points: 3, Sims_N: 20000, Base_SD: 12.5, Corr_Base: 0.25,
  k_SD_Pace: 0.45, k_SD_3PAR: 0.60, k_SD_TOV: 0.35, k_SD_FTr: 0.20, k_SD_ORB: 0.15,
  w_Season: 0.60, w_Last10: 0.40, w_Style: 0.12,
}

export interface TeamStats {
  name: string
  season: StatLine
  last10: StatLine
}

export interface StatLine {
  ORtg: number; DRtg: number; Pace: number
  ThreePAR: number; TOV: number; FTr: number; ORB: number
}

export interface CBBGameInput {
  home: TeamStats
  away: TeamStats
  spread_home: number
  total: number
  odds_spread: number
  odds_total: number
  odds_ml_home: number
  odds_ml_away: number
  neutral_site: boolean
}

export interface CBBSimResults {
  // Weighted stats actually used in the model
  home_weighted: StatLine
  away_weighted: StatLine
  // Model intermediates (for full transparency)
  expected_possessions: number
  home_ppp: number
  away_ppp: number
  home_style_adj: number
  away_style_adj: number
  home_mean_pts: number
  away_mean_pts: number
  home_sd: number
  away_sd: number
  // Core simulation outputs
  home_win_pct: number
  home_cover_pct: number
  away_cover_pct: number
  over_pct: number
  under_pct: number
  // Fair lines
  fair_spread: number
  fair_total: number
  fair_moneyline_home: number
  // Edge scores per bet type (% ROI)
  edge_spread_home: number
  edge_spread_away: number
  edge_over: number
  edge_under: number
  // Best bet identification
  best_bet: BetSide
  best_edge_score: number
  best_confidence_pct: number
  // Market comparison
  spread_vs_market: number   // fair_spread minus market_spread
  total_vs_market: number    // fair_total minus market_total
}

export type BetSide = 
  | 'spread_home' | 'spread_away' 
  | 'over' | 'under' 
  | 'ml_home' | 'ml_away' 
  | 'none'

// Box-Muller standard normal random number generator
function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// American odds → implied probability
function oddsToProb(odds: number): number {
  return odds < 0
    ? Math.abs(odds) / (Math.abs(odds) + 100)
    : 100 / (odds + 100)
}

// American odds → profit per $1 risked
function oddsToProfit(odds: number): number {
  return odds < 0 ? 100 / Math.abs(odds) : odds / 100
}

// American odds → decimal
function oddsToDecimal(odds: number): number {
  return odds < 0 ? 1 + 100 / Math.abs(odds) : 1 + odds / 100
}

export function runCBBSimulation(input: CBBGameInput, params: CBBSimParams = CBB_PARAMS): CBBSimResults {
  const P = params

  // ─── STEP 1: Weighted Stats ────────────────────────────────────────────────
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

  // ─── STEP 2: Expected Possessions ─────────────────────────────────────────
  const expPoss = (homeW.Pace + awayW.Pace) / 2

  // ─── STEP 3: Points Per Possession ────────────────────────────────────────
  const homePPP = (homeW.ORtg / 100) * (P.NatAvg_DRtg / awayW.DRtg)
  const awayPPP = (awayW.ORtg / 100) * (P.NatAvg_DRtg / homeW.DRtg)

  // ─── STEP 4: Style Adjustment ─────────────────────────────────────────────
  const styleAdj = (w: StatLine) =>
    P.w_Style * (
      P.k_SD_3PAR * (w.ThreePAR - P.NatAvg_3PAR) +
      P.k_SD_TOV  * (w.TOV      - P.NatAvg_TOV)  +
      P.k_SD_FTr  * (w.FTr      - P.NatAvg_FTr)  +
      P.k_SD_ORB  * (w.ORB      - P.NatAvg_ORB)
    )

  const homeStyleAdj = styleAdj(homeW)
  const awayStyleAdj = styleAdj(awayW)

  // ─── STEP 5: Mean Points ───────────────────────────────────────────────────
  const hca = input.neutral_site ? 0 : P.HCA_Points
  const homeMean = (homePPP + homeStyleAdj) * expPoss + hca
  const awayMean = (awayPPP + awayStyleAdj) * expPoss

  // ─── STEP 6: Standard Deviation ───────────────────────────────────────────
  const paceFactor = expPoss / P.NatAvg_Pace
  const calcSD = (w: StatLine) =>
    P.Base_SD * Math.sqrt(paceFactor) * (1 +
      P.k_SD_3PAR * Math.abs(w.ThreePAR - P.NatAvg_3PAR) +
      P.k_SD_TOV  * Math.abs(w.TOV      - P.NatAvg_TOV)  +
      P.k_SD_FTr  * Math.abs(w.FTr      - P.NatAvg_FTr)  +
      P.k_SD_ORB  * Math.abs(w.ORB      - P.NatAvg_ORB)
    )

  const homeSD = calcSD(homeW)
  const awaySD = calcSD(awayW)

  // ─── STEP 7: Monte Carlo Simulation (20,000 runs) ─────────────────────────
  let homeWins = 0, homeCovers = 0, overs = 0
  const corrTerm = Math.sqrt(1 - P.Corr_Base ** 2)

  for (let i = 0; i < P.Sims_N; i++) {
    const z1 = randn()
    const z2 = randn()
    const zHome = z1
    const zAway = P.Corr_Base * z1 + corrTerm * z2

    const hPts = Math.round(homeMean + zHome * homeSD)
    const aPts = Math.round(awayMean + zAway * awaySD)

    if (hPts > aPts)                              homeWins++
    if ((hPts - aPts) > -input.spread_home)       homeCovers++   // spread_home is negative for home fav
    if ((hPts + aPts) > input.total)              overs++
  }

  const homeWinPct   = homeWins   / P.Sims_N
  const homeCoverPct = homeCovers / P.Sims_N
  const overPct      = overs      / P.Sims_N

  // ─── STEP 8: Fair Lines ───────────────────────────────────────────────────
  const fairSpread = homeMean - awayMean
  const fairTotal  = homeMean + awayMean

  const fairMLHome = homeWinPct >= 0.5
    ? -(homeWinPct / (1 - homeWinPct)) * 100
    : ((1 - homeWinPct) / homeWinPct) * 100

  // ─── STEP 9: Edge Scores ──────────────────────────────────────────────────
  const calcEV = (winProb: number, odds: number) => {
    const profit = oddsToProfit(odds)
    return (winProb * profit) - ((1 - winProb) * 1)
  }

  const edgeSpreadHome = calcEV(homeCoverPct, input.odds_spread) * 100
  const edgeSpreadAway = calcEV(1 - homeCoverPct, input.odds_spread) * 100
  const edgeOver       = calcEV(overPct, input.odds_total) * 100
  const edgeUnder      = calcEV(1 - overPct, input.odds_total) * 100

  // ─── STEP 10: Best Bet ────────────────────────────────────────────────────
  const betOptions: Array<{ side: BetSide; edge: number; conf: number }> = [
    { side: 'spread_home', edge: edgeSpreadHome, conf: homeCoverPct * 100 },
    { side: 'spread_away', edge: edgeSpreadAway, conf: (1 - homeCoverPct) * 100 },
    { side: 'over',        edge: edgeOver,        conf: overPct * 100 },
    { side: 'under',       edge: edgeUnder,       conf: (1 - overPct) * 100 },
  ]

  // Best bet = highest edge score that also meets minimum confidence
  const qualifyingBets = betOptions.filter(b =>
    b.conf >= RECOMMENDATION_THRESHOLD.MIN_CONFIDENCE
  )
  const bestBetData = qualifyingBets.sort((a, b) => b.edge - a.edge)[0]
  
  const bestBet        = bestBetData ? bestBetData.side : 'none'
  const bestEdgeScore  = bestBetData ? Math.max(0, bestBetData.edge) : 0
  const bestConfidence = bestBetData ? bestBetData.conf : 0

  return {
    home_weighted: homeW,
    away_weighted: awayW,
    expected_possessions: expPoss,
    home_ppp: homePPP,
    away_ppp: awayPPP,
    home_style_adj: homeStyleAdj,
    away_style_adj: awayStyleAdj,
    home_mean_pts: homeMean,
    away_mean_pts: awayMean,
    home_sd: homeSD,
    away_sd: awaySD,
    home_win_pct: homeWinPct,
    home_cover_pct: homeCoverPct,
    away_cover_pct: 1 - homeCoverPct,
    over_pct: overPct,
    under_pct: 1 - overPct,
    fair_spread: fairSpread,
    fair_total: fairTotal,
    fair_moneyline_home: fairMLHome,
    edge_spread_home: edgeSpreadHome,
    edge_spread_away: edgeSpreadAway,
    edge_over: edgeOver,
    edge_under: edgeUnder,
    best_bet: bestBet,
    best_edge_score: bestEdgeScore,
    best_confidence_pct: bestConfidence,
    spread_vs_market: fairSpread - input.spread_home,
    total_vs_market: fairTotal - input.total,
  }
}