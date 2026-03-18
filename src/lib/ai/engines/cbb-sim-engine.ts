// src/lib/ai/engines/cbb-sim-engine.ts
//
// Formula source: CBB_SIM_Model_File_022626.xlsx — verified cell-by-cell
// Verified test case: St Bonaventure (Home) vs Rhode Island
//   ExpPoss=69.715 ✓  HomeMean=76.727 ✓  AwayMean=74.229 ✓
//   HomeSD=13.006 ✓   AwaySD=13.201 ✓
//
// BUGS FIXED vs previous version:
//   FIX 1 — ExpPoss: was (H+A)/2 → now 0.65*avg + 0.35*min (Excel B21)
//   FIX 2 — PPP:     was ORtg/100 * NatDRtg/DRtg → now (ORtg+(DRtg-104))/100 (Excel B22/B23)
//   FIX 3 — StyleAdj: wrong coefficients (k_SD vars) → exact Excel B24/B25 (2.2, 3.0, 2.0, 2.0)
//            TOV term: was (TOV-Nat) → now (Nat-TOV) i.e. high TOV HURTS scoring
//   FIX 4 — SD:      was Math.abs() on deviations → raw signed deviations (Excel B29/B30)
//   FIX 5 — Added per-bet EV/edge for all 6 sides including both ML sides
// ─────────────────────────────────────────────────────────────────────────────

import { RECOMMENDATION_THRESHOLD } from '../edge-classifier'

// ── Parameter types ───────────────────────────────────────────────────────────
export interface CBBSimParams {
  NatAvg_ORtg:  number  // 104
  NatAvg_DRtg:  number  // 104
  NatAvg_Pace:  number  // 69
  NatAvg_3PAR:  number  // 0.39
  NatAvg_TOV:   number  // 0.18
  NatAvg_FTr:   number  // 0.30
  NatAvg_ORB:   number  // 0.30
  HCA_Points:   number  // 3
  Sims_N:       number  // 20000
  Base_SD:      number  // 12.5
  Corr_Base:    number  // 0.25
  // SD volatility multipliers (Excel Parameter Engine k_ rows)
  k_SD_3PAR:    number  // 0.60
  k_SD_TOV:     number  // 0.35
  k_SD_FTr:     number  // 0.20
  k_SD_ORB:     number  // 0.15
  // Style adjustment coefficients (Excel B24 formula: 2.2, 3.0, 2.0, 2.0)
  c_Style_3PAR: number  // 2.2
  c_Style_TOV:  number  // 3.0
  c_Style_FTr:  number  // 2.0
  c_Style_ORB:  number  // 2.0
  // Weighting (Excel TEAMS sheet)
  w_Season:     number  // 0.60
  w_Last10:     number  // 0.40
  w_Style:      number  // 0.12
  // Add to CBBSimParams interface:
  Tournament_Pace_Factor:   number  // 0.985
  Tournament_PPP_Factor:    number  // 0.972
  Tournament_PPP_Reversion: number  // 0.12
  Tournament_Style_Factor:  number  // 0.75
  Tournament_3PAR_Dampen:   number  // 0.95
  Tournament_SD_Factor:     number  // 0.85
  Tournament_Corr_Bump:     number  // 0.05
}

export const CBB_PARAMS: CBBSimParams = {
  NatAvg_ORtg: 104, NatAvg_DRtg: 104, NatAvg_Pace: 69,
  NatAvg_3PAR: 0.39, NatAvg_TOV: 0.18, NatAvg_FTr: 0.30, NatAvg_ORB: 0.30,
  HCA_Points:  2.5,  // Updated: 031626 model (was 3)
  Sims_N: 20000,
  Base_SD:    11.5,  // Updated: 031626 model (was 12.5)
  Corr_Base:  0.30,  // Updated: 031626 model (was 0.25)
  k_SD_3PAR: 0.60, k_SD_TOV: 0.35, k_SD_FTr: 0.20, k_SD_ORB: 0.15,
  c_Style_3PAR: 2.2, c_Style_TOV: 3.0, c_Style_FTr: 2.0, c_Style_ORB: 2.0,
  w_Season: 0.60, w_Last10: 0.40, w_Style: 0.12,
  // Tournament / Neutral-site parameters (031626 model)
  Tournament_Pace_Factor:   0.985,
  Tournament_PPP_Factor:    0.972,
  Tournament_PPP_Reversion: 0.12,
  Tournament_Style_Factor:  0.75,
  Tournament_3PAR_Dampen:   0.95,
  Tournament_SD_Factor:     0.85,
  Tournament_Corr_Bump:     0.05,
}

