'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap, ChevronRight, Sparkles, Clock, TrendingUp,
  Target, DollarSign, Percent, Calendar, BarChart2,
  RefreshCw, AlertCircle,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface HotPick {
  id: string
  home_team: string
  away_team: string
  sport: string
  game_time: string | null
  edge_score: number
  edge_tier: string
  confidence_score: number
  recommended_bet_type: string
  recommended_line: {
    top_pick?: {
      label?: string
      verdict?: string
      win_pct?: number
      edge_pct?: number
      odds?: number
      fair_line?: string
      analysis?: string
      bet_category?: string
    }
  } | null
  projected_home_score: number | null
  projected_away_score: number | null
  ai_analysis: string | null
  market_spread: number | null
  market_total: number | null
  fair_spread: number | null
  fair_total: number | null
  sim_home_win_pct: number | null
  sim_home_cover_pct: number | null
  sim_over_pct: number | null
  daily_pick_rank: number | null
}

interface DashboardStats {
  simCount: number
  winRate: number
  roi: number
  edgeScore: number
}

// ── Tier styling ──────────────────────────────────────────────────────────────
function tierStyle(tier: string) {
  const map: Record<string, { bg: string; text: string; border: string; label: string }> = {
    EXCEPTIONAL: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/50', label: '🔥 Exceptional' },
    STRONG:      { bg: 'bg-green-500/20',   text: 'text-green-300',   border: 'border-green-500/50',   label: '✅ Strong' },
    MODERATE:    { bg: 'bg-yellow-500/20',  text: 'text-yellow-300',  border: 'border-yellow-500/50',  label: '⚡ Moderate' },
    RISKY:       { bg: 'bg-orange-500/20',  text: 'text-orange-300',  border: 'border-orange-500/50',  label: '⚠️ Risky' },
    NO_VALUE:    { bg: 'bg-gray-500/20',    text: 'text-gray-400',    border: 'border-gray-500/50',    label: '❌ No Value' },
  }
  return map[tier] ?? map['NO_VALUE']
}

function sportLabel(sport: string) {
  const map: Record<string, string> = { ncaab: 'CBB', nba: 'NBA', nfl: 'NFL' }
  return map[sport] ?? sport.toUpperCase()
}

function formatOdds(o: number | undefined) {
  if (o === undefined) return ''
  return o > 0 ? `+${o}` : `${o}`
}

function formatTime(iso: string | null) {
  if (!iso) return 'TBD'
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  } catch { return 'TBD' }
}

