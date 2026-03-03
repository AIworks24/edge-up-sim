// NFL-calibrated parameters (different from CBB)
// These are reasonable starting values — refine after backtesting
export const NFL_PARAMS = {
  NatAvg_ORtg:  23.4,    // NFL: average points per game ~23
  NatAvg_DRtg:  23.4,
  NatAvg_Pace:  62,       // NFL: ~62 offensive plays per game
  NatAvg_3PAR:  0,        // N/A for NFL — use yards per attempt or EPA instead
  NatAvg_TOV:   0.12,    // NFL turnover rate per drive
  NatAvg_FTr:   0,        // N/A for NFL
  NatAvg_ORB:   0,        // N/A for NFL
  HCA_Points:   2.5,      // NFL home field advantage ~2.5 pts
  Sims_N:       20000,
  Base_SD:      10.5,     // NFL scores less variable than CBB
  Corr_Base:    0.20,
  // NFL-specific weights
  k_EPA_Pass:   0.50,     // Expected points added per pass play
  k_EPA_Rush:   0.25,
  k_TurnoverAdj: 0.40,
  k_RedZone:    0.35,
  w_Season:     0.50,     // NFL: recent form matters more, less season weight
  w_Last5:      0.50,     // NFL: use last 5 games (shorter season)
  w_Style:      0.10,
}

// NFL stats the model needs (different from CBB)
export interface NFLTeamStats {
  name: string
  season: NFLStatLine
  last5: NFLStatLine
}

export interface NFLStatLine {
  points_per_game: number       // Average points scored
  points_allowed: number        // Average points allowed
  plays_per_game: number        // Offensive plays per game (pace)
  turnover_rate: number         // Turnovers per game
  red_zone_pct: number         // Red zone TD conversion %
  yards_per_play: number        // Offensive efficiency
  yards_allowed_per_play: number // Defensive efficiency
  third_down_pct: number        // Third down conversion %
}

// NOTE: Full NFL sim engine implementation follows the same pattern as CBB.
// Build this in Phase 2 after CBB is verified and generating real picks.
// The architecture is identical — only parameters and stat names differ.
export function runNFLSimulation(input: any, params = NFL_PARAMS): any {
  throw new Error('NFL simulation engine: Build in Phase 2')
}