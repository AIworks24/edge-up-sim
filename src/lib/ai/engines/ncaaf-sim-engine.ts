// src/lib/ai/engines/ncaaf-sim-engine.ts
// National averages for FBS college football
export const NCAAF_PARAMS = {
  NatAvg_ORtg:  27.8,    // NCAAF: higher scoring than NFL
  NatAvg_DRtg:  27.8,
  NatAvg_Pace:  70,       // NCAAF: more plays, faster pace
  HCA_Points:   4.0,      // NCAAF: stronger home field advantage
  Sims_N:       20000,
  Base_SD:      14.0,     // Higher variance than NFL
  Corr_Base:    0.20,
  w_Season:     0.55,
  w_Last5:      0.45,
  w_Style:      0.10,
}

// Note: NCAAF currently returns 404 on SportRadar trial during offseason.
// This is the sport you flagged in your memory notes.
// Implement when football season is active (Aug-Jan).
export function runNCAAFSimulation(input: any, params = NCAAF_PARAMS): any {
  throw new Error('NCAAF simulation engine: Build in Phase 2 during football season')
}