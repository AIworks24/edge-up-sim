'use client'
// src/app/history/page.tsx
//
// Full redesign: matches dark slate / glassmorphism design system used
// across the rest of the app. Includes:
//   - Performance stat cards (total, correct, win rate, avg edge)
//   - Filter tabs: All | Hot Picks | My Simulations
//   - Prediction cards with full data display (edge score, tier, bet, result)
//   - Empty state and loading skeleton
//   - Navigation consistent with rest of app
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useRouter }           from 'next/navigation'
import Link                    from 'next/link'
import {
  BarChart3, ChevronLeft, TrendingUp, Target,
  Percent, Flame, Calendar, CheckCircle2, XCircle,
  Clock, ChevronDown, ChevronUp, Zap,
} from 'lucide-react'
import { supabase } from '@/lib/database/supabase-client'

type FilterType = 'all' | 'hot_pick' | 'user_simulation'

interface Stats {
  total:         number
  correct:       number
  winRate:       number
  avgEdge:       number
}

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  EXCEPTIONAL: { label: 'Exceptional', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  STRONG:      { label: 'Strong',      color: 'text-green-300',   bg: 'bg-green-500/10  border-green-500/30'   },
  MODERATE:    { label: 'Moderate',    color: 'text-yellow-300',  bg: 'bg-yellow-500/10 border-yellow-500/30'  },
  RISKY:       { label: 'Risky',       color: 'text-orange-300',  bg: 'bg-orange-500/10 border-orange-500/30'  },
  NO_VALUE:    { label: 'No Value',    color: 'text-gray-400',    bg: 'bg-gray-500/10   border-gray-500/30'    },
}

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