// ── Data types ────────────────────────────────────────────────────────────────
export interface TeamStats {
  name:   string
  season: StatLine
  last10: StatLine
}

export interface StatLine {
  ORtg: number; DRtg: number; Pace: number
  ThreePAR: number; TOV: number; FTr: number; ORB: number
}

export interface CBBGameInput {
  home:         TeamStats
  away:         TeamStats
  spread_home:  number    // negative = home fav (e.g. -3.5)
  total:        number    // market O/U line
  odds_spread:  number    // American odds on home spread (usually -110)
  odds_total:   number    // American odds on over (usually -110)
  odds_ml_home: number    // American ML home
  odds_ml_away: number    // American ML away
  neutral_site: boolean
}

export type BetSide = 'spread_home' | 'spread_away' | 'over' | 'under' | 'ml_home' | 'ml_away' | 'none'

export interface BetEdge {
  side:              BetSide
  label:             string
  win_pct:           number  // 0-1
  edge_pct:          number  // %ROI  (matches Excel "Edge Score %ROI" rows 42/43)
  ev_per_dollar:     number  // raw EV
  odds:              number  // American
  profit_per_dollar: number
  breakeven_pct:     number  // implied prob of the market odds
  verdict:           'BET' | 'LEAN' | 'PASS'
}

export interface CBBSimResults {
  // Weighted stats used by engine
  home_weighted:        StatLine
  away_weighted:        StatLine
  // Model intermediates
  expected_possessions: number
  home_ppp:             number
  away_ppp:             number
  home_style_adj:       number
  away_style_adj:       number
  home_mean_pts:        number
  away_mean_pts:        number
  home_sd:              number
  away_sd:              number
  // Simulation probabilities
  home_win_pct:         number
  away_win_pct:         number
  home_cover_pct:       number
  away_cover_pct:       number
  over_pct:             number
  under_pct:            number
  // Fair lines
  fair_spread:          number
  fair_total:           number
  fair_moneyline_home:  number  // American
  fair_moneyline_away:  number  // American
  // Per-bet EV breakdown (all 6 sides)
  bets: {
    spread_home: BetEdge
    spread_away: BetEdge
    over:        BetEdge
    under:       BetEdge
    ml_home:     BetEdge
    ml_away:     BetEdge
  }
  // Convenience aliases kept for backward compat with existing code
  edge_spread_home:     number
  edge_spread_away:     number
  edge_over:            number
  edge_under:           number
  // Best bet
  best_bet:             BetSide
  best_edge_score:      number
  best_confidence_pct:  number
  // Market gaps
  spread_vs_market:     number
  total_vs_market:      number
}

// ── Stat helpers ──────────────────────────────────────────────────────────────
// Box-Muller — matches Excel NORM.S.INV(RAND())
function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Excel: IF(odds<0, -odds/(-odds+100), 100/(odds+100))
function impliedProb(odds: number): number {
  return odds < 0 ? (-odds) / (-odds + 100) : 100 / (odds + 100)
}

// Excel: IF(odds<0, 100/-odds, odds/100)
function profitPerDollar(odds: number): number {
  return odds < 0 ? 100 / (-odds) : odds / 100
}

