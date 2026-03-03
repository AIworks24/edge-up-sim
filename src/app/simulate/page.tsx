'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import { 
  ArrowLeft,
  Zap,
  ChevronDown,
  TrendingUp,
  Target,
  Calendar,
  AlertCircle,
  Loader2,
  CheckCircle2,
  DollarSign
} from 'lucide-react'

interface Game {
  id: string
  home_team: string
  away_team: string
  sport_title: string
  sport_key: string      // stored as 'ncaab', 'nfl', 'nba' (SportRadar keys)
  commence_time: string
  odds_data: any         // stored as { spread_home, total, moneyline_home, ... }
  home_team_sr_id?: string
  away_team_sr_id?: string
  external_event_id?: string
}

// ─── FIXED: sport keys now match what trigger-fetch stores (SportRadar format) ───
// trigger-fetch stores sport_key as: 'ncaab', 'nfl', 'nba'
// (NOT the old Odds API keys like 'basketball_ncaab')
const SPORT_KEY_MAP: Record<string, string> = {
  'nfl':   'nfl',
  'nba':   'nba',
  'ncaab': 'ncaab',
}

// Reverse map for API calls (sport_key in DB → UI sport key for simulation API)
const DB_TO_UI_SPORT_MAP: Record<string, string> = {
  'ncaab': 'ncaab',
  'nba':   'nba',
  'nfl':   'nfl',
}