// ── Expandable prediction card ────────────────────────────────────────────────
function PredictionCard({ pred }: { pred: any }) {
  const [expanded, setExpanded] = useState(false)

  const tier      = TIER_CONFIG[pred.edge_tier] ?? TIER_CONFIG.NO_VALUE
  const isHotPick = pred.prediction_type === 'hot_pick'
  const resolved  = pred.was_correct !== null
  const correct   = pred.was_correct === true

  const gameDate  = pred.game_time ?? pred.created_at
  const homeTeam  = pred.home_team ?? pred.event?.home_team ?? '—'
  const awayTeam  = pred.away_team ?? pred.event?.away_team ?? '—'
  const sport     = pred.sport     ?? pred.event?.sport_title ?? ''

  return (
    <div className={`bg-slate-800/50 backdrop-blur-xl border rounded-2xl overflow-hidden transition hover:bg-slate-800/70 ${
      resolved
        ? correct
          ? 'border-emerald-500/30'
          : 'border-red-500/20'
        : 'border-white/10'
    }`}>
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left: matchup info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {isHotPick ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 border border-orange-500/30 text-orange-300">
                  <Flame className="w-3 h-3" /> Hot Pick
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 border border-blue-500/30 text-blue-300">
                  <Zap className="w-3 h-3" /> Simulation
                </span>
              )}
              {sport && (
                <span className="text-xs text-gray-500 uppercase tracking-wider">{sport}</span>
              )}
              {resolved ? (
                correct ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" /> Correct
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 border border-red-500/30 text-red-400">
                    <XCircle className="w-3 h-3" /> Incorrect
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-600/50 text-gray-400">
                  <Clock className="w-3 h-3" /> Pending
                </span>
              )}
            </div>

            <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{awayTeam} @</p>
            <p className="text-lg font-black text-white leading-tight">{homeTeam}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(gameDate)}</span>
              {formatTime(gameDate) && <span>· {formatTime(gameDate)}</span>}
            </div>
          </div>

          {/* Right: edge score + tier */}
          <div className="text-right shrink-0">
            <div className={`text-3xl font-black ${tier.color}`}>
              {pred.edge_score != null ? `${pred.edge_score.toFixed(1)}%` : '—'}
            </div>
            <div className={`mt-1 inline-block text-xs font-bold px-2 py-0.5 rounded-full border ${tier.bg} ${tier.color}`}>
              {tier.label}
            </div>
          </div>
        </div>

        {/* Recommendation line */}
        {pred.recommended_line && (
          <div className="mt-4 p-3 bg-slate-700/40 rounded-xl border border-white/5">
            <p className="text-xs text-gray-500 mb-0.5 uppercase tracking-wider">Recommendation</p>
            <p className="text-sm font-semibold text-white">
              {typeof pred.recommended_line === 'string'
                ? pred.recommended_line
                : pred.recommended_line?.top_pick?.label ?? JSON.stringify(pred.recommended_line)}
            </p>
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
          {/* Sim metrics */}
          {(pred.sim_home_win_pct != null || pred.confidence_score != null) && (
            <div className="grid grid-cols-3 gap-3">
              {pred.confidence_score != null && (
                <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-white">{pred.confidence_score.toFixed(0)}%</div>
                  <div className="text-xs text-gray-500 mt-0.5">Confidence</div>
                </div>
              )}
              {pred.sim_home_win_pct != null && (
                <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-blue-300">{(pred.sim_home_win_pct * 100).toFixed(1)}%</div>
                  <div className="text-xs text-gray-500 mt-0.5">Home Win</div>
                </div>
              )}
              {pred.sim_home_cover_pct != null && (
                <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-purple-300">{(pred.sim_home_cover_pct * 100).toFixed(1)}%</div>
                  <div className="text-xs text-gray-500 mt-0.5">Cover %</div>
                </div>
              )}
            </div>
          )}

          {/* Projected scores */}
          {pred.projected_home_score != null && (
            <div className="bg-slate-700/30 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Projected Score</p>
              <div className="flex justify-between text-sm font-bold text-white">
                <span>{homeTeam}: {pred.projected_home_score.toFixed(0)}</span>
                <span>{awayTeam}: {pred.projected_away_score?.toFixed(0) ?? '—'}</span>
              </div>
            </div>
          )}

          {/* Actual score if resolved */}
          {resolved && pred.actual_score && (
            <div className={`rounded-xl p-3 border ${correct ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Final Score</p>
              <div className="flex justify-between text-sm font-bold text-white">
                <span>{homeTeam}: {pred.actual_score.home}</span>
                <span>{awayTeam}: {pred.actual_score.away}</span>
              </div>
            </div>
          )}

          {/* AI analysis snippet */}
          {pred.ai_analysis && (
            <div className="bg-slate-700/30 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">AI Analysis</p>
              <p className="text-xs text-gray-300 leading-relaxed line-clamp-4">{pred.ai_analysis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const router = useRouter()
  const [user,        setUser]        = useState<any>(null)
  const [predictions, setPredictions] = useState<any[]>([])
  const [stats,       setStats]       = useState<Stats>({ total: 0, correct: 0, winRate: 0, avgEdge: 0 })
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<FilterType>('all')

  useEffect(() => {
    checkUser()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUser(session.user)
    await loadHistory(session.user.id)
  }

  async function loadHistory(userId: string) {
    setLoading(true)
    try {
      let query = supabase
        .from('ai_predictions')
        .select(`
          id,
          home_team,
          away_team,
          sport,
          game_time,
          edge_score,
          edge_tier,
          confidence_score,
          recommended_bet_type,
          recommended_line,
          projected_home_score,
          projected_away_score,
          ai_analysis,
          market_spread,
          market_total,
          sim_home_win_pct,
          sim_home_cover_pct,
          sim_over_pct,
          prediction_type,
          was_correct,
          actual_score,
          created_at,
          is_daily_pick
        `)
        .eq('requested_by', userId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filter !== 'all') {
        query = query.eq('prediction_type', filter)
      }

      const { data, error } = await query
      if (error) throw error

      if (data) {
        setPredictions(data)
        calcStats(data)
      }
    } catch (err) {
      console.error('[History] Error loading predictions:', err)
    } finally {
      setLoading(false)
    }
  }

  function calcStats(preds: any[]) {
    const resolved = preds.filter(p => p.was_correct !== null)
    const correct  = resolved.filter(p => p.was_correct === true).length
    const winRate  = resolved.length > 0 ? (correct / resolved.length) * 100 : 0
    const avgEdge  = preds.length > 0
      ? preds.reduce((sum, p) => sum + (p.edge_score ?? 0), 0) / preds.length
      : 0

    setStats({ total: preds.length, correct, winRate, avgEdge })
  }

  const filterTabs: { key: FilterType; label: string; icon: React.ElementType }[] = [
    { key: 'all',             label: 'All',           icon: BarChart3 },
    { key: 'hot_pick',        label: 'Hot Picks',     icon: Flame     },
    { key: 'user_simulation', label: 'My Simulations', icon: Zap      },
  ]

  const statCards = [
    { label: 'Total Predictions', value: stats.total.toString(),            color: 'text-white',        icon: Target      },
    { label: 'Correct Picks',     value: stats.correct.toString(),           color: 'text-emerald-400',  icon: CheckCircle2 },
    { label: 'Win Rate',          value: `${stats.winRate.toFixed(1)}%`,     color: 'text-blue-400',     icon: TrendingUp  },
    { label: 'Avg Edge Score',    value: `+${stats.avgEdge.toFixed(1)}%`,    color: 'text-purple-400',   icon: Percent     },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" /> Dashboard
            </Link>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-500/20 rounded-lg">
                <BarChart3 className="w-4 h-4 text-purple-400" />
              </div>
              <h1 className="text-lg font-black text-white">Prediction History</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Stats overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card, i) => (
            <div key={i} className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:bg-slate-800/70 transition">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-white/5 rounded-lg">
                  <card.icon className="w-4 h-4 text-gray-400" />
                </div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</span>
              </div>
              <div className={`text-3xl font-black ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 bg-slate-800/40 border border-white/10 rounded-2xl p-1.5 w-fit">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                filter === tab.key
                  ? 'bg-slate-700 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Predictions list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800/40 border border-white/10 rounded-2xl p-5 animate-pulse h-40" />
            ))}
          </div>
        ) : predictions.length === 0 ? (
          <div className="bg-slate-800/50 border border-white/10 rounded-3xl p-16 text-center">
            <div className="w-20 h-20 bg-slate-700/50 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="w-10 h-10 text-gray-500" />
            </div>
            <h3 className="text-2xl font-black text-white mb-3">No predictions yet</h3>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              {filter === 'all'
                ? 'Your simulation history will appear here once you run your first prediction or receive hot picks.'
                : filter === 'hot_pick'
                ? 'No hot picks in your history yet. They appear automatically each day.'
                : 'Run a custom simulation to see your results here.'}
            </p>
            <Link
              href="/simulate"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-bold transition shadow-lg shadow-blue-500/30"
            >
              <Zap className="w-5 h-5" />
              Run a Simulation
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Showing {predictions.length} prediction{predictions.length !== 1 ? 's' : ''}
            </p>
            {predictions.map(pred => (
              <PredictionCard key={pred.id} pred={pred} />
            ))}
          </div>
        )}

      </main>
    </div>
  )
}