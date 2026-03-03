// src/lib/ai/claude-agent.ts
//
// FIXES vs original guide:
//   1. Table name: ai_predictions (NOT predictions — that table doesn't exist)
//   2. Table name: profiles (NOT user_profiles — that table doesn't exist)
//   3. sim_count_today column lives on profiles (not a separate table)
//   4. Import paths all corrected to match actual file locations
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

  // 3. Run 20,000-iteration Monte Carlo simulation
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

  // 8. Store in Supabase (ai_predictions table — your actual table name)
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

## SIMULATION RESULTS (20,000 runs)
Home Win Probability:    ${(sim.home_win_pct    * 100).toFixed(1)}%
Home Cover Probability:  ${(sim.home_cover_pct  * 100).toFixed(1)}%
Away Cover Probability:  ${(sim.away_cover_pct  * 100).toFixed(1)}%
Over Probability:        ${(sim.over_pct         * 100).toFixed(1)}%
Under Probability:       ${(sim.under_pct        * 100).toFixed(1)}%

## FAIR LINES
Fair Spread (Home):  ${sim.fair_spread.toFixed(1)} | Market: ${req.spread_home} | GAP: ${sim.spread_vs_market.toFixed(1)} pts
Fair Total:          ${sim.fair_total.toFixed(1)}  | Market: ${req.total}       | GAP: ${sim.total_vs_market.toFixed(1)} pts
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
`
}

// ── Fallback if Claude JSON parse fails ───────────────────────────────────────
function buildFallback(sim: CBBSimResults, req: SimulationRequest, edgeClass: any) {
  const rec = sim.best_edge_score >= RECOMMENDATION_THRESHOLD.MIN_EDGE_SCORE ? 'BET' : 'NO BET'
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
    headline:    `${req.home_team} vs ${req.away_team} — Edge: ${sim.best_edge_score.toFixed(1)}%`,
    summary:     `Model projects ${req.home_team} ${sim.home_mean_pts.toFixed(0)}-${req.away_team} ${sim.away_mean_pts.toFixed(0)}. Fair spread: ${sim.fair_spread.toFixed(1)}, market: ${req.spread_home}.`,
    key_factors: [
      `${req.home_team} ORtg ${sim.home_weighted.ORtg.toFixed(1)} vs ${req.away_team} DRtg ${sim.away_weighted.DRtg.toFixed(1)}`,
      `Expected possessions: ${sim.expected_possessions.toFixed(1)} (fair total: ${sim.fair_total.toFixed(1)})`,
      `${sim.spread_vs_market > 0 ? req.home_team : req.away_team} undervalued by ${Math.abs(sim.spread_vs_market).toFixed(1)} pts vs market`,
    ],
    risk_factors: [
      'Fallback response — Claude JSON parse error. Verify results manually.',
      'Use model_data tab for raw simulation outputs.',
    ],
    analysis:     `20,000-iteration simulation. Home cover: ${(sim.home_cover_pct * 100).toFixed(1)}%. Over: ${(sim.over_pct * 100).toFixed(1)}%.`,
    sizing_note:  edgeClass.tier === 'EXCEPTIONAL' ? 'Full unit.'
                : edgeClass.tier === 'STRONG'      ? 'Standard unit.'
                : 'Half unit or skip.',
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
// FIX: table name is ai_predictions (NOT predictions — that table doesn't exist)
async function storePrediction(
  req: SimulationRequest,
  sim: CBBSimResults,
  output: any
): Promise<string> {
  const edgeClass = classifyEdgeScore(output.edge_up_score || 0)

  const { data } = await supabaseAdmin
    .from('ai_predictions')    // ← FIX: your actual table name
    .insert({
      // Standard ai_predictions columns
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

      // Extended simulation columns (added by migration)
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