// Excel B41: WinPct * Profit - (1 - WinPct)
function calcEV(winProb: number, odds: number): number {
  return winProb * profitPerDollar(odds) - (1 - winProb)
}

// Excel B43: fair moneyline from win %
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

// ── Main simulation ───────────────────────────────────────────────────────────
export function runCBBSimulation(input: CBBGameInput, params: CBBSimParams = CBB_PARAMS): CBBSimResults {
  const P = params

  // STEP 1 — Weighted Stats (60% season / 40% last-10) ──────────────────────
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

  // STEP 2 — Expected Possessions — EXACT Excel B21 ─────────────────────────
  const rawExpPoss = 0.65 * ((homeW.Pace + awayW.Pace) / 2) + 0.35 * Math.min(homeW.Pace, awayW.Pace)
  const expPoss = input.neutral_site
    ? rawExpPoss * P.Tournament_Pace_Factor
    : rawExpPoss

  // STEP 3 — Points style Per Possession — EXACT Excel B22/B23
  // Home PPP = (HomeORtg + (AwayDRtg − NatAvg_ORtg)) / 100
  // Away PPP = (AwayORtg + (HomeDRtg − NatAvg_ORtg)) / 100
  // Updated with Tournament PPP adjustments (031626 model):
  let homePPP = (homeW.ORtg + (awayW.DRtg - P.NatAvg_ORtg)) / 100
  let awayPPP = (awayW.ORtg + (homeW.DRtg - P.NatAvg_ORtg)) / 100
  if (input.neutral_site) {
    const NAT_PPP = P.NatAvg_ORtg / 100  // 1.04
    const rev = P.Tournament_PPP_Reversion
    // Excel B22/B23: revert toward national avg FIRST, then apply PPP dampener
    homePPP = ((1 - rev) * homePPP + rev * NAT_PPP) * P.Tournament_PPP_Factor
    awayPPP = ((1 - rev) * awayPPP + rev * NAT_PPP) * P.Tournament_PPP_Factor
  }

  // STEP 4 — Style Adjustment — EXACT Excel B24/B25 ────────────────────────
  // =w_Style*(2.2*(3PAR−Nat3PAR) + 3*(NatTOV−TOV) + 2*(FTr−NatFTr) + 2*(ORB−NatORB))
  // Excel B24/B25: in neutral/tournament games, 3PAR is dampened INSIDE the formula
  // before subtracting NatAvg_3PAR — not applied as a multiplier on the total
  const threePARDampen = input.neutral_site ? P.Tournament_3PAR_Dampen : 1.0
  const styleFactor    = input.neutral_site ? P.Tournament_Style_Factor : 1.0
  const styleAdj = (w: StatLine): number =>
    P.w_Style * (
      P.c_Style_3PAR * (w.ThreePAR * threePARDampen - P.NatAvg_3PAR) +  // 3PAR dampened inside
      P.c_Style_TOV  * (P.NatAvg_TOV - w.TOV)                         +
      P.c_Style_FTr  * (w.FTr - P.NatAvg_FTr)                         +
      P.c_Style_ORB  * (w.ORB - P.NatAvg_ORB)
    ) * styleFactor
  const homeStyleAdj = styleAdj(homeW)
  const awayStyleAdj = styleAdj(awayW)

  // STEP 5 — Mean Points — EXACT Excel B27/B28 ─────────────────────────────
  const hca      = input.neutral_site ? 0 : P.HCA_Points
  const homeMean = expPoss * homePPP + homeStyleAdj + hca
  const awayMean = expPoss * awayPPP + awayStyleAdj

  // STEP 6 — Standard Deviation — EXACT Excel B29/B30 ──────────────────────
  // =MAX(6, Base_SD * SQRT(ExpPoss/NatPace) * (1 + k_3PAR*(3PAR−Nat) + k_TOV*(TOV−Nat) + ...))
  // CRITICAL: NO Math.abs() — raw signed deviations (below-avg stats reduce SD)
  const calcSD = (w: StatLine): number =>
    Math.max(6,
      P.Base_SD * Math.sqrt(expPoss / P.NatAvg_Pace) * (
        1 +
        P.k_SD_3PAR * (w.ThreePAR - P.NatAvg_3PAR) +  // ← signed, no abs
        P.k_SD_TOV  * (w.TOV      - P.NatAvg_TOV)  +  // ← signed, no abs
        P.k_SD_FTr  * (w.FTr      - P.NatAvg_FTr)  +  // ← signed, no abs
        P.k_SD_ORB  * (w.ORB      - P.NatAvg_ORB)     // ← signed, no abs
      )
    )
  const sdFactor = input.neutral_site ? P.Tournament_SD_Factor : 1.0
  const homeSD = calcSD(homeW) * sdFactor
  const awaySD = calcSD(awayW) * sdFactor

  // STEP 7 — Score Correlation — EXACT Excel B31 ────────────────────────────
  const corrBase = input.neutral_site ? P.Corr_Base + P.Tournament_Corr_Bump : P.Corr_Base
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

    if (margin > 0)              homeWins++
    if (margin > input.spread_home) homeCovers++ // spread_home is negative for home fav
    if (total  > input.total)    overs++

    sumMargin += margin
    sumTotal  += total
  }

  const N            = P.Sims_N
  const homeWinPct   = homeWins   / N
  const homeCoverPct = homeCovers / N
  const overPct      = overs      / N

  // STEP 9 — Fair Lines ─────────────────────────────────────────────────────
  const fairSpread   = sumMargin / N
  const fairTotal    = sumTotal  / N
  const fairMLHome   = toFairML(homeWinPct)
  const fairMLAway   = toFairML(1 - homeWinPct)

  // STEP 10 — EV / Edge for ALL 6 bet sides ─────────────────────────────────
  // Spread: both sides use same odds line (symmetric -110 / -110)
  // Total:  both sides use same total odds line
  // ML:     each side uses its own American odds
  const awaySpread = -(input.spread_home)
  const awaySpreadLabel = `${input.away.name} ${awaySpread > 0 ? '+' : ''}${awaySpread}`
  const bets = {
    spread_home: buildBetEdge('spread_home', `${input.home.name} ${input.spread_home > 0 ? '+' : ''}${input.spread_home}`, homeCoverPct,      input.odds_spread),
    spread_away: buildBetEdge('spread_away', awaySpreadLabel,                                                                1 - homeCoverPct,  input.odds_spread),
    over:        buildBetEdge('over',        `Over ${input.total}`,                                                          overPct,           input.odds_total),
    under:       buildBetEdge('under',       `Under ${input.total}`,                                                         1 - overPct,       input.odds_total),
    ml_home:     buildBetEdge('ml_home',     `${input.home.name} ML`,                                                        homeWinPct,        input.odds_ml_home),
    ml_away:     buildBetEdge('ml_away',     `${input.away.name} ML`,                                                        1 - homeWinPct,    input.odds_ml_away),
  }

  // STEP 11 — Best Bet ───────────────────────────────────────────────────────
  const qualifying = Object.values(bets).filter(b =>
    b.win_pct * 100 >= RECOMMENDATION_THRESHOLD.MIN_CONFIDENCE
  )
  const bestBetData = qualifying.sort((a, b) => b.edge_pct - a.edge_pct)[0]

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
    // backward-compat aliases
    edge_spread_home:     bets.spread_home.edge_pct,
    edge_spread_away:     bets.spread_away.edge_pct,
    edge_over:            bets.over.edge_pct,
    edge_under:           bets.under.edge_pct,
    best_bet:             bestBetData?.side ?? 'none',
    best_edge_score:      bestBetData?.edge_pct ?? 0,
    best_confidence_pct:  bestBetData ? bestBetData.win_pct * 100 : 0,
    spread_vs_market:     fairSpread - input.spread_home,
    total_vs_market:      fairTotal  - input.total,
  }
}