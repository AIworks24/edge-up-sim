'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import { ArrowLeft, Zap, ChevronDown, Calendar, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'

interface Game {
  id: string
  external_event_id?: string
  home_team: string
  away_team: string
  sport_title: string
  sport_key: string
  commence_time: string
  odds_data: any
  home_team_sr_id?: string
  away_team_sr_id?: string
}

export default function SimulatePage() {
  const router = useRouter()
  const [user, setUser]                       = useState<any>(null)
  const [profile, setProfile]                 = useState<any>(null)
  const [loading, setLoading]                 = useState(true)
  const [selectedSport, setSelectedSport]     = useState('')
  const [availableGames, setAvailableGames]   = useState<Game[]>([])
  const [selectedGame, setSelectedGame]       = useState<Game | null>(null)
  const [loadingGames, setLoadingGames]       = useState(false)
  const [selectedBetType, setSelectedBetType] = useState('')
  const [simulating, setSimulating]           = useState(false)
  const [prediction, setPrediction]           = useState<any>(null)
  const [error, setError]                     = useState('')

  const sports = [
    { key: 'ncaab', name: 'NCAA Basketball', icon: '🏀', description: 'College Basketball' },
    { key: 'nfl',   name: 'NFL',             icon: '🏈', description: 'National Football League' },
    { key: 'nba',   name: 'NBA',             icon: '🏀', description: 'Pro Basketball' },
  ]

  const betTypes = [
    { key: 'moneyline', name: 'Moneyline',    description: 'Pick the winner' },
    { key: 'spread',    name: 'Point Spread', description: 'Win by margin' },
    { key: 'total',     name: 'Over/Under',   description: 'Total points scored' },
  ]

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { if (selectedSport) loadGames() }, [selectedSport])

  const checkAuth = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/login'); return }
      setUser(authUser)
      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', authUser.id).single()
      setProfile(profileData)
      setLoading(false)
    } catch { router.push('/login') }
  }

  const loadGames = async () => {
    setLoadingGames(true)
    setError('')
    setAvailableGames([])
    try {
      const res  = await fetch(`/api/sports/events?sport=${selectedSport}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `API error ${res.status}`)
      const games: Game[] = body.events || []
      if (games.length === 0) {
        setError(`No upcoming ${selectedSport.toUpperCase()} games right now. Check back closer to game time.`)
      } else {
        setAvailableGames(games)
      }
    } catch (err: any) {
      setError(`Failed to load games: ${err.message}`)
    } finally {
      setLoadingGames(false)
    }
  }

  const getGameOdds = (game: Game) => {
    try {
      if (!game.odds_data) return { spread: null, total: null, moneyline: null, raw: null }
      const o = typeof game.odds_data === 'string' ? JSON.parse(game.odds_data) : game.odds_data
      if (o && ('spread_home' in o || 'total' in o || 'moneyline_home' in o)) {
        const fmt = (n: number | null | undefined) =>
          n == null ? null : n > 0 ? `+${n}` : `${n}`
        return {
          raw: o,
          spread: o.spread_home != null ? {
            home: `${o.spread_home > 0 ? '+' : ''}${o.spread_home} (${fmt(o.spread_home_odds)})`,
            away: `${(-o.spread_home) > 0 ? '+' : ''}${-o.spread_home} (${fmt(o.spread_away_odds)})`,
          } : null,
          total: o.total != null ? {
            over:  `O${o.total} (${fmt(o.total_over_odds)})`,
            under: `U${o.total} (${fmt(o.total_under_odds)})`,
          } : null,
          moneyline: (o.moneyline_home != null || o.moneyline_away != null) ? {
            home: fmt(o.moneyline_home), away: fmt(o.moneyline_away),
          } : null,
        }
      }
      return { spread: null, total: null, moneyline: null, raw: o }
    } catch {
      return { spread: null, total: null, moneyline: null, raw: null }
    }
  }

  const runSimulation = async () => {
    if (!selectedGame || !selectedBetType || !user) return
    const dailyLimit   = profile?.daily_simulation_limit      || 3
    const currentCount = profile?.daily_simulation_count      || 0
    const rollover     = profile?.monthly_simulation_rollover || 0
    if (currentCount >= dailyLimit + rollover) {
      setError(`Daily limit reached (${dailyLimit} + ${rollover} rollover).`)
      return
    }
    setSimulating(true); setError(''); setPrediction(null)
    try {
      const odds = getGameOdds(selectedGame)
      const raw  = (odds.raw as any) || {}
      const response = await fetch('/api/predictions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId:         selectedGame.external_event_id || selectedGame.id,
          sport:           selectedGame.sport_key,
          betType:         selectedBetType,
          userId:          user.id,
          home_team:       selectedGame.home_team,
          away_team:       selectedGame.away_team,
          home_team_sr_id: selectedGame.home_team_sr_id,
          away_team_sr_id: selectedGame.away_team_sr_id,
          spread_home:     raw.spread_home    ?? null,
          total:           raw.total          ?? null,
          moneyline_home:  raw.moneyline_home ?? null,
          moneyline_away:  raw.moneyline_away ?? null,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to generate prediction')
      setPrediction(result.prediction || result)
      const { data: updated } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      if (updated) setProfile(updated)
    } catch (err: any) {
      setError(err.message || 'Failed to run simulation.')
    } finally { setSimulating(false) }
  }

  const resetForm = () => {
    setSelectedSport(''); setSelectedGame(null); setSelectedBetType('')
    setPrediction(null); setError(''); setAvailableGames([])
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-2 text-gray-300 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Dashboard</span>
          </Link>
          <div className="text-right">
            <div className="text-sm text-gray-400">Simulations Today</div>
            <div className="text-white font-bold">
              {profile?.daily_simulation_count || 0} / {profile?.daily_simulation_limit || 3}
              {(profile?.monthly_simulation_rollover || 0) > 0 && (
                <span className="text-green-400"> +{profile.monthly_simulation_rollover}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Run Simulation</h1>
          <p className="text-gray-400">Select a sport, game, and bet type to get your edge analysis.</p>
        </div>

        {prediction && (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-green-500/30 rounded-2xl p-8">
            <div className="flex items-center space-x-3 mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <h2 className="text-2xl font-bold text-white">Simulation Complete</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Edge Score</div>
                <div className={`text-2xl font-bold ${
                  (prediction.edge_score ?? prediction.edgeScore ?? 0) >= 20 ? 'text-green-400' :
                  (prediction.edge_score ?? prediction.edgeScore ?? 0) >= 12 ? 'text-yellow-400' : 'text-red-400'
                }`}>{prediction.edge_score ?? prediction.edgeScore ?? 0}%</div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Confidence</div>
                <div className="text-2xl font-bold text-blue-400">{prediction.confidence_tier || prediction.confidenceTier || 'N/A'}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Recommendation</div>
                <div className="text-lg font-bold text-white">{prediction.recommended_bet || prediction.recommendedBet || '—'}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Bet Type</div>
                <div className="text-lg font-bold text-white capitalize">{selectedBetType}</div>
              </div>
            </div>
            {(prediction.analysis || prediction.reasoning) && (
              <div className="bg-white/5 rounded-xl p-4 mb-4">
                <div className="text-sm font-semibold text-gray-400 mb-2">Analysis</div>
                <div className="text-gray-300 leading-relaxed">{prediction.analysis || prediction.reasoning}</div>
              </div>
            )}
            {(prediction.risk_assessment || prediction.riskAssessment) && (
              <div className="bg-white/5 rounded-xl p-4">
                <div className="text-sm font-semibold text-gray-400 mb-2">Risk Assessment</div>
                <div className="text-orange-300">{prediction.risk_assessment || prediction.riskAssessment}</div>
              </div>
            )}
            <button onClick={resetForm}
              className="mt-6 w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition">
              Run Another Simulation
            </button>
          </div>
        )}

        {!prediction && (
          <>
            <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                <h2 className="text-2xl font-bold text-white">Select Sport</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sports.map(sport => (
                  <button key={sport.key}
                    onClick={() => { setSelectedSport(sport.key); setSelectedGame(null); setSelectedBetType(''); setError('') }}
                    className={`p-6 rounded-xl border-2 transition ${selectedSport === sport.key ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <div className="text-4xl mb-2">{sport.icon}</div>
                    <div className="text-white font-bold text-lg">{sport.name}</div>
                    <div className="text-gray-400 text-sm">{sport.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {selectedSport && (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
                  <h2 className="text-2xl font-bold text-white">Select Game</h2>
                </div>
                {loadingGames ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="ml-3 text-gray-400">Loading live games from SportRadar...</span>
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                    <p className="text-yellow-300 mb-4">{error}</p>
                    <button onClick={loadGames} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition">Try Again</button>
                  </div>
                ) : availableGames.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400">No upcoming {selectedSport.toUpperCase()} games at this time.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableGames.map(game => {
                      const odds = getGameOdds(game)
                      const ml   = odds.moneyline as any
                      const sp   = odds.spread    as any
                      const tot  = odds.total     as any
                      return (
                        <button key={game.id}
                          onClick={() => { setSelectedGame(game); setSelectedBetType('') }}
                          className={`w-full p-6 rounded-xl border-2 transition text-left ${selectedGame?.id === game.id ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="text-xs text-gray-400 mb-1">{game.sport_title || game.sport_key?.toUpperCase()}</div>
                              <div className="text-white font-bold text-lg">{game.away_team} @ {game.home_team}</div>
                              <div className="text-gray-400 text-sm">{new Date(game.commence_time).toLocaleString()}</div>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-gray-400 ml-4 flex-shrink-0 transition ${selectedGame?.id === game.id ? 'rotate-180' : ''}`} />
                          </div>
                          {(ml || sp || tot) ? (
                            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10">
                              {ml && <div><div className="text-xs text-gray-500 mb-1">Moneyline</div><div className="text-sm text-white font-semibold">{game.home_team.split(' ').pop()}: {ml.home}</div><div className="text-sm text-white font-semibold">{game.away_team.split(' ').pop()}: {ml.away}</div></div>}
                              {sp && <div><div className="text-xs text-gray-500 mb-1">Spread</div><div className="text-sm text-white font-semibold">{sp.home}</div><div className="text-sm text-white font-semibold">{sp.away}</div></div>}
                              {tot && <div><div className="text-xs text-gray-500 mb-1">Total</div><div className="text-sm text-white font-semibold">{tot.over}</div><div className="text-sm text-white font-semibold">{tot.under}</div></div>}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 pt-3 border-t border-white/10">Odds not yet posted</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedGame && (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">3</div>
                  <h2 className="text-2xl font-bold text-white">Select Bet Type</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {betTypes.map(bt => (
                    <button key={bt.key} onClick={() => setSelectedBetType(bt.key)}
                      className={`p-6 rounded-xl border-2 transition text-left ${selectedBetType === bt.key ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                      <div className="text-white font-bold text-lg mb-1">{bt.name}</div>
                      <div className="text-gray-400 text-sm">{bt.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedGame && selectedBetType && (
              <button onClick={runSimulation} disabled={simulating}
                className="w-full py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-2xl font-bold text-xl transition shadow-xl shadow-blue-500/30">
                {simulating ? (
                  <span className="flex items-center justify-center space-x-3">
                    <Loader2 className="w-6 h-6 animate-spin" /><span>Running Simulation...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-3">
                    <Zap className="w-6 h-6" /><span>Run Simulation</span>
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}