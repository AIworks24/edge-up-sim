// src/lib/ai/claude-agent.ts
// v3 — Full Three-Bet Analysis
// One simulation → complete breakdown of Spread, Total, and Moneyline with
// bet-type-specific EV formulas and per-bet narrative from Claude.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import {
  runCBBSimulation, CBBGameInput, CBBSimResults, CBB_PARAMS, BetEdge
} from './engines/cbb-sim-engine'
import { getTeamStats } from '../sportradar/stats'
import { classifyEdgeScore, RECOMMENDATION_THRESHOLD } from './edge-classifier'
import { EDGE_UP_SIM_SYSTEM_PROMPT } from './prompts/system-prompt'
import { supabaseAdmin } from '../database/supabase-admin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SimulationRequest {
  event_id:        string
  home_team:       string
  away_team:       string
  home_team_sr_id: string
  away_team_sr_id: string
  sport:           'ncaab' | 'nba' | 'nfl' | 'ncaaf'
  spread_home:     number
  total:           number
  odds_spread:     number
  odds_total:      number
  odds_ml_home:    number
  odds_ml_away:    number
  neutral_site:    boolean
  user_id?:        string
  is_hot_pick?:    boolean
  game_time?:      string
}

export interface BetSection {
  label:    string    // e.g. "Kansas -4.5"
  verdict:  'BET' | 'LEAN' | 'PASS'
  win_pct:  number    // 0–100
  edge_pct: number    // Edge Score %ROI
  odds:     number    // American
  fair_line: string   // e.g. "Fair spread -6.2 vs market -4.5 (+1.7 pts)"
  analysis: string    // 2–3 sentences specific to this bet type's edge drivers
}

export interface SimulationOutput {
  // Game-level
  projected_score:  { home: number; away: number; home_team: string; away_team: string }
  headline:         string
  game_summary:     string
  // Per-bet breakdowns (best side highlighted)
  spread:           { home: BetSection; away: BetSection; best_side: 'home' | 'away' }
  total:            { over: BetSection; under: BetSection; best_side: 'over' | 'under' }
  moneyline:        { home: BetSection; away: BetSection; best_side: 'home' | 'away' }
  // Top pick across all bet types
  top_pick:         BetSection & { bet_category: 'spread' | 'total' | 'moneyline' }
  // Supporting data
  key_factors:      string[]
  sizing_note:      string
  // Raw outputs for UI / storage
  edge_up_score:    number
  edge_tier:        string
  confidence:       number
  recommendation:   'BET' | 'NO BET'
  sim_results:      CBBSimResults
  prediction_id:    string
  sport:            string
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function runGameSimulation(req: SimulationRequest): Promise<SimulationOutput> {

  // 1. SportRadar stats
  const [homeStats, awayStats] = await Promise.all([
    getTeamStats(req.home_team_sr_id, req.sport as 'ncaab'),
    getTeamStats(req.away_team_sr_id, req.sport as 'ncaab'),
  ])

  // 2. Build engine input
  const simInput: CBBGameInput = {
    home: { name: req.home_team, season: homeStats.season, last10: homeStats.last10 },
    away: { name: req.away_team, season: awayStats.season, last10: awayStats.last10 },
    spread_home:  req.spread_home,
    total:        req.total,
    odds_spread:  req.odds_spread  || -110,
    odds_total:   req.odds_total   || -110,
    odds_ml_home: req.odds_ml_home || -150,
    odds_ml_away: req.odds_ml_away || +130,
    neutral_site: req.neutral_site,
  }

  // 3. Run Excel-verified simulation
  const sim = runCBBSimulation(simInput, CBB_PARAMS)

  // 4. Call Claude with full per-bet-type context
  const message = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system:     EDGE_UP_SIM_SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: buildPrompt(req, sim) }],
  })

  // 5. Parse Claude response
  const rawText = message.content[0].type === 'text' ? message.content[0].text : '{}'
  let aiOutput: Omit<SimulationOutput, 'sim_results' | 'prediction_id' | 'sport' | 'edge_up_score' | 'edge_tier' | 'confidence' | 'recommendation'>

  try {
    const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim()
    aiOutput = JSON.parse(cleaned)
  } catch {
    aiOutput = buildFallback(sim, req)
  }

  // 6. Attach meta
  const edgeClass = classifyEdgeScore(sim.best_edge_score)
  const output: SimulationOutput = {
    ...aiOutput,
    edge_up_score:  Math.round(sim.best_edge_score * 10) / 10,
    edge_tier:      edgeClass.tier,
    confidence:     Math.round(sim.best_confidence_pct * 10) / 10,
    recommendation: sim.best_edge_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE ? 'BET' : 'NO BET',
    sim_results:    sim,
    prediction_id:  '',
    sport:          req.sport,
  }

  // 7. Store
  output.prediction_id = await storePrediction(req, sim, output)
  return output
}