export default function SimulatePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSport, setSelectedSport] = useState<string>('')
  const [availableGames, setAvailableGames] = useState<Game[]>([])
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [loadingGames, setLoadingGames] = useState(false)
  const [selectedBetType, setSelectedBetType] = useState<string>('')
  const [simulating, setSimulating] = useState(false)
  const [prediction, setPrediction] = useState<any>(null)
  const [error, setError] = useState('')
  const [debugInfo, setDebugInfo] = useState<string>('')

  // ─── Only show sports that are actually active (Phase 1 = CBB only) ──────────
  const sports = [
    { key: 'ncaab', name: 'NCAA Basketball', icon: '🏀', description: 'College Basketball' },
    { key: 'nfl',   name: 'NFL',             icon: '🏈', description: 'National Football League' },
    { key: 'nba',   name: 'NBA',             icon: '🏀', description: 'National Basketball Association' },
  ]

  const betTypes = [
    { key: 'moneyline', name: 'Moneyline',   description: 'Pick the winner' },
    { key: 'spread',    name: 'Point Spread', description: 'Win by margin' },
    { key: 'total',     name: 'Over/Under',   description: 'Total points scored' }
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
    } catch (err) {
      console.error('Auth error:', err)
      router.push('/login')
    }
  }

  const loadGames = async () => {
    setLoadingGames(true)
    setError('')
    setDebugInfo('')
    setAvailableGames([])

    try {
      // FIXED: Use the correct sport key (SportRadar format, not Odds API format)
      const dbSportKey = SPORT_KEY_MAP[selectedSport]
      if (!dbSportKey) {
        throw new Error(`Unknown sport: ${selectedSport}`)
      }

      console.log(`[loadGames] Querying sport_key='${dbSportKey}' in sports_events table`)

      const { data: games, error: gamesError } = await supabase
        .from('sports_events')
        .select('*')
        .eq('sport_key', dbSportKey)
        .eq('event_status', 'upcoming')
        .gte('commence_time', new Date().toISOString())
        .order('commence_time', { ascending: true })
        .limit(20)

      if (gamesError) {
        console.error('[loadGames] Database error:', gamesError)
        throw gamesError
      }

      console.log(`[loadGames] Found ${games?.length ?? 0} games for ${dbSportKey}`)

      if (!games || games.length === 0) {
        // Helpful message pointing to the manual trigger
        setError(
          `No upcoming ${selectedSport.toUpperCase()} games in database. ` +
          `Run /api/admin/trigger-fetch to populate games from SportRadar.`
        )
        setDebugInfo(`Queried: sport_key='${dbSportKey}', event_status='upcoming', commence_time >= now`)
        setAvailableGames([])
      } else {
        setAvailableGames(games)
        setError('')
      }
    } catch (err: any) {
      console.error('[loadGames] Error:', err)
      setError(`Failed to load games: ${err.message}`)
    } finally {
      setLoadingGames(false)
    }
  }

  // ─── FIXED: Parse SportRadar flat odds format (not Odds API bookmaker array) ──
  // trigger-fetch stores odds_data as:
  //   { spread_home, spread_home_odds, total, total_over_odds, moneyline_home, moneyline_away, ... }
  const getGameOdds = (game: Game) => {
    try {
      if (!game.odds_data) {
        return { spread: null, total: null, moneyline: null }
      }

      // odds_data may be a JSON string (Supabase sometimes returns JSONB as string)
      let o = game.odds_data
      if (typeof o === 'string') {
        o = JSON.parse(o)
      }

      const formatAmerican = (n: number | null | undefined): string | null => {
        if (n == null) return null
        return n > 0 ? `+${n}` : `${n}`
      }

      return {
        spread: o.spread_home != null ? {
          home: `${o.spread_home > 0 ? '+' : ''}${o.spread_home} (${formatAmerican(o.spread_home_odds)})`,
          away: `${o.spread_home > 0 ? '-' : '+'}${Math.abs(o.spread_home)} (${formatAmerican(o.spread_away_odds)})`,
        } : null,
        total: o.total != null ? {
          over:  `O${o.total} (${formatAmerican(o.total_over_odds)})`,
          under: `U${o.total} (${formatAmerican(o.total_under_odds)})`,
        } : null,
        moneyline: (o.moneyline_home != null || o.moneyline_away != null) ? {
          home: formatAmerican(o.moneyline_home),
          away: formatAmerican(o.moneyline_away),
        } : null,
        raw: o,
      }
    } catch (err) {
      console.error('[getGameOdds] Parse error:', err, game.odds_data)
      return { spread: null, total: null, moneyline: null }
    }
  }

  const runSimulation = async () => {
    if (!selectedGame || !selectedBetType) return

    const dailyLimit  = profile?.daily_simulation_limit  || 3
    const currentCount = profile?.daily_simulation_count  || 0
    const rollover    = profile?.monthly_simulation_rollover || 0

    if (currentCount >= dailyLimit + rollover) {
      setError(`You've reached your daily simulation limit (${dailyLimit} + ${rollover} rollover).`)
      return
    }

    setSimulating(true)
    setError('')
    setPrediction(null)

    try {
      const uiSportKey = DB_TO_UI_SPORT_MAP[selectedGame.sport_key] || selectedGame.sport_key
      const odds = getGameOdds(selectedGame)

      const response = await fetch('/api/predictions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId:        selectedGame.external_event_id || selectedGame.id,
          sport:          uiSportKey,
          betType:        selectedBetType,
          userId:         user.id,
          home_team:      selectedGame.home_team,
          away_team:      selectedGame.away_team,
          home_team_sr_id: selectedGame.home_team_sr_id,
          away_team_sr_id: selectedGame.away_team_sr_id,
          spread_home:    odds.raw?.spread_home     ?? null,
          total:          odds.raw?.total           ?? null,
          moneyline_home: odds.raw?.moneyline_home  ?? null,
          moneyline_away: odds.raw?.moneyline_away  ?? null,
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to generate prediction')

      setPrediction(result.prediction || result)

      // Refresh profile for updated sim count
      const { data: updatedProfile } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      if (updatedProfile) setProfile(updatedProfile)

    } catch (err: any) {
      console.error('[runSimulation] Error:', err)
      setError(err.message || 'Failed to run simulation.')
    } finally {
      setSimulating(false)
    }
  }

  const resetForm = () => {
    setSelectedSport('')
    setSelectedGame(null)
    setSelectedBetType('')
    setPrediction(null)
    setError('')
    setAvailableGames([])
    setDebugInfo('')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
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
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Run Simulation</h1>
          <p className="text-gray-400">Select a sport, game, and bet type to get an AI-powered edge analysis.</p>
        </div>

        {/* Prediction Result */}
        {prediction && (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-green-500/30 rounded-2xl p-8 mb-8">
            <div className="flex items-center space-x-3 mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <h2 className="text-2xl font-bold text-white">Simulation Complete</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Edge Score</div>
                <div className={`text-2xl font-bold ${
                  (prediction.edge_score || 0) >= 20 ? 'text-green-400' :
                  (prediction.edge_score || 0) >= 12 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {prediction.edge_score ?? prediction.edgeScore ?? 0}%
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Confidence</div>
                <div className="text-2xl font-bold text-blue-400">
                  {prediction.confidence_tier || prediction.confidenceTier || 'N/A'}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Recommendation</div>
                <div className="text-lg font-bold text-white">
                  {prediction.recommended_bet || prediction.recommendedBet || '—'}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Bet Type</div>
                <div className="text-lg font-bold text-white capitalize">{selectedBetType}</div>
              </div>
            </div>

            {(prediction.analysis || prediction.reasoning) && (
              <div className="bg-white/5 rounded-xl p-4 mb-4">
                <div className="text-sm font-semibold text-gray-400 mb-2">Analysis</div>
                <div className="text-gray-300 leading-relaxed">
                  {prediction.analysis || prediction.reasoning}
                </div>
              </div>
            )}

            {(prediction.risk_assessment || prediction.riskAssessment) && (
              <div className="bg-white/5 rounded-xl p-4">
                <div className="text-sm font-semibold text-gray-400 mb-2">Risk Assessment</div>
                <div className="text-orange-300">{prediction.risk_assessment || prediction.riskAssessment}</div>
              </div>
            )}

            <button
              onClick={resetForm}
              className="mt-6 w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition"
            >
              Run Another Simulation
            </button>
          </div>
        )}

        {/* Simulation Form */}
        {!prediction && (
          <div className="space-y-8">
            {/* Step 1: Select Sport */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                <h2 className="text-2xl font-bold text-white">Select Sport</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sports.map((sport) => (
                  <button
                    key={sport.key}
                    onClick={() => {
                      setSelectedSport(sport.key)
                      setSelectedGame(null)
                      setSelectedBetType('')
                      setError('')
                    }}
                    className={`p-6 rounded-xl border-2 transition ${
                      selectedSport === sport.key
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="text-4xl mb-2">{sport.icon}</div>
                    <div className="text-white font-bold text-lg">{sport.name}</div>
                    <div className="text-gray-400 text-sm">{sport.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Select Game */}
            {selectedSport && (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
                  <h2 className="text-2xl font-bold text-white">Select Game</h2>
                </div>

                {loadingGames ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="ml-3 text-gray-400">Loading games...</span>
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                    <p className="text-yellow-300 mb-2">{error}</p>
                    {debugInfo && <p className="text-gray-500 text-xs">{debugInfo}</p>}
                    <button
                      onClick={loadGames}
                      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition"
                    >
                      Retry
                    </button>
                  </div>
                ) : availableGames.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400">No upcoming games available for {selectedSport.toUpperCase()}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableGames.map((game) => {
                      const odds = getGameOdds(game)
                      const hasOdds = odds.moneyline || odds.spread || odds.total

                      return (
                        <button
                          key={game.id}
                          onClick={() => { setSelectedGame(game); setSelectedBetType('') }}
                          className={`w-full p-6 rounded-xl border-2 transition text-left ${
                            selectedGame?.id === game.id
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm text-gray-400 mb-1">
                                  {game.sport_title || game.sport_key?.toUpperCase()}
                                </div>
                                <div className="text-white font-bold text-lg">
                                  {game.away_team} @ {game.home_team}
                                </div>
                                <div className="text-gray-400 text-sm mt-1">
                                  {new Date(game.commence_time).toLocaleString()}
                                </div>
                              </div>
                              <ChevronDown className={`w-5 h-5 text-gray-400 transition flex-shrink-0 ml-4 ${
                                selectedGame?.id === game.id ? 'rotate-180' : ''
                              }`} />
                            </div>

                            {/* Odds display — SportRadar flat format */}
                            {hasOdds ? (
                              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10">
                                {odds.moneyline && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Moneyline</div>
                                    <div className="text-sm text-gray-300">{game.home_team.split(' ').pop()}: <span className="text-white font-semibold">{odds.moneyline.home}</span></div>
                                    <div className="text-sm text-gray-300">{game.away_team.split(' ').pop()}: <span className="text-white font-semibold">{odds.moneyline.away}</span></div>
                                  </div>
                                )}
                                {odds.spread && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Spread</div>
                                    <div className="text-sm text-white font-semibold">{odds.spread.home}</div>
                                    <div className="text-sm text-white font-semibold">{odds.spread.away}</div>
                                  </div>
                                )}
                                {odds.total && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Total</div>
                                    <div className="text-sm text-white font-semibold">{odds.total.over}</div>
                                    <div className="text-sm text-white font-semibold">{odds.total.under}</div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 pt-3 border-t border-white/10">
                                Odds not yet available
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Select Bet Type */}
            {selectedGame && (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">3</div>
                  <h2 className="text-2xl font-bold text-white">Select Bet Type</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {betTypes.map((betType) => (
                    <button
                      key={betType.key}
                      onClick={() => setSelectedBetType(betType.key)}
                      className={`p-6 rounded-xl border-2 transition text-left ${
                        selectedBetType === betType.key
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="text-white font-bold text-lg mb-1">{betType.name}</div>
                      <div className="text-gray-400 text-sm">{betType.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Run Button */}
            {selectedGame && selectedBetType && (
              <button
                onClick={runSimulation}
                disabled={simulating}
                className="w-full py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-2xl font-bold text-xl transition shadow-xl shadow-blue-500/30"
              >
                {simulating ? (
                  <span className="flex items-center justify-center space-x-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Running Simulation...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-3">
                    <Zap className="w-6 h-6" />
                    <span>Run Simulation</span>
                  </span>
                )}
              </button>
            )}

            {/* Global error */}
            {error && !loadingGames && availableGames.length === 0 && !selectedSport && (
              <div className="flex items-center space-x-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}