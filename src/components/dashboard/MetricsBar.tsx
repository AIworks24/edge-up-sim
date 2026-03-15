'use client'
// src/components/dashboard/MetricsBar.tsx
// Reads from /api/metrics?scope=hot_picks&days=30
// Field names match the fixed api/metrics/route.ts response shape.

import { useEffect, useState } from 'react'

interface Metrics {
  total:          number
  resolved:       number
  wins:           number
  losses:         number
  win_rate:       number
  avg_edge_score: number
  by_sport:       Array<{ sport: string; total: number; wins: number; losses: number; win_rate: number }>
}

export function MetricsBar() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMetrics()
  }, [])

  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/metrics?scope=hot_picks&days=30')
      if (!res.ok) throw new Error('metrics fetch failed')
      const data = await res.json()
      setMetrics(data)
    } catch (err) {
      console.error('[MetricsBar] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <MetricsSkeleton />

  // Show placeholder until at least one pick is resolved
  if (!metrics || metrics.total === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
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

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          30-Day Performance — Hot Picks
        </h3>
        <span className="text-xs text-gray-600">{metrics.resolved} picks graded</span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">
            {metrics.wins}–{metrics.losses}
          </div>
          <div className="text-xs text-gray-500 mt-1">Record</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${winRateColor}`}>
            {metrics.win_rate}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Win Rate</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-300">
            {metrics.avg_edge_score}%
          </div>
          <div className="text-xs text-gray-500 mt-1">Avg Edge</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-300">
            {metrics.total}
          </div>
          <div className="text-xs text-gray-500 mt-1">Total Picks</div>
        </div>
      </div>

      {metrics.by_sport?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700 flex gap-6 flex-wrap">
          {metrics.by_sport.map(s => (
            <div key={s.sport} className="text-sm">
              <span className="text-gray-400 uppercase text-xs">{s.sport}</span>
              <span className="text-gray-300 ml-2">
                {s.wins}–{s.losses} ({s.win_rate}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-48 mb-4"></div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-gray-800 rounded"></div>
        ))}
      </div>
    </div>
  )
}