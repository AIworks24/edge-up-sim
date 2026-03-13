'use client'
// src/components/dashboard/MetricsBar.tsx
//
// Displays the 30-Day Hot Picks performance bar inside the dashboard.
// Fetches /api/metrics?scope=hot_picks&days=30 — hot-picks-only data.
// Requires the auth token so the route can scope results to this user.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/database/supabase-client'

interface HotPickMetrics {
  total:    number
  resolved: number
  wins:     number
  losses:   number
  win_rate: number
  avg_edge: number
}

export function MetricsBar() {
  const [metrics, setMetrics] = useState<HotPickMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMetrics()
  }, [])

  async function fetchMetrics() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res  = await fetch('/api/metrics?scope=hot_picks&days=30', { headers })
      if (!res.ok) throw new Error('metrics fetch failed')

      const data = await res.json()

      // The route returns the full payload; we only need the hot_picks segment here
      const hp: HotPickMetrics = data.hot_picks ?? {
        total: 0, resolved: 0, wins: 0, losses: 0, win_rate: 0, avg_edge: 0
      }
      setMetrics(hp)
    } catch (err) {
      console.error('[MetricsBar] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <MetricsSkeleton />

  // No resolved picks yet — show a neutral placeholder instead of misleading zeros
  if (!metrics || metrics.resolved === 0) {
    return (
      <div className="bg-slate-800/60 border border-white/5 rounded-xl p-4 text-center">
        <p className="text-gray-500 text-sm">
          📊 Performance tracking activates once today's picks are graded after games complete.
        </p>
      </div>
    )
  }

  const winRateColor =
    metrics.win_rate >= 60 ? 'text-emerald-400' :
    metrics.win_rate >= 55 ? 'text-green-400'   :
    metrics.win_rate >= 50 ? 'text-yellow-400'  : 'text-red-400'

  // Build a W–L record string
  const record = `${metrics.wins}–${metrics.losses}`

  // Pending = total picks that haven't been graded yet
  const pending = metrics.total - metrics.resolved

  return (
    <div className="bg-slate-800/60 border border-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          30-Day Performance — Hot Picks
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span>{metrics.resolved} picks graded</span>
          {pending > 0 && (
            <span className="text-yellow-600/80">{pending} pending</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* W–L Record */}
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{record}</div>
          <div className="text-xs text-gray-500 mt-1">Record</div>
        </div>

        {/* Win Rate */}
        <div className="text-center">
          <div className={`text-2xl font-bold ${winRateColor}`}>
            {metrics.win_rate}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Win Rate</div>
        </div>

        {/* Avg Edge Score */}
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-300">
            {metrics.avg_edge}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Avg Edge Score</div>
        </div>

        {/* Picks Graded */}
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-300">
            {metrics.resolved}
          </div>
          <div className="text-xs text-gray-500 mt-1">Picks Graded</div>
        </div>
      </div>
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <div className="bg-slate-800/60 border border-white/5 rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-slate-700 rounded w-52 mb-4" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-slate-700/60 rounded" />
        ))}
      </div>
    </div>
  )
}