// ── Prompt ────────────────────────────────────────────────────────────────────
function buildPrompt(req: SimulationRequest, sim: CBBSimResults): string {
  const { bets } = sim
  const f  = (n: number, d = 1) => n.toFixed(d)
  const fp = (n: number)        => `${(n * 100).toFixed(1)}%`
  const fo = (n: number)        => (n > 0 ? `+${n}` : `${n}`)

  return `
## GAME: ${req.away_team} @ ${req.home_team}
Sport: NCAA Men's Basketball
Site: ${req.neutral_site ? 'Neutral Site' : `${req.home_team} (Home)`}

## MARKET LINES
Spread : ${req.home_team} ${req.spread_home > 0 ? '+' : ''}${req.spread_home}  (${fo(req.odds_spread)})
Total  : ${req.total}  (${fo(req.odds_total)})
ML     : ${req.home_team} ${fo(req.odds_ml_home)} / ${req.away_team} ${fo(req.odds_ml_away)}

## PROJECTED SCORE
${req.home_team}: ${f(sim.home_mean_pts)} pts  ±${f(sim.home_sd)}
${req.away_team}: ${f(sim.away_mean_pts)} pts  ±${f(sim.away_sd)}
Expected Possessions: ${f(sim.expected_possessions)}

## WEIGHTED STATS  (60% Season / 40% Last-10)  |  National Avg: ORtg 104 / DRtg 104 / Pace 69
${req.home_team}:
  ORtg ${f(sim.home_weighted.ORtg)}  [${sim.home_weighted.ORtg > 104 ? '+' : ''}${f(sim.home_weighted.ORtg - 104)} vs avg]  |  DRtg ${f(sim.home_weighted.DRtg)}  [${sim.home_weighted.DRtg < 104 ? 'BETTER' : 'WORSE'} by ${f(Math.abs(sim.home_weighted.DRtg - 104))}]
  Pace ${f(sim.home_weighted.Pace)}  |  3PAR ${fp(sim.home_weighted.ThreePAR)} [avg 39%]  |  TOV ${fp(sim.home_weighted.TOV)} [avg 18%, lower=better]
  FTr ${fp(sim.home_weighted.FTr)} [avg 30%]  |  ORB ${fp(sim.home_weighted.ORB)} [avg 30%]
  PPP ${f(sim.home_ppp, 4)}  |  Style Adj ${f(sim.home_style_adj, 3)} pts

${req.away_team}:
  ORtg ${f(sim.away_weighted.ORtg)}  [${sim.away_weighted.ORtg > 104 ? '+' : ''}${f(sim.away_weighted.ORtg - 104)} vs avg]  |  DRtg ${f(sim.away_weighted.DRtg)}  [${sim.away_weighted.DRtg < 104 ? 'BETTER' : 'WORSE'} by ${f(Math.abs(sim.away_weighted.DRtg - 104))}]
  Pace ${f(sim.away_weighted.Pace)}  |  3PAR ${fp(sim.away_weighted.ThreePAR)} [avg 39%]  |  TOV ${fp(sim.away_weighted.TOV)} [avg 18%, lower=better]
  FTr ${fp(sim.away_weighted.FTr)} [avg 30%]  |  ORB ${fp(sim.away_weighted.ORB)} [avg 30%]
  PPP ${f(sim.away_ppp, 4)}  |  Style Adj ${f(sim.away_style_adj, 3)} pts

## SIMULATION RESULTS
Home Win   ${fp(sim.home_win_pct)}   |  Away Win   ${fp(sim.away_win_pct)}
Home Cover ${fp(sim.home_cover_pct)} |  Away Cover ${fp(sim.away_cover_pct)}
Over       ${fp(sim.over_pct)}       |  Under      ${fp(sim.under_pct)}

## FAIR LINES vs MARKET
Spread : Fair ${f(sim.fair_spread)} vs Market ${req.spread_home}  →  Gap ${f(sim.spread_vs_market, 2)} pts
Total  : Fair ${f(sim.fair_total)}  vs Market ${req.total}        →  Gap ${f(sim.total_vs_market, 2)} pts
ML Home: Fair ${sim.fair_moneyline_home}  vs Market ${fo(req.odds_ml_home)}
ML Away: Fair ${sim.fair_moneyline_away}  vs Market ${fo(req.odds_ml_away)}

## EDGE SCORES — ALL 6 BET SIDES
Edge % = (WinProb × Profit/$1) − LossPct   ←  exact Excel formula

SPREAD:
  ${bets.spread_home.label.padEnd(28)} Win ${fp(bets.spread_home.win_pct)}  EV ${f(bets.spread_home.ev_per_dollar,3)}  Edge ${f(bets.spread_home.edge_pct)}%  Breakeven ${fp(bets.spread_home.breakeven_pct)}  →  ${bets.spread_home.verdict}
  ${bets.spread_away.label.padEnd(28)} Win ${fp(bets.spread_away.win_pct)}  EV ${f(bets.spread_away.ev_per_dollar,3)}  Edge ${f(bets.spread_away.edge_pct)}%  Breakeven ${fp(bets.spread_away.breakeven_pct)}  →  ${bets.spread_away.verdict}

TOTAL:
  Over  ${req.total.toString().padEnd(22)} Win ${fp(bets.over.win_pct)}  EV ${f(bets.over.ev_per_dollar,3)}  Edge ${f(bets.over.edge_pct)}%  Breakeven ${fp(bets.over.breakeven_pct)}  →  ${bets.over.verdict}
  Under ${req.total.toString().padEnd(22)} Win ${fp(bets.under.win_pct)}  EV ${f(bets.under.ev_per_dollar,3)}  Edge ${f(bets.under.edge_pct)}%  Breakeven ${fp(bets.under.breakeven_pct)}  →  ${bets.under.verdict}

MONEYLINE:
  ${bets.ml_home.label.padEnd(28)} Win ${fp(bets.ml_home.win_pct)}  EV ${f(bets.ml_home.ev_per_dollar,3)}  Edge ${f(bets.ml_home.edge_pct)}%  Fair ML ${sim.fair_moneyline_home}  →  ${bets.ml_home.verdict}
  ${bets.ml_away.label.padEnd(28)} Win ${fp(bets.ml_away.win_pct)}  EV ${f(bets.ml_away.ev_per_dollar,3)}  Edge ${f(bets.ml_away.edge_pct)}%  Fair ML ${sim.fair_moneyline_away}  →  ${bets.ml_away.verdict}

TOP BET: ${sim.best_bet}  Edge ${f(sim.best_edge_score)}%
${sim.best_edge_score < RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE
  ? '⚠️  NO BET — best edge is below the 20% threshold'
  : '✅  Qualifies for recommendation'}

═══════════════════════════════════════════════════════
══════════════════════════════════════════════════════════
LANGUAGE RULES — ABSOLUTE, ZERO EXCEPTIONS:
  ✗ NEVER write: Monte Carlo, simulation, model, algorithm, iterations, runs, methodology
  ✓ WRITE INSTEAD: "our analytics", "the data", "our projections", "the edge score", "our numbers"

══════════════════════════════════════════════════════════
BET-TYPE-SPECIFIC ANALYSIS RULES
Each bet type has a different edge driver. Write 2-3 sentences specific to THAT type only.
Do NOT recycle the same sentences across bet types.

── SPREAD (write for home side AND away side separately) ──
The spread edge comes from: fair_spread vs market_spread GAP × cover probability.
  • Sentence 1: State the exact fair spread (${f(sim.fair_spread)}) vs market (${req.spread_home}) — gap is ${f(Math.abs(sim.spread_vs_market), 2)} pts. State which side this gap favors and WHY.
  • Sentence 2: Name the specific ORtg/DRtg matchup driving cover probability. For HOME: ${req.home_team} ORtg ${f(sim.home_weighted.ORtg)} vs ${req.away_team} DRtg ${f(sim.away_weighted.DRtg)} [nat avg 104]. For AWAY: ${req.away_team} ORtg ${f(sim.away_weighted.ORtg)} vs ${req.home_team} DRtg ${f(sim.home_weighted.DRtg)}.
  • Sentence 3: State cover probability and edge score. Format: "[Team] covers [X]% of outcomes. Edge score [Y]% — [VERDICT]."

── TOTAL (write for OVER and UNDER separately) ──
The total edge comes from: fair_total vs market_total GAP + pace × PPP scoring environment.
  • Sentence 1: State fair total (${f(sim.fair_total)}) vs market (${req.total}). Gap: ${f(Math.abs(sim.total_vs_market), 2)} pts ${sim.total_vs_market > 0 ? 'ABOVE market → over pressure' : 'BELOW market → under pressure'}.
  • Sentence 2: Explain the scoring environment using ${f(sim.expected_possessions)} possessions and PPP (${req.home_team} ${f(sim.home_ppp, 4)}, ${req.away_team} ${f(sim.away_ppp, 4)}). For OVER: does pace + PPP support scoring above ${req.total}? For UNDER: does defensive DRtg suppress it?
  • Sentence 3: Reference style adjustments (Home ${f(sim.home_style_adj, 3)}, Away ${f(sim.away_style_adj, 3)} pts) and state edge score + verdict.

── MONEYLINE (write for home side AND away side separately) ──
The moneyline edge comes from: fair ML vs market ML implied probability gap — not the spread.
  • Sentence 1: State fair ML (Home: ${sim.fair_moneyline_home}, Away: ${sim.fair_moneyline_away}) vs market (Home: ${req.odds_ml_home > 0 ? '+' : ''}${req.odds_ml_home}, Away: ${req.odds_ml_away > 0 ? '+' : ''}${req.odds_ml_away}). Convert to implied prob and state the gap.
  • Sentence 2: Explain what drives outright win probability — the offensive vs defensive matchup. ${req.home_team} wins ${f(sim.home_win_pct * 100)}% outright; ${req.away_team} wins ${f((1 - sim.home_win_pct) * 100)}%. Name the key ORtg/DRtg imbalance.
  • Sentence 3: For the side with positive edge: explicitly call out the EV opportunity (even if win % < 50%). State edge score + verdict.

── GAME SUMMARY (3 sentences total) ──
  • Sentence 1: Projected final score and margin of victory.
  • Sentence 2: Which team holds the structural statistical edge and the ONE stat that proves it.
  • Sentence 3: Which bet type offers the clearest value and why (reference the specific gap number).

══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════
OUTPUT: Return ONLY the JSON object below. No markdown fences. No text before or after.

{
  "projected_score": { "home": ${Math.round(sim.home_mean_pts)}, "away": ${Math.round(sim.away_mean_pts)}, "home_team": "${req.home_team}", "away_team": "${req.away_team}" },
  "headline": "<≤15 words — specific edge with numbers, no generic phrases>",
  "game_summary": "<3 sentences — score, structural edge, top value bet>",
  "spread": {
    "best_side": "${bets.spread_home.edge_pct >= bets.spread_away.edge_pct ? 'home' : 'away'}",
    "home": {
      "label": "${bets.spread_home.label}",
      "verdict": "${bets.spread_home.verdict}",
      "win_pct": ${f(bets.spread_home.win_pct * 100)},
      "edge_pct": ${f(bets.spread_home.edge_pct)},
      "odds": ${req.odds_spread},
      "fair_line": "Fair ${f(sim.fair_spread)} vs market ${req.spread_home} — ${f(Math.abs(sim.spread_vs_market), 2)} pt gap",
      "analysis": "<your 2-3 sentence SPREAD HOME analysis>"
    },
    "away": {
      "label": "${bets.spread_away.label}",
      "verdict": "${bets.spread_away.verdict}",
      "win_pct": ${f(bets.spread_away.win_pct * 100)},
      "edge_pct": ${f(bets.spread_away.edge_pct)},
      "odds": ${req.odds_spread},
      "fair_line": "Fair ${f(sim.fair_spread)} vs market ${req.spread_home} — ${f(Math.abs(sim.spread_vs_market), 2)} pt gap",
      "analysis": "<your 2-3 sentence SPREAD AWAY analysis>"
    }
  },
  "total": {
    "best_side": "${bets.over.edge_pct >= bets.under.edge_pct ? 'over' : 'under'}",
    "over": {
      "label": "Over ${req.total}",
      "verdict": "${bets.over.verdict}",
      "win_pct": ${f(bets.over.win_pct * 100)},
      "edge_pct": ${f(bets.over.edge_pct)},
      "odds": ${req.odds_total},
      "fair_line": "Fair total ${f(sim.fair_total)} vs market ${req.total} — ${f(Math.abs(sim.total_vs_market), 2)} pt gap",
      "analysis": "<your 2-3 sentence OVER analysis>"
    },
    "under": {
      "label": "Under ${req.total}",
      "verdict": "${bets.under.verdict}",
      "win_pct": ${f(bets.under.win_pct * 100)},
      "edge_pct": ${f(bets.under.edge_pct)},
      "odds": ${req.odds_total},
      "fair_line": "Fair total ${f(sim.fair_total)} vs market ${req.total} — ${f(Math.abs(sim.total_vs_market), 2)} pt gap",
      "analysis": "<your 2-3 sentence UNDER analysis>"
    }
  },
  "moneyline": {
    "best_side": "${bets.ml_home.edge_pct >= bets.ml_away.edge_pct ? 'home' : 'away'}",
    "home": {
      "label": "${bets.ml_home.label}",
      "verdict": "${bets.ml_home.verdict}",
      "win_pct": ${f(bets.ml_home.win_pct * 100)},
      "edge_pct": ${f(bets.ml_home.edge_pct)},
      "odds": ${req.odds_ml_home},
      "fair_line": "Fair ML ${sim.fair_moneyline_home} vs market ${fo(req.odds_ml_home)}",
      "analysis": "<your 2-3 sentence ML HOME analysis>"
    },
    "away": {
      "label": "${bets.ml_away.label}",
      "verdict": "${bets.ml_away.verdict}",
      "win_pct": ${f(bets.ml_away.win_pct * 100)},
      "edge_pct": ${f(bets.ml_away.edge_pct)},
      "odds": ${req.odds_ml_away},
      "fair_line": "Fair ML ${sim.fair_moneyline_away} vs market ${fo(req.odds_ml_away)}",
      "analysis": "<your 2-3 sentence ML AWAY analysis>"
    }
  },
  "top_pick": {
    "bet_category": "<spread|total|moneyline>",
    "label": "<best bet label>",
    "verdict": "${sim.best_edge_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE ? 'BET' : 'PASS'}",
    "win_pct": <number>,
    "edge_pct": ${f(sim.best_edge_score)},
    "odds": <number>,
    "fair_line": "<string>",
    "analysis": "<2-3 sentences: why this is the top bet, what stat drives it, sizing recommendation>"
  },
  "key_factors": [
    "<specific stat #1 with numbers vs national average>",
    "<specific stat #2 — fair line vs market gap>",
    "<specific stat #3 — pace/scoring environment driver>"
  ],
  "sizing_note": "<1 sentence on unit sizing based on edge tier>"
}
`
}

