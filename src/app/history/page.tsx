'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'

export default function HistoryPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [predictions, setPredictions] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    correct: 0,
    winRate: 0,
    avgConfidence: 0
  })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'hot_pick' | 'user_simulation'>('all')

  useEffect(() => {
    checkUser()
  }, [filter])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setUser(session.user)
    await loadHistory(session.user.id)
  }

  async function loadHistory(userId: string) {
    setLoading(true)

    try {
      // Build query
      let query = supabase
        .from('ai_predictions')
        .select(`
          *,
          event:sports_events (
            home_team,
            away_team,
            sport_title,
            commence_time
          )
        `)
        .eq('requested_by', userId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filter !== 'all') {
        query = query.eq('prediction_type', filter)
      }

      const { data } = await query

      if (data) {
        setPredictions(data)
        calculateStats(data)
      }
    } catch (error) {
      console.error('Error loading history:', error)
    } finally {
      setLoading(false)
    }
  }

  function calculateStats(preds: any[]) {
    const resolved = preds.filter(p => p.was_correct !== null)
    const correct = resolved.filter(p => p.was_correct === true).length
    const winRate = resolved.length > 0 ? (correct / resolved.length) * 100 : 0
    const avgConf = preds.reduce((sum, p) => sum + p.confidence_score, 0) / (preds.length || 1)

    setStats({
      total: preds.length,
      correct,
      winRate,
      avgConfidence: avgConf
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Prediction History</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Total Predictions</p>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Correct</p>
            <p className="text-3xl font-bold text-green-600">{stats.correct}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Win Rate</p>
            <p className="text-3xl font-bold text-blue-600">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Avg Confidence</p>
            <p className="text-3xl font-bold text-purple-600">{stats.avgConfidence.toFixed(1)}%</p>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            All Predictions
          </button>
          <button
            onClick={() => setFilter('hot_pick')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'hot_pick'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Hot Picks
          </button>
          <button
            onClick={() => setFilter('user_simulation')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'user_simulation'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            My Simulations
          </button>
        </div>

        {/* Predictions List */}
        <div className="space-y-4">
          {predictions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-600">No predictions yet. Run a simulation to get started!</p>
            </div>
          ) : (
            predictions.map((pred) => (
              <div key={pred.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        pred.prediction_type === 'hot_pick'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {pred.prediction_type === 'hot_pick' ? '🔥 Hot Pick' : '🎯 Simulation'}
                      </span>
                      {pred.was_correct !== null && (
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          pred.was_correct
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {pred.was_correct ? '✓ Correct' : '✗ Incorrect'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{pred.event?.sport_title}</p>
                    <p className="font-bold text-lg">
                      {pred.event?.away_team} @ {pred.event?.home_team}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(pred.event?.commence_time).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="bg-green-100 text-green-800 px-3 py-1 rounded font-semibold mb-1">
                      {pred.confidence_score}%
                    </div>
                    <div className="text-sm text-gray-600">
                      +{pred.edge_score.toFixed(1)}% edge
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-1">Recommendation:</p>
                  <p className="font-semibold">{pred.recommended_line}</p>
                </div>

                {pred.was_correct !== null && pred.actual_score && (
                  <div className="border-t mt-4 pt-4">
                    <p className="text-sm text-gray-600 mb-1">Final Score:</p>
                    <p className="font-semibold">
                      {pred.event?.home_team}: {pred.actual_score.home} - {pred.event?.away_team}: {pred.actual_score.away}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}