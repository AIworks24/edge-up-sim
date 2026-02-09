'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'

interface Event {
  id: string
  sport_title: string
  home_team: string
  away_team: string
  commence_time: string
}

export default function SimulatePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<string>('')
  const [betType, setBetType] = useState<'moneyline' | 'spread' | 'total'>('moneyline')
  const [loading, setLoading] = useState(false)
  const [prediction, setPrediction] = useState<any>(null)

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setUser(session.user)
    await loadProfile(session.user.id)
    await loadEvents()
  }

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data)
    }
  }

  async function loadEvents() {
    const { data } = await supabase
      .from('sports_events')
      .select('*')
      .eq('event_status', 'upcoming')
      .order('commence_time', { ascending: true })
      .limit(50)

    if (data) {
      setEvents(data)
    }
  }

  async function handleSimulate() {
    if (!selectedEvent) {
      alert('Please select a game')
      return
    }

    // Check simulation limits
    if (profile.daily_simulation_count >= profile.daily_simulation_limit) {
      alert('Daily simulation limit reached. Upgrade your plan for more simulations.')
      return
    }

    setLoading(true)
    setPrediction(null)

    try {
      const response = await fetch('/api/predictions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: selectedEvent,
          sport: events.find(e => e.id === selectedEvent)?.sport_title || 'nfl',
          betType,
          userId: user.id
        })
      })

      const data = await response.json()

      if (response.ok) {
        setPrediction(data)
        
        // Update simulation count
        await supabase
          .from('profiles')
          .update({
            daily_simulation_count: profile.daily_simulation_count + 1,
            monthly_simulation_count: profile.monthly_simulation_count + 1
          })
          .eq('id', user.id)

        // Reload profile
        await loadProfile(user.id)
      } else {
        throw new Error(data.error || 'Failed to generate prediction')
      }
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  if (!profile) {
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
            <h1 className="text-2xl font-bold text-gray-900">Run Simulation</h1>
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
        {/* Limits Display */}
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-blue-900">
                Daily Simulations: {profile.daily_simulation_count}/{profile.daily_simulation_limit}
              </p>
              {profile.monthly_simulation_rollover > 0 && (
                <p className="text-sm text-blue-700">
                  +{profile.monthly_simulation_rollover} rollover available
                </p>
              )}
            </div>
            <button
              onClick={() => router.push('/pricing')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Upgrade Plan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Selection Panel */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-6">Select Game & Bet Type</h2>

            <div className="space-y-6">
              {/* Game Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Game
                </label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a game...</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.sport_title}: {event.away_team} @ {event.home_team} - {new Date(event.commence_time).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bet Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bet Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setBetType('moneyline')}
                    className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                      betType === 'moneyline'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Moneyline
                  </button>
                  <button
                    onClick={() => setBetType('spread')}
                    className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                      betType === 'spread'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Spread
                  </button>
                  <button
                    onClick={() => setBetType('total')}
                    className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                      betType === 'total'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Total
                  </button>
                </div>
              </div>

              {/* Run Button */}
              <button
                onClick={handleSimulate}
                disabled={loading || !selectedEvent}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing Game...
                  </span>
                ) : (
                  'Run AI Simulation'
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                AI analysis takes 10-15 seconds • Uses 1 simulation credit
              </p>
            </div>
          </div>

          {/* Results Panel */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-6">AI Prediction</h2>

            {!prediction && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-400 text-5xl mb-4">🤖</div>
                <p className="text-gray-600">
                  Select a game and bet type, then run the simulation to get your AI-powered prediction
                </p>
              </div>
            )}

            {loading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">AI analyzing game data...</p>
              </div>
            )}

            {prediction && (
              <div className="space-y-6">
                {/* Confidence & Edge */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-green-700 mb-1">Confidence</p>
                    <p className="text-3xl font-bold text-green-900">
                      {prediction.confidenceScore}%
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-700 mb-1">Edge Score</p>
                    <p className="text-3xl font-bold text-blue-900">
                      +{prediction.edgeScore.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Recommendation */}
                <div className="border-l-4 border-blue-600 pl-4">
                  <p className="text-sm text-gray-600 mb-1">Recommended Bet</p>
                  <p className="text-xl font-bold text-gray-900">
                    {prediction.recommendedLine}
                  </p>
                </div>

                {/* Key Factors */}
                <div>
                  <p className="font-semibold text-gray-900 mb-3">Key Factors:</p>
                  <ul className="space-y-2">
                    {prediction.keyFactors?.map((factor: string, idx: number) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-blue-600 mr-2">•</span>
                        <span className="text-gray-700">{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Analysis */}
                <div>
                  <p className="font-semibold text-gray-900 mb-3">Detailed Analysis:</p>
                  <p className="text-gray-700 leading-relaxed">
                    {prediction.aiAnalysis}
                  </p>
                </div>

                {/* Risk */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="font-semibold text-red-900 mb-2">⚠️ Risk Assessment:</p>
                  <p className="text-red-800 text-sm">
                    {prediction.riskAssessment}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPrediction(null)
                      setSelectedEvent('')
                    }}
                    className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    New Simulation
                  </button>
                  <button
                    onClick={() => router.push('/history')}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    View History
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}