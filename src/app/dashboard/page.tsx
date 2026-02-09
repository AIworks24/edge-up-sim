'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/database/supabase-client'
import { useRouter } from 'next/navigation'

interface HotPick {
  id: string
  event: {
    home_team: string
    away_team: string
    sport_title: string
    commence_time: string
  }
  confidence_score: number
  edge_score: number
  recommended_bet_type: string
  recommended_line: any
  ai_analysis: string
  key_factors: string[]
  risk_assessment: string
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createBrowserClient()
  
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [hotPicks, setHotPicks] = useState<HotPick[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPick, setExpandedPick] = useState<string | null>(null)

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
    await loadHotPicks(session.user.id)
  }

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data)
      
      // Check if needs subscription
      if (data.subscription_status === 'none') {
        router.push('/pricing')
      }
    }
  }

  async function loadHotPicks(userId: string) {
    try {
      // Fetch today's hot picks for this user
      const today = new Date().toISOString().split('T')[0]
      
      const { data, error } = await supabase
        .from('daily_hot_picks')
        .select(`
          id,
          prediction:ai_predictions (
            id,
            confidence_score,
            edge_score,
            recommended_bet_type,
            recommended_line,
            ai_analysis,
            key_factors,
            risk_assessment,
            event:sports_events (
              home_team,
              away_team,
              sport_title,
              commence_time
            )
          )
        `)
        .eq('user_id', userId)
        .eq('assigned_date', today)
        .order('pick_rank', { ascending: true })

      if (data) {
        // Transform the data
        const picks = data.map((pick: any) => ({
          id: pick.id,
          event: pick.prediction.event,
          confidence_score: pick.prediction.confidence_score,
          edge_score: pick.prediction.edge_score,
          recommended_bet_type: pick.prediction.recommended_bet_type,
          recommended_line: pick.prediction.recommended_line,
          ai_analysis: pick.prediction.ai_analysis,
          key_factors: pick.prediction.key_factors,
          risk_assessment: pick.prediction.risk_assessment
        }))
        
        setHotPicks(picks)
      }
    } catch (error) {
      console.error('Error loading hot picks:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your picks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Edge Up Sim</h1>
              <p className="text-sm text-gray-600">Welcome back, {profile?.full_name}</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => router.push('/simulate')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Run Simulation
              </button>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Subscription Info */}
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-blue-900">
                {profile?.subscription_tier === 'edge_starter' && 'Edge Starter'}
                {profile?.subscription_tier === 'edge_pro' && 'Edge Pro'}
                {profile?.subscription_tier === 'edge_elite' && 'Edge Elite'}
              </p>
              <p className="text-sm text-blue-700">
                {profile?.subscription_status === 'trialing' && `Trial ends ${new Date(profile.trial_ends_at).toLocaleDateString()}`}
                {profile?.subscription_status === 'active' && 'Active subscription'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-blue-700">
                Simulations: {profile?.daily_simulation_count}/{profile?.daily_simulation_limit} today
              </p>
              {profile?.monthly_simulation_rollover > 0 && (
                <p className="text-sm text-blue-700">
                  +{profile.monthly_simulation_rollover} rollover
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Hot Picks */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Today's Hot Picks
          </h2>
          
          {hotPicks.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-600">
                No hot picks available yet. Check back soon!
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {hotPicks.map((pick) => (
                <div key={pick.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-sm text-gray-600">{pick.event.sport_title}</p>
                        <p className="font-bold text-lg">{pick.event.away_team}</p>
                        <p className="text-gray-600">@</p>
                        <p className="font-bold text-lg">{pick.event.home_team}</p>
                      </div>
                      <div className="text-right">
                        <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-semibold">
                          {pick.confidence_score}% Confidence
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          +{pick.edge_score.toFixed(1)}% Edge
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm text-gray-600">Recommended Bet</p>
                      <p className="font-semibold">{pick.recommended_line}</p>
                    </div>

                    <button
                      onClick={() => setExpandedPick(expandedPick === pick.id ? null : pick.id)}
                      className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
                    >
                      {expandedPick === pick.id ? 'Hide Details' : 'View Analysis'}
                    </button>

                    {expandedPick === pick.id && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="mb-4">
                          <p className="font-semibold text-sm mb-2">Key Factors:</p>
                          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                            {pick.key_factors.map((factor, idx) => (
                              <li key={idx}>{factor}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="mb-4">
                          <p className="font-semibold text-sm mb-2">Analysis:</p>
                          <p className="text-sm text-gray-700">{pick.ai_analysis}</p>
                        </div>

                        <div>
                          <p className="font-semibold text-sm mb-2">Risk:</p>
                          <p className="text-sm text-red-600">{pick.risk_assessment}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <button
            onClick={() => router.push('/simulate')}
            className="p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-lg mb-2">Run Simulation</h3>
            <p className="text-sm text-gray-600">
              Analyze any upcoming game
            </p>
          </button>

          <button
            onClick={() => router.push('/history')}
            className="p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-lg mb-2">Prediction History</h3>
            <p className="text-sm text-gray-600">
              View past picks and results
            </p>
          </button>

          <button
            onClick={() => router.push('/profile')}
            className="p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-lg mb-2">Settings</h3>
            <p className="text-sm text-gray-600">
              Manage your account
            </p>
          </button>
        </div>
      </main>
    </div>
  )
}