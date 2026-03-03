// src/lib/ai/engines/nba-sim-engine.ts
// These are well-calibrated for NBA basketball
export const NBA_PARAMS = {
  NatAvg_ORtg:  114,     // NBA: much higher scoring efficiency
  NatAvg_DRtg:  114,
  NatAvg_Pace:  98,       // NBA: ~98 possessions per game vs 69 in CBB
  NatAvg_3PAR:  0.42,    // NBA: slightly higher 3PAR
  NatAvg_TOV:   0.14,    // NBA: lower turnover rate (more skilled players)
  NatAvg_FTr:   0.25,
  NatAvg_ORB:   0.27,    // NBA: slightly lower ORB%
  HCA_Points:   2.5,      // NBA: lower HCA than CBB
  Sims_N:       20000,
  Base_SD:      11.0,     // NBA: slightly less variance than CBB
  Corr_Base:    0.25,
  k_SD_3PAR:    0.55,
  k_SD_TOV:     0.30,
  k_SD_FTr:     0.20,
  k_SD_ORB:     0.15,
  k_SD_Pace:    0.40,
  w_Season:     0.45,    // NBA: more recent form matters
  w_Last10:     0.55,
  w_Style:      0.12,
}

// NBA simulation reuses the CBB formula entirely — only params differ
// When ready for Phase 3, import and re-export from cbb-sim-engine.ts
// with NBA_PARAMS passed instead of CBB_PARAMS