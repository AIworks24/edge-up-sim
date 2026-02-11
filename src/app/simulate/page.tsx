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
  sport_key: string
  commence_time: string
  odds_data: any
}

// Map UI sport keys to database sport keys
const SPORT_KEY_MAP: Record<string, string> = {
  'nfl': 'americanfootball_nfl',
  'nba': 'basketball_nba',
  'ncaaf': 'americanfootball_ncaa',
  'ncaab': 'basketball_ncaab',
  'mlb': 'baseball_mlb',
  'nhl': 'icehockey_nhl'
}

// Reverse map for API calls
const DB_TO_UI_SPORT_MAP: Record<string, string> = {
  'americanfootball_nfl': 'nfl',
  'basketball_nba': 'nba',
  'americanfootball_ncaa': 'ncaaf',
  'basketball_ncaab': 'ncaab',
  'baseball_mlb': 'mlb',
  'icehockey_nhl': 'nhl'
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

  const sports = [
    { key: 'nfl', name: 'NFL', icon: '🏈', description: 'National Football League' },
    { key: 'nba', name: 'NBA', icon: '🏀', description: 'National Basketball Association' },
    { key: 'ncaaf', name: 'NCAA Football', icon: '🏈', description: 'College Football' },
    { key: 'ncaab', name: 'NCAA Basketball', icon: '🏀', description: 'College Basketball' },
    { key: 'mlb', name: 'MLB', icon: '⚾', description: 'Major League Baseball' },
    { key: 'nhl', name: 'NHL', icon: '🏒', description: 'National Hockey League' }
  ]

  const betTypes = [
    { key: 'moneyline', name: 'Moneyline', description: 'Pick the winner' },
    { key: 'spread', name: 'Point Spread', description: 'Win by margin' },
    { key: 'total', name: 'Over/Under', description: 'Total points scored' }
  ]

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (selectedSport) {
      loadGames()
    }
  }, [selectedSport])

  const checkAuth = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/login')
        return
      }
      setUser(authUser)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      setProfile(profileData)
      setLoading(false)
    } catch (error) {
      console.error('Auth error:', error)
      router.push('/login')
    }
  }

  const loadGames = async () => {
    setLoadingGames(true)
    setError('')
    setAvailableGames([])
    
    try {
      const dbSportKey = SPORT_KEY_MAP[selectedSport]
      
      if (!dbSportKey) {
        throw new Error(`Invalid sport key: ${selectedSport}`)
      }

      const { data: games, error: gamesError } = await supabase
        .from('sports_events')
        .select('*')
        .eq('sport_key', dbSportKey)
        .eq('event_status', 'upcoming')
        .gte('commence_time', new Date().toISOString())
        .order('commence_time', { ascending: true })
        .limit(20)

      if (gamesError) {
        console.error('Database error:', gamesError)
        throw gamesError
      }

      if (!games || games.length === 0) {
        setError(`No upcoming ${selectedSport.toUpperCase()} games found.`)
        setAvailableGames([])
      } else {
        setAvailableGames(games)
        setError('')
      }
    } catch (error: any) {
      console.error('Error loading games:', error)
      setError(`Failed to load games: ${error.message}`)
      setAvailableGames([])
    } finally {
      setLoadingGames(false)
    }
  }

  // Extract betting odds from odds_data - FIXED to handle JSON string
  const getGameOdds = (game: Game) => {
    try {
      // Handle if odds_data is null or undefined
      if (!game.odds_data) {
        return { moneyline: null, spread: null, total: null, bookmaker: null }
      }

      // Parse if it's a string, otherwise use as-is
      let bookmakers = game.odds_data
      if (typeof game.odds_data === 'string') {
        bookmakers = JSON.parse(game.odds_data)
      }

      // Ensure it's an array
      if (!Array.isArray(bookmakers) || bookmakers.length === 0) {
        return { moneyline: null, spread: null, total: null, bookmaker: null }
      }

      const firstBookmaker = bookmakers[0]
      const result: any = { 
        moneyline: null, 
        spread: null, 
        total: null,
        bookmaker: firstBookmaker.title || firstBookmaker.key || 'Unknown'
      }

      if (firstBookmaker && firstBookmaker.markets) {
        firstBookmaker.markets.forEach((market: any) => {
          if (market.key === 'h2h') {
            result.moneyline = market.outcomes
          } else if (market.key === 'spreads') {
            result.spread = market.outcomes
          } else if (market.key === 'totals') {
            result.total = market.outcomes
          }
        })
      }

      return result
    } catch (error) {
      console.error('Error parsing odds:', error)
      return { moneyline: null, spread: null, total: null, bookmaker: null }
    }
  }

  // Format American odds
  const formatOdds = (odds: number) => {
    if (odds > 0) return `+${odds}`
    return odds.toString()
  }

  const runSimulation = async () => {
    if (!selectedGame || !selectedBetType) return

    const dailyLimit = profile?.daily_simulation_limit || 3
    const currentCount = profile?.daily_simulation_count || 0
    const rollover = profile?.monthly_simulation_rollover || 0

    if (currentCount >= dailyLimit + rollover) {
      setError(`You've reached your daily simulation limit (${dailyLimit} + ${rollover} rollover).`)
      return
    }

    setSimulating(true)
    setError('')
    setPrediction(null)

    try {
      const uiSportKey = DB_TO_UI_SPORT_MAP[selectedGame.sport_key]
      
      const response = await fetch('/api/predictions/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventId: selectedGame.id,
          sport: uiSportKey,
          betType: selectedBetType,
          userId: user.id
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate prediction')
      }

      setPrediction(result.prediction || result)

      // Refresh profile
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (updatedProfile) {
        setProfile(updatedProfile)
      }

    } catch (error: any) {
      console.error('Simulation error:', error)
      setError(error.message || 'Failed to run simulation.')
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

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12 text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
            Custom Simulation
          </h1>
          <p className="text-xl text-gray-300">
            AI-powered betting analysis for any game
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 p-6 bg-red-500/10 border border-red-500/50 rounded-xl">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-red-200 whitespace-pre-line">{error}</div>
            </div>
          </div>
        )}

        {/* Prediction Result */}
        {prediction && (
          <div className="bg-gradient-to-br from-green-900/50 to-blue-900/50 backdrop-blur-xl border border-green-500/30 rounded-2xl p-8 mb-8">
            <div className="flex items-center space-x-3 mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <h2 className="text-3xl font-bold text-white">Simulation Complete</h2>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-sm font-semibold text-gray-400 mb-2">Recommended Bet</div>
                <div className="text-2xl font-bold text-white">{prediction.predicted_winner || prediction.predictedWinner}</div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm font-semibold text-gray-400 mb-2">Confidence</div>
                  <div className="text-3xl font-bold text-blue-400">{prediction.confidence_score || prediction.confidenceScore}%</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-400 mb-2">Edge Score</div>
                  <div className="text-3xl font-bold text-green-400">{prediction.edge_score || prediction.edgeScore}%</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-400 mb-2">AI Analysis</div>
                <div className="text-gray-200 leading-relaxed">{prediction.ai_analysis || prediction.aiAnalysis}</div>
              </div>

              {(prediction.key_factors || prediction.keyFactors) && (
                <div>
                  <div className="text-sm font-semibold text-gray-400 mb-2">Key Factors</div>
                  <ul className="space-y-2">
                    {(prediction.key_factors || prediction.keyFactors).map((factor: string, index: number) => (
                      <li key={index} className="flex items-start space-x-2">
                        <Target className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-300">{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-gray-400 mb-2">Risk Assessment</div>
                <div className="text-orange-300">{prediction.risk_assessment || prediction.riskAssessment}</div>
              </div>
            </div>

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

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                          onClick={() => {
                            setSelectedGame(game)
                            setSelectedBetType('')
                          }}
                          className={`w-full p-6 rounded-xl border-2 transition text-left ${
                            selectedGame?.id === game.id
                              ? 'border-blue-500 bg-blue-500/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="space-y-4">
                            {/* Game Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm text-gray-400 mb-1">{game.sport_title}</div>
                                <div className="text-white font-bold text-lg">{game.away_team} @ {game.home_team}</div>
                                <div className="text-gray-400 text-sm mt-1">
                                  {new Date(game.commence_time).toLocaleString()}
                                </div>
                              </div>
                              <ChevronDown className={`w-5 h-5 text-gray-400 transition flex-shrink-0 ml-4 ${selectedGame?.id === game.id ? 'rotate-180' : ''}`} />
                            </div>

                            {/* Betting Odds */}
                            {hasOdds ? (
                              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
                                {/* Moneyline */}
                                {odds.moneyline && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-2 flex items-center">
                                      <DollarSign className="w-3 h-3 mr-1" />
                                      Moneyline
                                    </div>
                                    {odds.moneyline.map((outcome: any, idx: number) => (
                                      <div key={idx} className="text-sm">
                                        <span className="text-gray-400">{outcome.name.split(' ')[0]}: </span>
                                        <span className="text-white font-semibold">{formatOdds(outcome.price)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Spread */}
                                {odds.spread && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-2">Spread</div>
                                    {odds.spread.map((outcome: any, idx: number) => (
                                      <div key={idx} className="text-sm">
                                        <span className="text-gray-400">{outcome.name.split(' ')[0]}: </span>
                                        <span className="text-white font-semibold">
                                          {outcome.point > 0 ? '+' : ''}{outcome.point} ({formatOdds(outcome.price)})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Total */}
                                {odds.total && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-2">Total</div>
                                    {odds.total.map((outcome: any, idx: number) => (
                                      <div key={idx} className="text-sm">
                                        <span className="text-gray-400">{outcome.name}: </span>
                                        <span className="text-white font-semibold">
                                          {outcome.point} ({formatOdds(outcome.price)})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 pt-4 border-t border-white/10">
                                Odds not available yet
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

            {/* Step 4: Run Simulation */}
            {selectedBetType && (
              <button
                onClick={runSimulation}
                disabled={simulating}
                className="w-full py-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-2xl font-bold text-xl transition shadow-2xl shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
              >
                {simulating ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Running Simulation...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-6 h-6" />
                    <span>Run AI Simulation</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}