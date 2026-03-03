// src/lib/ai/claude-agent.ts
//
// FIXES vs original guide:
//   1. Table name: ai_predictions (NOT predictions — that table doesn't exist)
//   2. Table name: profiles (NOT user_profiles — that table doesn't exist)
//   3. sim_count_today column lives on profiles (not a separate table)
//   4. Import paths all corrected to match actual file locations
//   5. buildCBBPrompt: added ANALYSIS WRITING RULES — no Monte Carlo references
//   6. buildFallback: analysis field no longer exposes methodology
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import { runCBBSimulation, CBBGameInput, CBBSimResults, CBB_PARAMS } from './engines/cbb-sim-engine'
import { getTeamStats } from '../sportradar/stats'
import { classifyEdgeScore, RECOMMENDATION_THRESHOLD } from './edge-classifier'
import { EDGE_UP_SIM_SYSTEM_PROMPT } from './prompts/system-prompt'
import { supabaseAdmin } from '../database/supabase-admin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Request / Response types ──────────────────────────────────────────────────
export interface SimulationRequest {
  event_id:        string
  home_team:       string
  away_team:       string
  home_team_sr_id: string   // SportRadar UUID for stats API
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

export interface SimulationOutput {
  recommendation: 'BET' | 'NO BET'
  edge_tier:      string
  bet_type:       string
  bet_side:       string
  edge_up_score:  number
  confidence:     number
  projected_score: { home: number; away: number; home_team: string; away_team: string }
  market_vs_model: {
    fair_spread: number; market_spread: number; spread_gap: number
    fair_total: number;  market_total: number;  total_gap:  number
  }
  headline:      string
  summary:       string
  key_factors:   string[]
  risk_factors:  string[]
  analysis:      string
  sizing_note:   string
  model_data:    Record<string, number>
  // Meta
  sim_results:    CBBSimResults
  prediction_id:  string
  sport:          string
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runGameSimulation(req: SimulationRequest): Promise<SimulationOutput> {

  // 1. Fetch team stats from SportRadar
  const [homeStats, awayStats] = await Promise.all([
    getTeamStats(req.home_team_sr_id, req.sport as 'ncaab'),
    getTeamStats(req.away_team_sr_id, req.sport as 'ncaab'),
  ])

  // 2. Build simulation input
  const simInput: CBBGameInput = {
    home: {
      name:   req.home_team,
      season: homeStats.season,
      last10: homeStats.last10,
    },
    away: {
      name:   req.away_team,
      season: awayStats.season,
      last10: awayStats.last10,
    },
    spread_home:  req.spread_home,
    total:        req.total,
    odds_spread:  req.odds_spread  || -110,
    odds_total:   req.odds_total   || -110,
    odds_ml_home: req.odds_ml_home || -150,
    odds_ml_away: req.odds_ml_away || +130,
    neutral_site: req.neutral_site,
  }

  // 3. Run simulation
  const simResults = runCBBSimulation(simInput, CBB_PARAMS)

  // 4. Classify edge score
  const edgeClass = classifyEdgeScore(simResults.best_edge_score)

  // 5. Build prompt for Claude
  const userPrompt = buildCBBPrompt(req, simResults, homeStats, awayStats)

  // 6. Call Claude
  const message = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system:     EDGE_UP_SIM_SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  // 7. Parse response
  const rawText = message.content[0].type === 'text' ? message.content[0].text : '{}'
  let aiOutput: Omit<SimulationOutput, 'sim_results' | 'prediction_id' | 'sport'>

  try {
    const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim()
    aiOutput = JSON.parse(cleaned)
  } catch {
    aiOutput = buildFallback(simResults, req, edgeClass)
  }

  // 8. Store in Supabase
  const predictionId = await storePrediction(req, simResults, aiOutput)

  return {
    ...aiOutput,
    sim_results:   simResults,
    prediction_id: predictionId,
    sport:         req.sport,
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildCBBPrompt(
  req: SimulationRequest,
  sim: CBBSimResults,
  homeStats: any,
  awayStats: any
): string {
  return `
## GAME: ${req.away_team} @ ${req.home_team}
Sport: NCAA Men's Basketball (CBB)
Site: ${req.neutral_site ? 'Neutral Site' : `${req.home_team} (Home)`}
Game Time: ${req.game_time || 'TBD'}
Market Spread: ${req.home_team} ${req.spread_home > 0 ? '+' : ''}${req.spread_home} (${req.odds_spread})
Market Total: ${req.total} (${req.odds_total})

## ANALYTICS RESULTS
Home Win Probability:    ${(sim.home_win_pct    * 100).toFixed(1)}%
Home Cover Probability:  ${(sim.home_cover_pct  * 100).toFixed(1)}%
Away Cover Probability:  ${(sim.away_cover_pct  * 100).toFixed(1)}%
Over Probability:        ${(sim.over_pct         * 100).toFixed(1)}%
Under Probability:       ${(sim.under_pct        * 100).toFixed(1)}%

## FAIR LINES
Fair Spread (Home):    ${sim.fair_spread.toFixed(1)} | Market: ${req.spread_home} | GAP: ${sim.spread_vs_market.toFixed(1)} pts
Fair Total:            ${sim.fair_total.toFixed(1)}  | Market: ${req.total}       | GAP: ${sim.total_vs_market.toFixed(1)} pts
Fair Moneyline (Home): ${Math.round(sim.fair_moneyline_home)}

## EDGE SCORES (% ROI)
Spread Home Cover: ${sim.edge_spread_home.toFixed(1)}%
Spread Away Cover: ${sim.edge_spread_away.toFixed(1)}%
Over:              ${sim.edge_over.toFixed(1)}%
Under:             ${sim.edge_under.toFixed(1)}%
→ BEST BET: ${sim.best_bet} | Edge: ${sim.best_edge_score.toFixed(1)}% | Confidence: ${sim.best_confidence_pct.toFixed(1)}%

## PROJECTED SCORE
${req.home_team}: ${sim.home_mean_pts.toFixed(1)} pts (SD ±${sim.home_sd.toFixed(1)})
${req.away_team}: ${sim.away_mean_pts.toFixed(1)} pts (SD ±${sim.away_sd.toFixed(1)})
Expected Possessions: ${sim.expected_possessions.toFixed(1)}

## ${req.home_team.toUpperCase()} WEIGHTED STATS (vs National Avg)
ORtg:     ${sim.home_weighted.ORtg.toFixed(1)}     [nat avg: 104]
DRtg:     ${sim.home_weighted.DRtg.toFixed(1)}     [nat avg: 104, lower=better]
Pace:     ${sim.home_weighted.Pace.toFixed(1)}     [nat avg: 69]
3PAR:     ${(sim.home_weighted.ThreePAR * 100).toFixed(1)}%  [nat avg: 39%]
TOV:      ${(sim.home_weighted.TOV      * 100).toFixed(1)}%  [nat avg: 18%]
FTr:      ${(sim.home_weighted.FTr      * 100).toFixed(1)}%  [nat avg: 30%]
ORB:      ${(sim.home_weighted.ORB      * 100).toFixed(1)}%  [nat avg: 30%]
PPP:      ${sim.home_ppp.toFixed(4)}
StyleAdj: ${sim.home_style_adj.toFixed(3)} pts

## ${req.away_team.toUpperCase()} WEIGHTED STATS (vs National Avg)
ORtg:     ${sim.away_weighted.ORtg.toFixed(1)}     [nat avg: 104]
DRtg:     ${sim.away_weighted.DRtg.toFixed(1)}     [nat avg: 104]
Pace:     ${sim.away_weighted.Pace.toFixed(1)}     [nat avg: 69]
3PAR:     ${(sim.away_weighted.ThreePAR * 100).toFixed(1)}%  [nat avg: 39%]
TOV:      ${(sim.away_weighted.TOV      * 100).toFixed(1)}%  [nat avg: 18%]
FTr:      ${(sim.away_weighted.FTr      * 100).toFixed(1)}%  [nat avg: 30%]
ORB:      ${(sim.away_weighted.ORB      * 100).toFixed(1)}%  [nat avg: 30%]
PPP:      ${sim.away_ppp.toFixed(4)}
StyleAdj: ${sim.away_style_adj.toFixed(3)} pts

## RAW SEASON STATS (for reference)
${req.home_team}: ${homeStats.games_played} games, ${homeStats.raw_season?.ppg?.toFixed(1)} PPG, ${homeStats.raw_season?.opp_ppg?.toFixed(1)} OPP PPG
${req.away_team}: ${awayStats.games_played} games, ${awayStats.raw_season?.ppg?.toFixed(1)} PPG, ${awayStats.raw_season?.opp_ppg?.toFixed(1)} OPP PPG

${sim.best_edge_score < RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE
  ? `⚠️ NOTE: Best edge score is ${sim.best_edge_score.toFixed(1)}% — BELOW the 20% threshold. Return recommendation: "NO BET".`
  : `✅ Best bet qualifies for recommendation (${sim.best_edge_score.toFixed(1)}% ≥ 20% threshold).`
}

## ANALYSIS WRITING RULES — MANDATORY
Your "analysis" JSON field MUST follow all of these rules:

1. Write exactly 4–6 sentences. No more, no less.
2. NEVER use these words anywhere in analysis, summary, headline, or key_factors:
   "Monte Carlo", "simulation", "iterations", "runs", "model", "algorithm"
   Use instead: "our analytics", "the edge score", "our projections", "the data"
3. Structure your sentences in this order:
   - Sentence 1: Name the PRIMARY edge driver using specific ORtg/DRtg numbers vs 104 national avg
   - Sentence 2: Explain the offensive-vs-defensive matchup — which team wins that battle and why
   - Sentence 3: State the exact fair spread vs market spread gap (e.g. "Our fair line of -5.5 vs market -3.5 is a 2-point underpriced gap")
   - Sentence 4: State the exact fair total vs market total gap and direction (over/under pressure)
   - Sentence 5: Connect pace to total variance — are we in a high or low scoring environment
   - Sentence 6: Confidence level and bet sizing recommendation

GOOD example:
"South Carolina's defense (DRtg 97.2) runs 6.8 points better than the national average of 104, directly suppressing Tennessee's offense (ORtg 106.1). The Gamecocks hold a structural defensive edge at home, giving their spread a legitimate analytical basis over Tennessee's scoring ability. Our fair line projects South Carolina -5.5 vs the market -3.5 — a 2-point pricing gap that drives the edge score. The fair total of 138.2 sits 3.3 points below the market line of 141.5, adding mild under pressure to a defense-dominated environment. Pace of 68.4 possessions is below average, reinforcing fewer total scoring opportunities and lower variance. The edge is strong — standard unit recommended on South Carolina spread."

BAD example (NEVER write like this):
"Monte Carlo simulation (10,000 runs) — Tennessee @ South Carolina. Model identifies a 20% edge on spread. Total: 141.5."

## OUTPUT INSTRUCTIONS
Return ONLY valid JSON. No markdown fences. No text before or after the JSON object.
`
}

// ── Fallback if Claude JSON parse fails ───────────────────────────────────────
function buildFallback(sim: CBBSimResults, req: SimulationRequest, edgeClass: any) {
  const rec = sim.best_edge_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE ? 'BET' : 'NO BET'

  // Determine which team has the edge for narrative
  const edgeTeam     = sim.spread_vs_market < 0 ? req.home_team : req.away_team
  const oppositeTeam = sim.spread_vs_market < 0 ? req.away_team : req.home_team
  const spreadGap    = Math.abs(sim.spread_vs_market).toFixed(1)
  const totalGap     = Math.abs(sim.total_vs_market).toFixed(1)
  const totalDir     = sim.total_vs_market > 0 ? 'over' : 'under'

  return {
    recommendation: rec as 'BET' | 'NO BET',
    edge_tier:      edgeClass.tier,
    bet_type:       sim.best_bet.includes('spread') ? 'Spread'
                  : sim.best_bet === 'over' || sim.best_bet === 'under' ? 'Total'
                  : 'Moneyline',
    bet_side:        sim.best_bet,
    edge_up_score:   Math.round(sim.best_edge_score * 10) / 10,
    confidence:      Math.round(sim.best_confidence_pct * 10) / 10,
    projected_score: {
      home:       Math.round(sim.home_mean_pts * 10) / 10,
      away:       Math.round(sim.away_mean_pts * 10) / 10,
      home_team:  req.home_team,
      away_team:  req.away_team,
    },
    market_vs_model: {
      fair_spread:   Math.round(sim.fair_spread * 10) / 10,
      market_spread: req.spread_home,
      spread_gap:    Math.round(sim.spread_vs_market * 10) / 10,
      fair_total:    Math.round(sim.fair_total * 10) / 10,
      market_total:  req.total,
      total_gap:     Math.round(sim.total_vs_market * 10) / 10,
    },
    headline:    `${edgeTeam} undervalued by ${spreadGap} pts — edge score ${sim.best_edge_score.toFixed(1)}%`,
    summary:     `Our analytics project ${req.home_team} ${sim.home_mean_pts.toFixed(0)} – ${req.away_team} ${sim.away_mean_pts.toFixed(0)}. Fair spread of ${sim.fair_spread.toFixed(1)} vs market ${req.spread_home} represents a ${spreadGap}-point pricing gap in favor of ${edgeTeam}.`,
    key_factors: [
      `${req.home_team} ORtg ${sim.home_weighted.ORtg.toFixed(1)} vs ${req.away_team} DRtg ${sim.away_weighted.DRtg.toFixed(1)} [nat avg: 104]`,
      `Expected possessions: ${sim.expected_possessions.toFixed(1)} — fair total ${sim.fair_total.toFixed(1)} vs market ${req.total} (${totalGap}-pt gap, ${totalDir} pressure)`,
      `${edgeTeam} undervalued by ${spreadGap} pts vs market — ${oppositeTeam} overpriced at current spread`,
    ],
    risk_factors: [
      `${req.away_team} pace of ${sim.away_weighted.Pace.toFixed(1)} possessions could expand variance beyond projections`,
      `3-point variance (${(sim.home_weighted.ThreePAR * 100).toFixed(0)}% home 3PAR vs ${(sim.away_weighted.ThreePAR * 100).toFixed(0)}% away) can shift outcomes in single-game samples`,
    ],
    analysis: `${req.home_team}'s defense (DRtg ${sim.home_weighted.DRtg.toFixed(1)}) ${sim.home_weighted.DRtg < 104 ? `runs ${(104 - sim.home_weighted.DRtg).toFixed(1)} points better than the national average of 104` : `trails the national average of 104 by ${(sim.home_weighted.DRtg - 104).toFixed(1)} points`}, directly impacting ${req.away_team}'s scoring potential (ORtg ${sim.away_weighted.ORtg.toFixed(1)}). Our analytics project a final score of ${req.home_team} ${sim.home_mean_pts.toFixed(0)} – ${req.away_team} ${sim.away_mean_pts.toFixed(0)}, giving ${edgeTeam} the structural advantage in this matchup. The fair spread of ${sim.fair_spread.toFixed(1)} vs the market line of ${req.spread_home} represents a ${spreadGap}-point pricing gap — that gap is the source of the edge. Our fair total of ${sim.fair_total.toFixed(1)} sits ${totalGap} points ${totalDir === 'over' ? 'above' : 'below'} the market line of ${req.total}, suggesting ${totalDir} pressure in this environment. Pace of ${sim.expected_possessions.toFixed(1)} possessions ${sim.expected_possessions < 69 ? 'is below average, limiting scoring opportunities' : 'is above average, adding total variance'}. ${edgeClass.tier === 'STRONG' || edgeClass.tier === 'EXCEPTIONAL' ? 'The edge is strong — standard unit recommended.' : 'Moderate edge — consider half unit sizing.'}`,
    sizing_note:  edgeClass.tier === 'EXCEPTIONAL' ? 'Exceptional edge — full unit recommended.'
                : edgeClass.tier === 'STRONG'      ? 'Strong edge — standard unit recommended.'
                : 'Moderate edge — half unit or reduced sizing.',
    model_data: {
      home_win_pct:   sim.home_win_pct,
      home_cover_pct: sim.home_cover_pct,
      over_pct:       sim.over_pct,
      fair_spread:    sim.fair_spread,
      fair_total:     sim.fair_total,
      ev_best_bet:    sim.best_edge_score / 100,
    },
  }
}

// ── Store in Supabase ─────────────────────────────────────────────────────────
async function storePrediction(
  req: SimulationRequest,
  sim: CBBSimResults,
  output: any
): Promise<string> {
  const edgeClass = classifyEdgeScore(output.edge_up_score || 0)

  const { data } = await supabaseAdmin
    .from('ai_predictions')
    .insert({
      prediction_type:      req.is_hot_pick ? 'hot_pick' : 'user_simulation',
      requested_by:         req.user_id || null,
      confidence_score:     output.confidence,
      edge_score:           output.edge_up_score,
      ai_analysis:          output.analysis,
      key_factors:          output.key_factors,
      risk_assessment:      output.risk_factors?.join(' | ') || '',
      recommended_bet_type: output.bet_type?.toLowerCase().replace('/', '_') || 'spread',
      recommended_line:     output.market_vs_model || {},
      odds_snapshot:        { spread: req.spread_home, total: req.total, ml_home: req.odds_ml_home, ml_away: req.odds_ml_away },

      // Extended simulation columns
      sport:                req.sport,
      home_team:            req.home_team,
      away_team:            req.away_team,
      game_time:            req.game_time || null,
      edge_tier:            edgeClass.tier,
      projected_home_score: output.projected_score?.home,
      projected_away_score: output.projected_score?.away,
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

  return data?.id || ''
}