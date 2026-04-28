'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import {
  ArrowLeft, Flame, Zap, Clock, TrendingUp,
  CheckCircle2, XCircle, Trophy, BarChart3,
  ChevronDown, ChevronUp, Calendar, Bookmark
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function edgeBadge(tier: string) {
  const map: Record<string, string> = {
    EXCEPTIONAL: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    STRONG:      'bg-green-500/20 text-green-300 border border-green-500/30',
    MODERATE:    'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
    RISKY:       'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  }
  return map[tier] ?? 'bg-white/10 text-gray-400 border border-white/10'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  })
}

function fmtOdds(n: number | null) {
  if (n == null) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

function BetTrackedStats({ stats }: { stats: { totalTracked: number; pending: number; resolved: number; wins: number; losses: number; winRate: number | null; avgEdge: number | null; bySport: Record<string, any> } | null }) {
  if (!stats || stats.totalTracked === 0) {
    return (
      <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Bookmark className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-white">My Tracked Bets</h3>
        </div>
        <p className="text-xs text-gray-500">
          Check the box ☑️ next to any simulation to track bets you've placed. Your personal win rate appears here.
        </p>
      </div>
    )
  }
  return (
    <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/20 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bookmark className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-bold text-white">My Tracked Bets Performance</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="bg-black/20 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-400">Tracked</p>
          <p className="text-xl font-black text-white">{stats.totalTracked}</p>
        </div>
        <div className="bg-black/20 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-400">Win Rate</p>
          <p className={`text-xl font-black ${stats.winRate != null && stats.winRate >= 55 ? 'text-green-400' : 'text-gray-300'}`}>
            {stats.winRate != null ? `${stats.winRate}%` : '—'}
          </p>
        </div>
        <div className="bg-black/20 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-400">W / L</p>
          <p className="text-lg font-black">
            <span className="text-green-400">{stats.wins}</span>
            <span className="text-gray-600"> / </span>
            <span className="text-red-400">{stats.losses}</span>
          </p>
        </div>
        <div className="bg-black/20 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-400">Avg Edge</p>
          <p className={`text-xl font-black ${stats.avgEdge != null && stats.avgEdge > 3 ? 'text-green-400' : 'text-gray-300'}`}>
            {stats.avgEdge != null ? `+${stats.avgEdge}%` : '—'}
          </p>
        </div>
      </div>
      {stats.pending > 0 && (
        <p className="text-xs text-gray-500 text-center">{stats.pending} bet{stats.pending !== 1 ? 's' : ''} pending outcome</p>
      )}
    </div>
  )
}

// ── Expandable simulation card ────────────────────────────────────────────────
function SimCard({ pred, onToggleBet, isUpdating }: { pred: any; onToggleBet?: (id: string, placed: boolean) => void; isUpdating?: boolean }) {
  const [open, setOpen] = useState(false)
  const [betPlaced, setBetPlaced] = useState<boolean>(pred.user_placed_bet ?? false)
  const tp      = pred.recommended_line?.top_pick
  const isBet   = (pred.edge_score ?? 0) >= 20
  const factors = Array.isArray(pred.key_factors) ? pred.key_factors : []

  return (
    <div className={`bg-slate-800/60 border rounded-2xl overflow-hidden transition ${
      isBet ? 'border-green-500/30' : 'border-white/5'
    }`}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Type badge */}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            pred.prediction_type === 'hot_pick'
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
          }`}>
            {pred.prediction_type === 'hot_pick' ? '🔥 Hot Pick' : '⚡ My Sim'}
          </span>

          {pred.prediction_type !== 'hot_pick' && onToggleBet && (
            <label
              className="flex items-center gap-1 cursor-pointer group/chk"
              title={betPlaced ? 'Click to unmark bet' : 'Mark as a bet you placed'}
              onClick={e => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={betPlaced}
                disabled={isUpdating}
                onChange={e => {
                  const next = e.target.checked
                  setBetPlaced(next)
                  onToggleBet(pred.id, next)
                }}
                className="w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer disabled:cursor-wait"
              />
              <span className={`text-xs transition ${betPlaced ? 'text-blue-400' : 'text-gray-600 group-hover/chk:text-gray-400'}`}>
                {betPlaced ? 'Tracked' : 'Track'}
              </span>
            </label>
          )}
 
          {/* Game */}
          <div>
            <span className="text-xs text-gray-500">{pred.away_team} @</span>{' '}
            <span className="text-white font-bold">{pred.home_team}</span>
          </div>

          {/* Date */}
          <span className="text-xs text-gray-500">{fmtDate(pred.created_at)}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Outcome */}
          {pred.was_correct === true  && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          {pred.was_correct === false && <XCircle      className="w-4 h-4 text-red-400"   />}

          {/* Edge */}
          <span className={`text-sm font-black ${
            (pred.edge_score ?? 0) >= 20 ? 'text-green-400' :
            (pred.edge_score ?? 0) >= 10 ? 'text-yellow-400' : 'text-gray-400'
          }`}>
            {pred.edge_score?.toFixed(1)}%
          </span>

          {/* Hide edge tier badge on smallest phones, show on sm+ */}
          <span className={`hidden sm:inline text-xs font-bold px-2 py-0.5 rounded-full ${edgeBadge(pred.edge_tier)}`}>
            {pred.edge_tier}
          </span>

          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 sm:px-6 pb-6 border-t border-white/5 pt-4 space-y-4">

          {/* Top pick recommendation */}
          {tp && (
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Top Pick</p>
              <p className="text-white font-bold text-lg">{tp.label}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                <span>Edge <span className="text-white font-semibold">{tp.edge_pct?.toFixed(1)}%</span></span>
                <span>Win Prob <span className="text-white font-semibold">{tp.win_pct?.toFixed(1)}%</span></span>
                <span>Odds <span className="text-white font-semibold">{fmtOdds(tp.odds)}</span></span>
              </div>
              {tp.analysis && <p className="text-gray-300 text-sm mt-3 leading-relaxed">{tp.analysis}</p>}
            </div>
          )}

          {/* Projected score + sim stats */}
          <div className="grid grid-cols-2 gap-3">
            {pred.projected_away_score != null && (
              <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{pred.away_team?.split(' ').pop()}</p>
                <p className="text-xl font-black text-white">{pred.projected_away_score != null ? Number(pred.projected_away_score).toFixed(0) : '—'}</p>
              </div>
            )}
            {pred.projected_home_score != null && (
              <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{pred.home_team?.split(' ').pop()}</p>
                <p className="text-xl font-black text-white">{pred.projected_home_score != null ? Number(pred.projected_home_score).toFixed(0) : '—'}</p>
              </div>
            )}
            {pred.sim_home_win_pct != null && (
              <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Home Win%</p>
                <p className="text-xl font-black text-white">{pred.sim_home_win_pct != null ? (Number(pred.sim_home_win_pct) * 100).toFixed(0) : '—'}%</p>
              </div>
            )}
            {pred.sim_over_pct != null && (
              <div className="bg-slate-700/30 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Over%</p>
                <p className="text-xl font-black text-white">{pred.sim_over_pct != null ? (Number(pred.sim_over_pct) * 100).toFixed(0) : '—'}%</p>
              </div>
            )}
          </div>

          {/* AI analysis */}
          {pred.ai_analysis && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Analysis</p>
              <p className="text-gray-300 text-sm leading-relaxed">{pred.ai_analysis}</p>
            </div>
          )}

          {/* Key factors */}
          {factors.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Key Factors</p>
              <ul className="space-y-1">
                {factors.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">›</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Market lines */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            {pred.market_spread != null && (
              <span>Spread <span className="text-white">{pred.market_spread > 0 ? '+' : ''}{pred.market_spread}</span></span>
            )}
            {pred.market_total != null && (
              <span>Total <span className="text-white">{pred.market_total}</span></span>
            )}
            {pred.fair_spread != null && (
              <span>Fair Spread <span className="text-blue-300">{pred.fair_spread > 0 ? '+' : ''}{pred.fair_spread != null ? Number(pred.fair_spread).toFixed(1) : '—'}</span></span>
            )}
            {pred.fair_total != null && (
              <span>Fair Total <span className="text-blue-300">{pred.fair_total != null ? Number(pred.fair_total).toFixed(1) : '—'}</span></span>
            )}
          </div>

          {/* Game time */}
          {pred.game_time && (
            <p className="text-xs text-gray-600">
              Game: {fmtDate(pred.game_time)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const router = useRouter()
  const [simulations, setSimulations] = useState<any[]>([])
  const [hotPicks,    setHotPicks]    = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'hot_pick' | 'user_simulation'>('all')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0, correct: 0, winRate: 0, avgEdge: 0,
  })
  const [trackedStats, setTrackedStats] = useState<any>(null)
  const [updatingIds, setUpdatingIds]   = useState<Set<string>>(new Set())

  useEffect(() => { loadHistory() }, [filter])

  async function loadHistory() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Call server-side API route — uses supabaseAdmin, bypasses RLS
      const res = await fetch(
        `/api/predictions/history?type=${filter}&limit=100`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )

      if (!res.ok) throw new Error('Failed to load history')

      const data = await res.json()
      setSimulations(data.simulations || [])
      setHotPicks(data.hot_picks || [])

      // Calculate stats from user's own simulations
      const resolved = (data.simulations || []).filter((p: any) => p.was_correct !== null)
      const correct  = resolved.filter((p: any) => p.was_correct === true).length
      const edges    = (data.simulations || []).map((p: any) => p.edge_score || 0)
      const avgEdge  = edges.length ? edges.reduce((a: number, b: number) => a + b, 0) / edges.length : 0

      setStats({
        total:   data.simulations?.length || 0,
        correct,
        winRate: resolved.length ? Math.round((correct / resolved.length) * 100) : 0,
        avgEdge: Math.round(avgEdge * 10) / 10,
      })
      loadTrackedStats()
    } catch (err) {
      console.error('Error loading history:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadTrackedStats() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/predictions/track-bet', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTrackedStats(data.stats)
      }
    } catch {}
  }
 
  async function handleToggleBet(predictionId: string, placed: boolean) {
    setUpdatingIds(prev => { const s = new Set(prev); s.add(predictionId); return s })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch('/api/predictions/track-bet', {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ predictionId, placed }),
      })
      await loadTrackedStats()
    } catch {}
    finally {
      setUpdatingIds(prev => { const s = new Set(prev); s.delete(predictionId); return s })
    }
  }
 
  const statCards = [
    { label: 'Total Sims',  value: stats.total,              icon: BarChart3,  color: 'text-blue-400'   },
    { label: 'Win Rate',    value: `${stats.winRate}%`,      icon: Trophy,     color: 'text-green-400'  },
    { label: 'Correct',     value: stats.correct,            icon: CheckCircle2, color: 'text-emerald-400'},
    { label: 'Avg Edge',    value: `${stats.avgEdge}%`,      icon: TrendingUp, color: 'text-purple-400' },
  ]

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-white/5 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white">Simulation History</h1>
              <p className="text-xs text-gray-500">Your predictions and today's hot picks</p>
            </div>
          </div>
          <Link
            href="/simulate"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition"
          >
            <Zap className="w-4 h-4" />
            New Sim
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">

        <BetTrackedStats stats={trackedStats} />

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(s => (
            <div key={s.label} className="bg-slate-800/60 border border-white/5 rounded-2xl p-3 sm:p-4 text-center">
              <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-2`} />
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Today's Hot Picks section */}
        {hotPicks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-bold text-white">Today's Hot Picks</h2>
              <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full">
                {hotPicks.length} picks
              </span>
            </div>
            <div className="space-y-3">
              {hotPicks.map((pick: any) => (
                <SimCard key={pick.id} pred={{ ...pick, prediction_type: 'hot_pick', created_at: new Date().toISOString() }} />
              ))}
            </div>
          </div>
        )}

        {/* My Simulations section */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">My Simulations</h2>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2">
              {(['all', 'user_simulation', 'hot_pick'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'user_simulation' ? 'My Sims' : 'Hot Picks'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Loading your history...</p>
            </div>
          ) : simulations.length === 0 ? (
            <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-12 text-center">
              <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 font-medium mb-2">No simulations yet</p>
              <p className="text-gray-600 text-sm mb-6">Run a simulation on an upcoming game to see your history here.</p>
              <Link
                href="/simulate"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition"
              >
                <Zap className="w-4 h-4" />
                Run Your First Simulation
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {simulations.map((pred: any) => (
                <SimCard
                  key={pred.id}
                  pred={pred}
                  onToggleBet={handleToggleBet}
                  isUpdating={updatingIds.has(pred.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}