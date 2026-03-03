import { SimulationOutput } from '@/lib/ai/claude-agent'
import { EdgeScoreBadge } from '@/components/ui/EdgeScoreBadge'
import { classifyEdgeScore } from '@/lib/ai/edge-classifier'

interface SimResultCardProps {
  result: SimulationOutput
}

export function SimResultCard({ result }: SimResultCardProps) {
  const classification = classifyEdgeScore(result.edge_up_score)
  const isBet = result.recommendation === 'BET'
  const mvm = result.market_vs_model

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-5">
      
      {/* Header Row */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{result.headline}</h3>
          <p className="text-sm text-gray-400 mt-1">
            {result.projected_score.away_team} @ {result.projected_score.home_team}
          </p>
        </div>
        <EdgeScoreBadge score={result.edge_up_score} size="lg" />
      </div>

      {/* Recommendation Banner */}
      {isBet ? (
        <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-xl">✅</span>
            <div>
              <div className="text-green-300 font-bold text-lg">
                BET: {result.bet_type} — {result.bet_side}
              </div>
              <div className="text-green-400 text-sm mt-0.5">
                {result.confidence.toFixed(1)}% simulation confidence · {result.sizing_note}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-xl">{classification.tier === 'RISKY' ? '⚠️' : '❌'}</span>
            <div>
              <div className="text-gray-300 font-bold">{classification.label}</div>
              <div className="text-gray-400 text-sm mt-0.5">{classification.description}</div>
            </div>
          </div>
        </div>
      )}

      {/* Projected Score & Fair Lines */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Projected Score</div>
          <div className="text-white font-mono">
            <div>{result.projected_score.home_team}: <span className="text-blue-300 font-bold">{result.projected_score.home}</span></div>
            <div>{result.projected_score.away_team}: <span className="text-blue-300 font-bold">{result.projected_score.away}</span></div>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Model vs Market</div>
          <div className="text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Spread gap:</span>
              <span className={mvm.spread_gap > 1.5 ? 'text-green-400 font-bold' : 'text-gray-300'}>
                {mvm.spread_gap > 0 ? '+' : ''}{mvm.spread_gap.toFixed(1)} pts
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-gray-400">Total gap:</span>
              <span className={Math.abs(mvm.total_gap) > 3 ? 'text-green-400 font-bold' : 'text-gray-300'}>
                {mvm.total_gap > 0 ? '+' : ''}{mvm.total_gap.toFixed(1)} pts
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <p className="text-gray-300 leading-relaxed">{result.summary}</p>

      {/* Key Factors */}
      <div>
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Key Factors</h4>
        <ul className="space-y-1">
          {result.key_factors.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-green-400 mt-0.5">›</span>
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Risk Factors */}
      <div>
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Risk Factors</h4>
        <ul className="space-y-1">
          {result.risk_factors.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-orange-300">
              <span className="text-orange-400 mt-0.5">⚠</span>
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Full Analysis (expandable) */}
      <details className="group">
        <summary className="text-sm text-blue-400 cursor-pointer hover:text-blue-300 select-none">
          Full Model Analysis ▾
        </summary>
        <p className="text-gray-400 text-sm mt-3 leading-relaxed">{result.analysis}</p>
        
        {/* Raw model data for power users */}
        <div className="mt-3 bg-gray-950 rounded p-3 font-mono text-xs text-gray-500">
          <div>Home Win: {(result.model_data.home_win_pct * 100).toFixed(1)}% | Cover: {(result.model_data.home_cover_pct * 100).toFixed(1)}% | Over: {(result.model_data.over_pct * 100).toFixed(1)}%</div>
          <div>Fair Spread: {result.model_data.fair_spread?.toFixed(1)} | Fair Total: {result.model_data.fair_total?.toFixed(1)}</div>
        </div>
      </details>

    </div>
  )
}