// ── Hot Pick Card ─────────────────────────────────────────────────────────────
function HotPickCard({ pick, rank }: { pick: HotPick; rank: number }) {
  const tier  = tierStyle(pick.edge_tier)
  const tp    = pick.recommended_line?.top_pick
  const isBet = pick.edge_score >= 20

  const projHome = pick.projected_home_score?.toFixed(0) ?? '—'
  const projAway = pick.projected_away_score?.toFixed(0) ?? '—'

  const betTypeLabel =
    pick.recommended_bet_type === 'total'     ? 'Over/Under' :
    pick.recommended_bet_type === 'moneyline' ? 'Moneyline'  : 'Spread'

  return (
    <div className={`relative flex flex-col bg-slate-800/60 backdrop-blur border ${tier.border} rounded-2xl p-6 hover:bg-slate-800/80 transition overflow-hidden`}>
      {/* Rank badge */}
      <div className="absolute top-4 right-4 w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center">
        <span className="text-xs font-black text-gray-300">#{rank}</span>
      </div>

      {/* Sport + Time */}
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs font-bold rounded-md">
          {sportLabel(pick.sport)}
        </span>
        <span className="text-xs text-gray-500">{formatTime(pick.game_time)}</span>
      </div>

      {/* Teams */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{pick.away_team} @</p>
        <h3 className="text-lg font-black text-white leading-tight">{pick.home_team}</h3>
      </div>

      {/* Edge Score */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${tier.bg} rounded-lg mb-4 self-start`}>
        <span className={`text-xl font-black ${tier.text}`}>{pick.edge_score.toFixed(1)}%</span>
        <span className={`text-xs font-semibold ${tier.text}`}>{tier.label}</span>
      </div>

      {/* Top Pick */}
      {tp && (
        <div className={`p-3 rounded-xl mb-4 ${isBet ? 'bg-green-900/30 border border-green-500/40' : 'bg-slate-700/40 border border-white/5'}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">{betTypeLabel}</p>
              <p className={`font-bold text-sm ${isBet ? 'text-green-300' : 'text-gray-300'}`}>
                {tp.label ?? 'N/A'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-500">Win prob</p>
              <p className="text-sm font-bold text-white">
                {tp.win_pct !== undefined ? `${tp.win_pct.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
          {tp.fair_line && (
            <p className="text-xs text-gray-400 mt-2">{tp.fair_line}</p>
          )}
        </div>
      )}

      {/* Projected Score */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>Projected Score</span>
        <span className="font-mono text-gray-300">
          {pick.away_team.split(' ').pop()} {projAway} – {projHome} {pick.home_team.split(' ').pop()}
        </span>
      </div>

      {/* Analysis blurb */}
      {pick.ai_analysis && (
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
          {pick.ai_analysis}
        </p>
      )}

      {/* Verdict pill */}
      <div className="mt-4">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          isBet
            ? 'bg-green-500/20 text-green-300'
            : 'bg-gray-600/40 text-gray-400'
        }`}>
          {isBet ? '✅ BET' : '⏭ SKIP'}
        </span>
      </div>
    </div>
  )
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()

  const [hotPicks,   setHotPicks]   = useState<HotPick[]>([])
  const [picksLoading, setPicksLoading] = useState(true)
  const [picksError,   setPicksError]   = useState<string | null>(null)
  const [lastUpdated,  setLastUpdated]  = useState<string>('—')

  const [stats, setStats] = useState<DashboardStats>({
    simCount: 0,
    winRate: 0,
    roi: 0,
    edgeScore: 0,
  })

  // ── Fetch hot picks ──────────────────────────────────────────────────────
  async function loadHotPicks() {
    setPicksLoading(true)
    setPicksError(null)
    try {
      const res = await fetch('/api/predictions/hot-picks')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHotPicks(data.picks ?? [])
      setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
    } catch (err: any) {
      setPicksError('Could not load hot picks. Try refreshing.')
      console.error('[Dashboard] Hot picks fetch failed:', err)
    } finally {
      setPicksLoading(false)
    }
  }

  // ── Fetch metrics ────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const res = await fetch('/api/metrics')
      if (!res.ok) return
      const data = await res.json()
      setStats({
        simCount:  data.total       ?? 0,
        winRate:   data.win_rate    ?? 0,
        roi:       data.avg_edge_score ?? 0,
        edgeScore: data.avg_edge_score ?? 0,
      })
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    loadHotPicks()
    loadStats()
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-white">Dashboard</h1>
            <p className="text-gray-400 mt-1">Edge Up Sim — AI-powered betting analytics</p>
          </div>
          <Link
            href="/simulate"
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-blue-500/30"
          >
            <Zap className="w-4 h-4" />
            Run Simulation
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: BarChart2,  label: 'Total Simulations', value: stats.simCount.toString(),       sub: 'All time',      color: 'from-blue-500 to-cyan-500',    bg: 'bg-blue-500/10',   ic: 'text-blue-400' },
            { icon: Target,     label: 'Win Rate',          value: `${stats.winRate.toFixed(1)}%`,  sub: 'Resolved picks', color: 'from-green-500 to-emerald-500', bg: 'bg-green-500/10',  ic: 'text-green-400' },
            { icon: DollarSign, label: 'Avg Edge Score',    value: `${stats.roi.toFixed(1)}%`,      sub: 'Expected ROI',  color: 'from-purple-500 to-pink-500',   bg: 'bg-purple-500/10', ic: 'text-purple-400' },
            { icon: Percent,    label: 'Avg Confidence',    value: `${stats.edgeScore.toFixed(1)}%`, sub: 'Model certainty', color: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', ic: 'text-amber-400' },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:bg-slate-800/70 transition">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 ${s.bg} rounded-xl`}>
                  <s.icon className={`w-5 h-5 ${s.ic}`} />
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>
                </div>
              </div>
              <div className="text-xs font-semibold text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Hot Picks Section */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">

          {/* Section header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl shadow-lg shadow-orange-500/40">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">Today's Hot Picks</h2>
                <p className="text-sm text-gray-400">AI-generated picks with 20%+ edge score</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-gray-400">
                <Clock className="w-4 h-4" />
                <span>Updated {lastUpdated}</span>
              </div>
              <button
                onClick={loadHotPicks}
                disabled={picksLoading}
                className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50"
                title="Refresh hot picks"
              >
                <RefreshCw className={`w-4 h-4 ${picksLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* States */}
          {picksLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Loading today's picks…</p>
            </div>

          ) : picksError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-red-400 font-semibold">{picksError}</p>
              <button
                onClick={loadHotPicks}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
              >
                Try Again
              </button>
            </div>

          ) : hotPicks.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-gradient-to-br from-slate-700 to-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-5">
                <Calendar className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No hot picks today yet</h3>
              <p className="text-gray-400 mb-6 max-w-sm mx-auto text-sm leading-relaxed">
                Picks are generated each morning from upcoming games. Run a custom simulation on any matchup now.
              </p>
              <Link
                href="/simulate"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-blue-500/30"
              >
                <Zap className="w-4 h-4" />
                Run Custom Simulation
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {hotPicks.map((pick, i) => (
                <HotPickCard key={pick.id} pick={pick} rank={(pick.daily_pick_rank ?? i) + 1} />
              ))}
            </div>
          )}
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link
            href="/simulate"
            className="group relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 hover:from-blue-500 hover:via-blue-600 hover:to-blue-700 rounded-2xl p-7 text-white transition shadow-2xl shadow-blue-500/30"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-white/20 transition" />
            <div className="relative">
              <div className="p-3 bg-white/10 rounded-xl w-fit mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-black mb-1">Run Simulation</h3>
              <p className="text-blue-200 text-sm">Pick any game, get full Spread/Total/ML analysis</p>
              <div className="flex items-center gap-1 mt-4 text-sm font-semibold text-white/80 group-hover:text-white transition">
                Start <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>
          </Link>

          <Link
            href="/history"
            className="group relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 hover:from-purple-500 hover:via-purple-600 hover:to-purple-700 rounded-2xl p-7 text-white transition shadow-2xl shadow-purple-500/30"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-white/20 transition" />
            <div className="relative">
              <div className="p-3 bg-white/10 rounded-xl w-fit mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-black mb-1">Prediction History</h3>
              <p className="text-purple-200 text-sm">Track performance across all simulations</p>
              <div className="flex items-center gap-1 mt-4 text-sm font-semibold text-white/80 group-hover:text-white transition">
                View <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>
          </Link>

          <Link
            href="/settings"
            className="group relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 hover:from-emerald-500 hover:via-emerald-600 hover:to-emerald-700 rounded-2xl p-7 text-white transition shadow-2xl shadow-emerald-500/30"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-white/20 transition" />
            <div className="relative">
              <div className="p-3 bg-white/10 rounded-xl w-fit mb-4">
                <BarChart2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-black mb-1">Account Settings</h3>
              <p className="text-emerald-200 text-sm">Manage subscription & sport preferences</p>
              <div className="flex items-center gap-1 mt-4 text-sm font-semibold text-white/80 group-hover:text-white transition">
                Open <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
              </div>
            </div>
          </Link>
        </div>

      </div>
    </div>
  )
}