// ── Fallback if Claude JSON fails ─────────────────────────────────────────────
function buildFallback(sim: CBBSimResults, req: SimulationRequest) {
  const { bets } = sim
  const f  = (n: number, d = 1) => n.toFixed(d)
  const fo = (n: number)        => (n > 0 ? `+${n}` : `${n}`)

  const mkSection = (b: BetEdge, fairLine: string, analysis: string): BetSection => ({
    label:    b.label,
    verdict:  b.verdict,
    win_pct:  parseFloat((b.win_pct * 100).toFixed(1)),
    edge_pct: parseFloat(b.edge_pct.toFixed(1)),
    odds:     b.odds,
    fair_line: fairLine,
    analysis,
  })

  const spreadFair = `Fair ${f(sim.fair_spread)} vs market ${req.spread_home} — ${f(Math.abs(sim.spread_vs_market), 2)} pt gap`
  const totalFair  = `Fair total ${f(sim.fair_total)} vs market ${req.total} — ${f(Math.abs(sim.total_vs_market), 2)} pt gap`

  // Pick top bet
  const allBets = Object.values(bets)
  const best = allBets.sort((a, b) => b.edge_pct - a.edge_pct)[0]
  const betCat: 'spread' | 'total' | 'moneyline' =
    best.side.includes('spread') ? 'spread' :
    best.side === 'over' || best.side === 'under' ? 'total' : 'moneyline'

  return {
    projected_score: {
      home: Math.round(sim.home_mean_pts),
      away: Math.round(sim.away_mean_pts),
      home_team: req.home_team,
      away_team: req.away_team,
    },
    headline: `${req.home_team} vs ${req.away_team} — ${f(sim.best_edge_score)}% edge on ${best.label}`,
    game_summary: `Our analytics project ${req.home_team} ${f(sim.home_mean_pts, 0)}–${req.away_team} ${f(sim.away_mean_pts, 0)}, a fair spread of ${f(sim.fair_spread)} vs market ${req.spread_home}. ${req.home_team} ORtg ${f(sim.home_weighted.ORtg)} vs ${req.away_team} DRtg ${f(sim.away_weighted.DRtg)} is the key matchup driver. The fair total of ${f(sim.fair_total)} vs market ${req.total} shows ${sim.total_vs_market > 0 ? 'over' : 'under'} pressure of ${f(Math.abs(sim.total_vs_market), 2)} pts.`,
    spread: {
      best_side: bets.spread_home.edge_pct >= bets.spread_away.edge_pct ? 'home' as const : 'away' as const,
      home: mkSection(bets.spread_home, spreadFair,
        `Our fair spread of ${f(sim.fair_spread)} vs market ${req.spread_home} creates a ${f(Math.abs(sim.spread_vs_market), 2)}-pt pricing gap. ${req.home_team}'s ORtg ${f(sim.home_weighted.ORtg)} against ${req.away_team}'s DRtg ${f(sim.away_weighted.DRtg)} drives a ${(bets.spread_home.win_pct * 100).toFixed(1)}% cover probability. Edge score ${f(bets.spread_home.edge_pct)}% — ${bets.spread_home.verdict}.`),
      away: mkSection(bets.spread_away, spreadFair,
        `${req.away_team} covers ${(bets.spread_away.win_pct * 100).toFixed(1)}% of projections at +${Math.abs(req.spread_home)}. Their ORtg ${f(sim.away_weighted.ORtg)} vs ${req.home_team}'s DRtg ${f(sim.home_weighted.DRtg)} ${sim.away_weighted.ORtg > sim.home_weighted.DRtg ? 'favors the away offense' : 'favors the home defense'}. Edge score ${f(bets.spread_away.edge_pct)}% — ${bets.spread_away.verdict}.`),
    },
    total: {
      best_side: bets.over.edge_pct >= bets.under.edge_pct ? 'over' as const : 'under' as const,
      over: mkSection(bets.over, totalFair,
        `Our fair total of ${f(sim.fair_total)} sits ${f(Math.abs(sim.total_vs_market), 2)} pts ${sim.total_vs_market > 0 ? 'above' : 'below'} the market ${req.total}. At ${f(sim.expected_possessions)} possessions and combined PPP of ${f(sim.home_ppp + sim.away_ppp, 4)}, the scoring environment ${sim.total_vs_market > 0 ? 'supports over pressure' : 'does not support over'}. Edge score ${f(bets.over.edge_pct)}% — ${bets.over.verdict}.`),
      under: mkSection(bets.under, totalFair,
        `The under at ${req.total} captures ${(bets.under.win_pct * 100).toFixed(1)}% of projected outcomes. Style adjustments (Home ${f(sim.home_style_adj, 3)}, Away ${f(sim.away_style_adj, 3)} pts) and ${f(sim.expected_possessions)} possessions ${sim.total_vs_market < 0 ? 'support scoring suppression' : 'do not strongly support the under'}. Edge score ${f(bets.under.edge_pct)}% — ${bets.under.verdict}.`),
    },
    moneyline: {
      best_side: bets.ml_home.edge_pct >= bets.ml_away.edge_pct ? 'home' as const : 'away' as const,
      home: mkSection(bets.ml_home, `Fair ML ${sim.fair_moneyline_home} vs market ${fo(req.odds_ml_home)}`,
        `${req.home_team} wins ${(bets.ml_home.win_pct * 100).toFixed(1)}% outright. Fair ML of ${sim.fair_moneyline_home} vs market ${fo(req.odds_ml_home)} ${Math.abs(sim.fair_moneyline_home) < Math.abs(req.odds_ml_home) && req.odds_ml_home < 0 ? 'shows the market overpricing this favorite' : 'is in line with market pricing'}. Edge score ${f(bets.ml_home.edge_pct)}% — ${bets.ml_home.verdict}.`),
      away: mkSection(bets.ml_away, `Fair ML ${sim.fair_moneyline_away} vs market ${fo(req.odds_ml_away)}`,
        `${req.away_team} wins ${(bets.ml_away.win_pct * 100).toFixed(1)}% outright. Fair ML ${sim.fair_moneyline_away} vs market ${fo(req.odds_ml_away)} — the gap between fair and market odds defines the EV opportunity. Edge score ${f(bets.ml_away.edge_pct)}% — ${bets.ml_away.verdict}.`),
    },
    top_pick: {
      bet_category: betCat,
      label:    best.label,
      verdict:  best.verdict,
      win_pct:  parseFloat((best.win_pct * 100).toFixed(1)),
      edge_pct: parseFloat(best.edge_pct.toFixed(1)),
      odds:     best.odds,
      fair_line: `Edge score ${f(best.edge_pct)}% — top bet this game`,
      analysis: `${best.label} is the highest-value bet at ${f(best.edge_pct)}% edge and ${(best.win_pct * 100).toFixed(1)}% win probability. ${best.verdict === 'BET' ? 'Qualifies as a full unit recommendation.' : 'Edge is below the full-unit threshold — monitor for line movement.'}`,
    },
    key_factors: [
      `${req.home_team} ORtg ${f(sim.home_weighted.ORtg)} vs ${req.away_team} DRtg ${f(sim.away_weighted.DRtg)} [nat avg 104]`,
      `Fair total ${f(sim.fair_total)} vs market ${req.total} — ${f(Math.abs(sim.total_vs_market), 2)}-pt ${sim.total_vs_market > 0 ? 'over' : 'under'} pressure`,
      `Pace ${f(sim.expected_possessions)} possessions — ${sim.expected_possessions > 69 ? 'above average, adds scoring variance' : 'below average, limits total ceiling'}`,
    ],
    sizing_note: sim.best_edge_score >= 28 ? 'Exceptional edge — full unit recommended.' :
                 sim.best_edge_score >= 20 ? 'Strong edge — standard unit recommended.' :
                 'Edge below threshold — no bet or minimal sizing.',
  }
}

