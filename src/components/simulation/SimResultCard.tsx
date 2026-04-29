'use client'

// src/components/simulation/SimResultCard.tsx
//
// REWRITTEN to match new SimulationOutput shape from claude-agent.ts:
//   - Removed: market_vs_model, bet_type, bet_side, summary, analysis,
//              key_factors, risk_factors, sizing_note, model_data
//   - Uses:    spread, total, moneyline, top_pick, game_summary,
//              projected_score, headline, edge_up_score, edge_tier,
//              recommendation, confidence
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type { SimulationOutput, BetSection } from '@/lib/ai/claude-agent'
import { EdgeScoreBadge } from '@/components/ui/EdgeScoreBadge'
import { classifyEdgeScore } from '@/lib/ai/edge-classifier'
import { formatTotal } from '@/lib/utils/format'

interface SimResultCardProps {
  result: SimulationOutput
}

// ── Bet section row ───────────────────────────────────────────────────────────
function BetRow({
  bet,
  isBest,
}: {
  bet: BetSection
  isBest: boolean
}) {
  const verdictColor =
    bet.verdict === 'BET'  ? 'text-green-300 bg-green-900/40 border-green-500/50' :
    bet.verdict === 'LEAN' ? 'text-yellow-300 bg-yellow-900/30 border-yellow-500/40' :
                             'text-gray-400 bg-gray-800/40 border-gray-600/30'

  return (
    <div className={`rounded-xl p-4 border transition ${
      isBest
        ? 'bg-green-900/20 border-green-500/40 ring-1 ring-green-500/30'
        : 'bg-slate-700/30 border-white/5'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isBest && (
            <span className="text-xs font-bold text-yellow-300 bg-yellow-900/40 px-2 py-0.5 rounded-full border border-yellow-500/30">
              ★ BEST
            </span>
          )}
          <span className="font-bold text-white text-sm">{bet.label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${verdictColor}`}>
            {bet.verdict}
          </span>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-black ${
            bet.edge_pct >= 20 ? 'text-green-300' :
            bet.edge_pct >= 12 ? 'text-yellow-300' : 'text-gray-400'
          }`}>
            {bet.edge_pct >= 0 ? '+' : ''}{bet.edge_pct.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">edge</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-400 mb-2">
        <span>Win prob: <span className="text-gray-200 font-semibold">{bet.win_pct.toFixed(1)}%</span></span>
        <span>Odds: <span className="text-gray-200 font-semibold">{bet.odds > 0 ? '+' : ''}{bet.odds}</span></span>
      </div>

      {bet.fair_line && (
        <p className="text-xs text-blue-300/80 mb-2">{bet.fair_line}</p>
      )}

      {bet.analysis && (
        <p className="text-xs text-gray-400 leading-relaxed">{bet.analysis}</p>
      )}
    </div>
  )
}

// ── Section card (Spread / Total / ML) ───────────────────────────────────────
function BetTypeSection({
  title,
  icon,
  iconBg,
  best,
  away,
}: {
  title: string
  icon: string
  iconBg: string
  best: string   // 'home' | 'away' | 'over' | 'under'
  away: BetSection
} & (
  | { best: 'home' | 'away'; home: BetSection }
  | { best: 'over' | 'under'; over: BetSection; under: BetSection }
)) {
  // TypeScript narrowing helper
  const props = arguments[0] as any

  return (
    <div className="bg-slate-800/40 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black text-white ${iconBg}`}>
          {icon}
        </span>
        <h4 className="font-bold text-white text-sm">{title}</h4>
      </div>

      <div className="space-y-3">
        {'home' in props ? (
          <>
            <BetRow bet={props.home} isBest={best === 'home'} />
            <BetRow bet={props.away} isBest={best === 'away'} />
          </>
        ) : (
          <>
            <BetRow bet={props.over}  isBest={best === 'over'} />
            <BetRow bet={props.under} isBest={best === 'under'} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function SimResultCard({ result }: SimResultCardProps) {
  const [expanded, setExpanded] = useState(false)
  const classification = classifyEdgeScore(result.edge_up_score)
  const isBet = result.recommendation === 'BET'
  const sim   = result.sim_results

  const tp = result.top_pick

  return (
    <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-lg font-black text-white leading-tight">{result.headline}</h3>
            <p className="text-sm text-gray-400 mt-1">
              {result.projected_score.away_team} @ {result.projected_score.home_team}
            </p>
          </div>
          <EdgeScoreBadge score={result.edge_up_score} size="lg" />
        </div>

        {/* Projected score */}
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>Projected:</span>
          <span className="font-bold text-white font-mono">
            {result.projected_score.home_team.split(' ').pop()} {result.projected_score.home.toFixed(0)}
            {' — '}
            {result.projected_score.away_team.split(' ').pop()} {result.projected_score.away.toFixed(0)}
          </span>
          <span className="text-gray-600">|</span>
          <span>Total: <span className="text-white font-semibold">{(result.projected_score.home + result.projected_score.away).toFixed(0)}</span></span>
        </div>
      </div>

      {/* ── Top Pick Banner ─────────────────────────────────────────────── */}
      {tp && (
        <div className={`px-6 py-4 border-b border-white/10 ${
          isBet
            ? 'bg-green-900/20'
            : 'bg-slate-800/40'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                {isBet ? '🏆 Top Pick' : 'Best Available'}
              </div>
              <div className={`text-xl font-black ${isBet ? 'text-green-300' : 'text-gray-200'}`}>
                {tp.label}
              </div>
              {tp.fair_line && (
                <p className="text-xs text-blue-300/80 mt-1">{tp.fair_line}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl font-black ${isBet ? 'text-green-300' : 'text-gray-300'}`}>
                {tp.edge_pct >= 0 ? '+' : ''}{tp.edge_pct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500">{result.confidence.toFixed(1)}% confidence</div>
            </div>
          </div>

          {tp.analysis && (
            <p className="text-sm text-gray-300 leading-relaxed mt-3">{tp.analysis}</p>
          )}

          <div className="mt-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              isBet
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-gray-600/40 text-gray-400 border border-gray-500/30'
            }`}>
              {isBet ? '✅ BET RECOMMENDED' : `⚠️ ${classification.label}`}
            </span>
          </div>
        </div>
      )}

      {/* ── Game Summary ────────────────────────────────────────────────── */}
      {result.game_summary && (
        <div className="px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300 leading-relaxed">{result.game_summary}</p>
        </div>
      )}

      {/* ── Three Bet Sections ──────────────────────────────────────────── */}
      <div className="p-6 space-y-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Breakdown</h4>

        {/* Point Spread */}
        <div className="bg-slate-800/40 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black text-white bg-purple-600">S</span>
            <h4 className="font-bold text-white text-sm">Point Spread</h4>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${
              result.spread.best_side === 'home'
                ? 'bg-purple-500/20 text-purple-300'
                : 'bg-purple-500/20 text-purple-300'
            }`}>
              Best: {result.spread.best_side === 'home' ? result.spread.home.label : result.spread.away.label}
            </span>
          </div>
          <div className="space-y-3">
            <BetRow bet={result.spread.home} isBest={result.spread.best_side === 'home'} />
            <BetRow bet={result.spread.away} isBest={result.spread.best_side === 'away'} />
          </div>
        </div>

        {/* Over / Under */}
        <div className="bg-slate-800/40 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black text-white bg-teal-600">T</span>
            <h4 className="font-bold text-white text-sm">Over / Under</h4>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold bg-teal-500/20 text-teal-300">
              Best: {result.total.best_side === 'over' ? result.total.over.label : result.total.under.label}
            </span>
          </div>
          <div className="space-y-3">
            <BetRow bet={result.total.over}  isBest={result.total.best_side === 'over'} />
            <BetRow bet={result.total.under} isBest={result.total.best_side === 'under'} />
          </div>
        </div>

        {/* Moneyline */}
        <div className="bg-slate-800/40 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black text-white bg-orange-600">M</span>
            <h4 className="font-bold text-white text-sm">Moneyline</h4>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold bg-orange-500/20 text-orange-300">
              Best: {result.moneyline.best_side === 'home' ? result.moneyline.home.label : result.moneyline.away.label}
            </span>
          </div>
          <div className="space-y-3">
            <BetRow bet={result.moneyline.home} isBest={result.moneyline.best_side === 'home'} />
            <BetRow bet={result.moneyline.away} isBest={result.moneyline.best_side === 'away'} />
          </div>
        </div>
      </div>

      {/* ── Model Data (collapsed) ──────────────────────────────────────── */}
      {sim && (
        <div className="px-6 pb-6">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            {expanded ? '▲ Hide model data' : '▾ Show model data'}
          </button>

          {expanded && (
            <div className="mt-3 bg-slate-950 rounded-xl p-4 font-mono text-xs text-gray-500 space-y-1">
              <div>Home Win: {(sim.home_win_pct * 100).toFixed(1)}%  |  Cover: {(sim.home_cover_pct * 100).toFixed(1)}%  |  Over: {(sim.over_pct * 100).toFixed(1)}%</div>
              <div>Fair Spread: {sim.fair_spread.toFixed(1)}  |  Fair Total: {formatTotal(sim.fair_total)}  |  Fair ML: {sim.fair_moneyline_home}</div>
              <div>Exp Poss: {sim.expected_possessions.toFixed(1)}  |  Home PPP: {sim.home_ppp.toFixed(4)}  |  Away PPP: {sim.away_ppp.toFixed(4)}</div>
              <div>Home Mean: {sim.home_mean_pts.toFixed(1)} ±{sim.home_sd.toFixed(1)}  |  Away Mean: {sim.away_mean_pts.toFixed(1)} ±{sim.away_sd.toFixed(1)}</div>
              <div>Home ORtg/DRtg: {sim.home_weighted.ORtg}/{sim.home_weighted.DRtg}  |  Away ORtg/DRtg: {sim.away_weighted.ORtg}/{sim.away_weighted.DRtg}</div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}