// ── Store in Supabase ─────────────────────────────────────────────────────────
async function storePrediction(req: SimulationRequest, sim: CBBSimResults, output: SimulationOutput): Promise<string> {
  const edgeClass = classifyEdgeScore(sim.best_edge_score)

  const { data, error } = await supabaseAdmin
    .from('ai_predictions')
    .insert({
      prediction_type:      req.is_hot_pick ? 'hot_pick' : 'user_simulation',
      requested_by:         req.user_id || null,
      confidence_score:     output.confidence        ?? 0,
      edge_score:           output.edge_up_score      ?? 0,
      ai_analysis:          output.game_summary       || 'No analysis available',
      key_factors:          output.key_factors        ?? [],
      risk_assessment:      output.top_pick?.analysis || 'No risk assessment',
      recommended_bet_type: (() => {
        const cat = output.top_pick?.bet_category || 'spread'
        return cat === 'total' ? 'over_under' : cat
      })(),
      recommended_line:     { top_pick: output.top_pick ?? {} },
      odds_snapshot:        { spread: req.spread_home, total: req.total, ml_home: req.odds_ml_home, ml_away: req.odds_ml_away },
      sport:                req.sport,
      home_team:            req.home_team,
      away_team:            req.away_team,
      game_time:            req.game_time || null,
      edge_tier:            edgeClass.tier,
      projected_home_score: output.projected_score?.home ?? null,
      projected_away_score: output.projected_score?.away ?? null,
      fair_spread:          sim.fair_spread,
      fair_total:           sim.fair_total,
      market_spread:        req.spread_home,
      market_total:         req.total,
      sim_home_win_pct:     sim.home_win_pct,
      sim_home_cover_pct:   sim.home_cover_pct,
      sim_over_pct:         sim.over_pct,
      full_response:        output,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[storePrediction] INSERT FAILED:', error.message, error.details, error.hint)
    throw new Error(`Failed to store prediction: ${error.message}`)
  }

  console.log('[storePrediction] Saved:', data?.id)
  return data?.id || ''
}