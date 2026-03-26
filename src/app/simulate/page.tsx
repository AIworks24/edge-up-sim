'use client'

// src/app/simulate/page.tsx
// FULL REPLACEMENT
//
// New UX flow:
//   1. Sport tabs (ncaab / nfl / nba)
//   2. Game summary cards — auto-generated, sorted by edge_score
//      Fallback to live game list if cron hasn't run yet
//   3. Click a card → CustomParamsModal (sport-specific sliders, optional)
//   4. "Run Full Analysis" → /api/simulate → SimResultCard (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertCircle, Calendar,
  ChevronDown, TrendingUp, Zap, Target,
} from 'lucide-react'
import { SimResultCard } from '@/components/simulation/SimResultCard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameSummary {
  id:                  string
  event_id:            string
  sport:               string
  home_team:           string
  away_team:           string
  game_time:           string
  edge_score:          number
  edge_tier:           string
  confidence_score:    number
  recommended_bet_type: string
  recommended_line:    any
  projected_home_score?: number
  projected_away_score?: number
  ai_analysis:         string
  key_factors:         string[]
  market_spread:       number | null
  market_total:        number | null
  fair_spread:         number | null
  fair_total:          number | null
  sim_home_win_pct:    number | null
  // SR IDs — needed for full simulation call
  home_team_sr_id:     string | null
  away_team_sr_id:     string | null
  neutral_site:        boolean
  odds_data:           any
}

// Fallback game from /api/sports/events when no summaries exist
interface LiveGame {
  id:                string
  external_event_id: string
  sport_key:         string
  home_team:         string
  away_team:         string
  commence_time:     string
  home_team_sr_id:   string | null
  away_team_sr_id:   string | null
  neutral_site:      boolean
  odds_data:         any
}

interface CustomSimParams {
  totalPoints?:     number
  pace?:            number
  offensiveRating?: number
  defensiveRating?: number
}

// ── Sport config ──────────────────────────────────────────────────────────────

const SPORTS = [
  { key: 'ncaab', name: 'NCAA Basketball', icon: '🏀', description: 'College Basketball' },
  { key: 'nfl',   name: 'NFL',             icon: '🏈', description: 'National Football League' },
  { key: 'nba',   name: 'NBA',             icon: '🏀', description: 'Pro Basketball' },
]

// Sport-specific slider definitions
const SLIDERS: Record<string, Array<{
  key: keyof CustomSimParams
  label: string
  min: number; max: number; step: number; default: number
  unit: string; hint: string
}>> = {
  ncaab: [
    { key: 'totalPoints',     label: 'Total Points O/U',         min: 100, max: 200, step: 1,   default: 145, unit: 'pts', hint: 'Adjust projected combined score' },
    { key: 'pace',            label: 'Pace (Possessions)',       min: 60,  max: 82,  step: 0.5, default: 69,  unit: '',   hint: 'Expected possessions per 40 min' },
    { key: 'offensiveRating', label: 'Offensive Rating (ORtg)',  min: 90,  max: 125, step: 0.5, default: 104, unit: '',   hint: 'Points per 100 possessions' },
    { key: 'defensiveRating', label: 'Defensive Rating (DRtg)',  min: 90,  max: 125, step: 0.5, default: 104, unit: '',   hint: 'Points allowed per 100 possessions' },
  ],
  nfl: [
    { key: 'totalPoints', label: 'Total Points O/U', min: 28, max: 68, step: 0.5, default: 44, unit: 'pts', hint: 'Adjust projected combined score' },
  ],
  nba: [
    { key: 'totalPoints',     label: 'Total Points O/U',        min: 190, max: 260, step: 1,   default: 225, unit: 'pts', hint: 'Adjust projected combined score' },
    { key: 'pace',            label: 'Pace (Possessions)',      min: 90,  max: 112, step: 0.5, default: 100, unit: '',   hint: 'Expected possessions per game' },
    { key: 'offensiveRating', label: 'Offensive Rating (ORtg)', min: 105, max: 125, step: 0.5, default: 115, unit: '',   hint: 'Points per 100 possessions' },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtOdds(n: number | null | undefined) {
  if (n == null) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

function edgeColor(score: number) {
  if (score >= 20) return 'text-green-400'
  if (score >= 10) return 'text-yellow-400'
  return 'text-gray-400'
}

function edgeBadgeCss(tier: string) {
  const map: Record<string, string> = {
    EXCEPTIONAL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    STRONG:      'bg-green-500/20 text-green-300 border-green-500/30',
    MODERATE:    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    RISKY:       'bg-orange-500/20 text-orange-300 border-orange-500/30',
  }
  return map[tier] ?? 'bg-white/10 text-gray-400 border-white/10'
}

function parseOdds(oddsData: any) {
  if (!oddsData) return { spread: null, total: null, moneyline: null, raw: {} }
  const o = typeof oddsData === 'string' ? JSON.parse(oddsData) : oddsData
  const fmt = (n: number | null | undefined) => n == null ? null : n > 0 ? `+${n}` : `${n}`
  return {
    raw: o,
    spread:    o.spread_home    != null ? { home: `${o.spread_home > 0 ? '+' : ''}${o.spread_home} (${fmt(o.spread_home_odds)})`, away: `${(-o.spread_home) > 0 ? '+' : ''}${-o.spread_home} (${fmt(o.spread_away_odds)})` } : null,
    total:     o.total          != null ? { over: `O${o.total} (${fmt(o.total_over_odds)})`, under: `U${o.total} (${fmt(o.total_under_odds)})` } : null,
    moneyline: (o.moneyline_home != null || o.moneyline_away != null) ? { home: fmt(o.moneyline_home), away: fmt(o.moneyline_away) } : null,
  }
}

// ── CustomParamsModal ─────────────────────────────────────────────────────────

function CustomParamsModal({
  game,
  sport,
  isRunning,
  onRun,
  onClose,
}: {
  game: GameSummary | LiveGame
  sport: string
  isRunning: boolean
  onRun: (params: CustomSimParams | undefined) => void
  onClose: () => void
}) {
  const sliders = SLIDERS[sport] ?? []
  const [useCustom, setUseCustom] = useState(false)
  const [params, setParams] = useState<CustomSimParams>(() => {
    const d: CustomSimParams = {}
    sliders.forEach(s => { (d as any)[s.key] = s.default })
    return d
  })

  const homeTeam = ('home_team' in game ? game.home_team : '')
  const awayTeam = ('away_team' in game ? game.away_team : '')
  const time     = new Date('game_time' in game ? game.game_time : (game as any).commence_time)
  const dateStr  = time.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Show summary data if this is a GameSummary
  const summary = 'edge_score' in game ? (game as GameSummary) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/10">
          <div>
            <p className="text-xs text-gray-500 mb-1">{dateStr}</p>
            <h2 className="text-lg font-bold text-white">
              {awayTeam} <span className="text-gray-500">@</span> {homeTeam}
            </h2>
            {summary && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${edgeBadgeCss(summary.edge_tier)}`}>
                  {summary.edge_tier}
                </span>
                <span className={`text-sm font-black ${edgeColor(summary.edge_score)}`}>
                  {summary.edge_score >= 0 ? '+' : ''}{summary.edge_score?.toFixed(1)}% Edge
                </span>
                <span className="text-xs text-gray-500">
                  {summary.confidence_score?.toFixed(0)}% confidence
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1 leading-none">✕</button>
        </div>

        {/* Summary preview (if available) */}
        {summary?.recommended_line?.top_pick && (
          <div className="px-5 py-4 border-b border-white/5 bg-white/5">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">AI Top Pick Preview</p>
            <p className="text-white font-bold">{summary.recommended_line.top_pick.label}</p>
            {summary.ai_analysis && (
              <p className="text-xs text-gray-400 mt-2 leading-relaxed line-clamp-3">{summary.ai_analysis}</p>
            )}
          </div>
        )}

        {/* Odds lines */}
        {(() => {
          const odds = parseOdds(('odds_data' in game) ? (game as any).odds_data : {})
          const hasOdds = odds.spread || odds.total || odds.moneyline
          if (!hasOdds) return null
          return (
            <div className="px-5 py-3 border-b border-white/5 flex gap-4 text-xs text-gray-400 flex-wrap">
              {odds.spread    && <span>Spread <span className="text-gray-200">{odds.spread.home}</span></span>}
              {odds.total     && <span>Total <span className="text-gray-200">{odds.total.over}</span></span>}
              {odds.moneyline && <span>ML Home <span className="text-gray-200">{fmtOdds((game as any).odds_data?.moneyline_home)}</span></span>}
            </div>
          )
        })()}

        {/* Custom Params Toggle */}
        {sliders.length > 0 && (
          <div className="p-5 border-b border-white/5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-semibold text-white">Custom Scenario</p>
                <p className="text-xs text-gray-500 mt-0.5">Adjust game-environment parameters to test different scenarios</p>
              </div>
              <button
                onClick={() => setUseCustom(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${useCustom ? 'bg-blue-600' : 'bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${useCustom ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {useCustom && (
              <div className="mt-4 space-y-4">
                {sliders.map(s => (
                  <div key={s.key}>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs font-medium text-gray-300">{s.label}</label>
                      <span className="text-sm font-black text-blue-400">
                        {(params as any)[s.key]}{s.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={s.min} max={s.max} step={s.step}
                      value={(params as any)[s.key] ?? s.default}
                      onChange={e => setParams(p => ({ ...p, [s.key]: parseFloat(e.target.value) }))}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                      <span>{s.min}{s.unit}</span>
                      <span className="text-center text-gray-600">{s.hint}</span>
                      <span>{s.max}{s.unit}</span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => { const d: CustomSimParams = {}; sliders.forEach(s => { (d as any)[s.key] = s.default }); setParams(d) }}
                  className="text-xs text-gray-500 hover:text-gray-300 underline"
                >Reset to defaults</button>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="p-5 space-y-3">
          <button
            onClick={() => onRun(useCustom ? params : undefined)}
            disabled={isRunning}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
          >
            {isRunning ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Running Full Analysis...</>
            ) : (
              <><Zap className="w-4 h-4" />Run Full{useCustom ? ' Custom' : ''} Analysis <span className="text-xs font-normal opacity-70">(1 sim)</span></>
            )}
          </button>
          <button onClick={onClose} className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 font-medium rounded-xl transition text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── GameSummaryCard ───────────────────────────────────────────────────────────

function GameSummaryCard({ summary, onClick }: { summary: GameSummary; onClick: () => void }) {
  const tp       = summary.recommended_line?.top_pick
  const gameDate = new Date(summary.game_time)
  const isToday  = new Date().toDateString() === gameDate.toDateString()
  const dateStr  = isToday
    ? `Today · ${gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : gameDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-800/50 backdrop-blur-xl border border-white/10 hover:border-blue-500/40 hover:bg-slate-800/80 rounded-2xl p-5 transition group"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">{dateStr}</p>
          <p className="text-sm font-bold text-white leading-tight">
            {summary.away_team} <span className="text-gray-500 font-normal">@</span> {summary.home_team}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={`text-lg font-black ${edgeColor(summary.edge_score)}`}>
            {summary.edge_score >= 0 ? '+' : ''}{summary.edge_score?.toFixed(1)}%
          </p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${edgeBadgeCss(summary.edge_tier)}`}>
            {summary.edge_tier}
          </span>
        </div>
      </div>

      {/* Top pick label */}
      {tp?.label && (
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-blue-300">{tp.label}</span>
          {tp.win_pct != null && (
            <span className="text-xs text-gray-500">{tp.win_pct?.toFixed(1)}% win prob</span>
          )}
        </div>
      )}

      {/* AI analysis preview */}
      <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-3">{summary.ai_analysis}</p>

      {/* Fair vs market lines */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        {summary.fair_spread != null && summary.market_spread != null && (
          <span>Spread: Fair <span className="text-blue-300">{summary.fair_spread > 0 ? '+' : ''}{summary.fair_spread?.toFixed(1)}</span> vs mkt <span className="text-white">{summary.market_spread > 0 ? '+' : ''}{summary.market_spread}</span></span>
        )}
        {summary.fair_total != null && summary.market_total != null && (
          <span>Total: Fair <span className="text-blue-300">{summary.fair_total?.toFixed(1)}</span> vs <span className="text-white">{summary.market_total}</span></span>
        )}
      </div>

      {/* Key factors (first 2) */}
      {Array.isArray(summary.key_factors) && summary.key_factors.length > 0 && (
        <ul className="space-y-0.5 mb-3">
          {summary.key_factors.slice(0, 2).map((f, i) => (
            <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
              <span className="text-blue-400 flex-shrink-0">•</span>{f}
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">{summary.confidence_score?.toFixed(0)}% confidence</span>
        <span className="text-xs text-blue-400 group-hover:text-blue-300 flex items-center gap-1">
          Run Full Analysis <TrendingUp className="w-3 h-3" />
        </span>
      </div>
    </button>
  )
}

// ── LiveGameCard (fallback) ───────────────────────────────────────────────────

function LiveGameCard({ game, isSelected, onClick }: { game: LiveGame; isSelected: boolean; onClick: () => void }) {
  const odds    = parseOdds(game.odds_data)
  const gameDate = new Date(game.commence_time)
  const dateStr  = gameDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition ${isSelected ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold text-sm leading-tight">
              {game.away_team} @ {game.home_team}
            </div>
            <div className="text-gray-400 text-xs mt-0.5">{dateStr}</div>
          </div>
          <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition ${isSelected ? 'rotate-180' : ''}`} />
        </div>
        {(odds.spread || odds.total || odds.moneyline) && (
          <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
            {odds.spread    && <span>Spread: <span className="text-white">{odds.spread.home}</span></span>}
            {odds.total     && <span>Total: <span className="text-white">{odds.total.over}</span></span>}
            {odds.moneyline && <span>ML: <span className="text-white">{odds.moneyline.home}</span></span>}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SimulatePage() {
  const router = useRouter()
  const [user, setUser]         = useState<any>(null)
  const [profile, setProfile]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [selectedSport, setSelectedSport] = useState('ncaab')

  // Summary feed state
  const [summaries, setSummaries]         = useState<GameSummary[]>([])
  const [loadingSummaries, setLoadingSummaries] = useState(false)
  const [summaryError, setSummaryError]   = useState('')

  // Fallback: live games when no summaries
  const [liveGames, setLiveGames]         = useState<LiveGame[]>([])
  const [loadingLive, setLoadingLive]     = useState(false)
  const [showFallback, setShowFallback]   = useState(false)

  // Modal + simulation state
  const [modalGame, setModalGame]         = useState<GameSummary | LiveGame | null>(null)
  const [simulating, setSimulating]       = useState(false)
  const [prediction, setPrediction]       = useState<any>(null)
  const [error, setError]                 = useState('')

  // ── Auth ──────────────────────────────────────────────────────────────
  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    try {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { router.push('/login'); return }
      setUser(u)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', u.id).single()
      setProfile(p)
      setLoading(false)
    } catch { router.push('/login') }
  }

  // ── Load summaries when sport changes ─────────────────────────────────
  const loadSummaries = useCallback(async (sport: string) => {
    setLoadingSummaries(true)
    setSummaryError('')
    setSummaries([])
    setShowFallback(false)
    setPrediction(null)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res  = await fetch(`/api/simulations/summaries?sport=${sport}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load summaries')

      if ((body.summaries ?? []).length > 0) {
        setSummaries(body.summaries)
      } else {
        // Cron hasn't run yet — fall back to live game list
        setShowFallback(true)
        loadLiveGames(sport)
      }
    } catch (e: any) {
      setSummaryError(e.message)
      setShowFallback(true)
      loadLiveGames(sport)
    } finally {
      setLoadingSummaries(false)
    }
  }, [])

  async function loadLiveGames(sport: string) {
    setLoadingLive(true)
    try {
      const res  = await fetch(`/api/sports/events?sport=${sport}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'API error')
      setLiveGames(body.events || [])
    } catch { setLiveGames([]) }
    finally { setLoadingLive(false) }
  }

  useEffect(() => { if (!loading) loadSummaries(selectedSport) }, [selectedSport, loading])

  // ── Run simulation from modal ─────────────────────────────────────────
  async function handleRunSim(customParams: CustomSimParams | undefined) {
    if (!modalGame || !user) return
    const dailyLimit   = profile?.daily_simulation_limit      || 3
    const currentCount = profile?.daily_simulation_count      || 0
    const rollover     = profile?.monthly_simulation_rollover || 0
    if (currentCount >= dailyLimit + rollover) {
      setError(`Daily limit reached (${dailyLimit} + ${rollover} rollover).`)
      setModalGame(null)
      return
    }

    setSimulating(true)
    setError('')
    setPrediction(null)

    try {
      // Build the request body — works for both GameSummary and LiveGame
      const isSummary  = 'edge_score' in modalGame
      const eventId    = isSummary ? (modalGame as GameSummary).event_id : (modalGame as LiveGame).id
      const homeTeam   = modalGame.home_team
      const awayTeam   = modalGame.away_team
      const homeSrId   = isSummary
        ? (modalGame as GameSummary).home_team_sr_id
        : (modalGame as LiveGame).home_team_sr_id
      const awaySrId   = isSummary
        ? (modalGame as GameSummary).away_team_sr_id
        : (modalGame as LiveGame).away_team_sr_id
      const neutralSite = isSummary
        ? (modalGame as GameSummary).neutral_site
        : (modalGame as LiveGame).neutral_site
      const gameTime   = isSummary
        ? (modalGame as GameSummary).game_time
        : (modalGame as LiveGame).commence_time
      const oddsData   = typeof modalGame.odds_data === 'string'
        ? JSON.parse(modalGame.odds_data ?? '{}')
        : (modalGame.odds_data ?? {})

      const res = await fetch('/api/simulate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id:        eventId,
          sport:           selectedSport,
          user_id:         user.id,
          home_team:       homeTeam,
          away_team:       awayTeam,
          home_team_sr_id: homeSrId,
          away_team_sr_id: awaySrId,
          spread_home:     oddsData.spread_home      ?? 0,
          total:           oddsData.total            ?? 140,
          odds_spread:     oddsData.spread_home_odds ?? -110,
          odds_total:      oddsData.total_over_odds  ?? -110,
          odds_ml_home:    oddsData.moneyline_home   ?? -150,
          odds_ml_away:    oddsData.moneyline_away   ?? 130,
          neutral_site:    neutralSite,
          game_time:       gameTime,
          custom_params:   customParams ?? null,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Simulation failed')
      setPrediction(result)
      setModalGame(null)
      // Refresh profile for updated sim count
      const { data: updated } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (updated) setProfile(updated)
    } catch (e: any) {
      setError(e.message || 'Simulation failed.')
    } finally {
      setSimulating(false)
    }
  }

  function resetAll() {
    setPrediction(null)
    setError('')
    setModalGame(null)
  }

  // ── Loading screen ────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
    </div>
  )

  const p = prediction

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">

      {/* Sticky header */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-2 text-gray-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" /><span className="text-sm">Dashboard</span>
          </Link>
          {profile && (
            <div className="text-sm text-gray-400">
              {profile.daily_simulation_count || 0}
              /{(profile.daily_simulation_limit || 3) + (profile.monthly_simulation_rollover || 0)} analyses today
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Game Simulations</h1>
          <p className="text-gray-400">
            Browse AI-generated game analyses — click any game to run a full simulation with optional custom scenarios.
          </p>
        </div>

        {/* ─── Full result (after sim runs) ─────────────────────────────── */}
        {p && (
          <div className="space-y-6">
            {p.custom_params && (
              <div className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <span className="text-purple-300 text-sm font-semibold">🎛️ Custom Scenario Applied</span>
                <span className="text-xs text-gray-400">Results reflect your adjusted parameters</span>
              </div>
            )}
            <SimResultCard result={p} />
            <button
              onClick={resetAll}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition"
            >
              ← Back to Game List
            </button>
          </div>
        )}

        {/* ─── Game feed (when no result yet) ───────────────────────────── */}
        {!p && (
          <>
            {/* Sport tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SPORTS.map(s => (
                <button
                  key={s.key}
                  onClick={() => { setSelectedSport(s.key); setPrediction(null); setError('') }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                    selectedSport === s.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/10 text-gray-400 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  <span>{s.icon}</span><span>{s.name}</span>
                </button>
              ))}
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {/* Loading summaries */}
            {loadingSummaries && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="ml-3 text-gray-400">Loading game analyses…</span>
              </div>
            )}

            {/* Summary feed */}
            {!loadingSummaries && summaries.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">
                    <span className="text-white font-bold">{summaries.length}</span> games · sorted by highest edge
                  </p>
                </div>
                <div className="space-y-4">
                  {summaries.map(s => (
                    <GameSummaryCard
                      key={s.id}
                      summary={s}
                      onClick={() => setModalGame(s)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Fallback: live game list */}
            {!loadingSummaries && showFallback && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                  <p className="text-xs text-yellow-300">
                    Auto-generated analyses not yet available for today — showing live games. Check back after 11:30am EST.
                  </p>
                </div>
                {loadingLive ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <span className="ml-2 text-gray-400 text-sm">Loading games…</span>
                  </div>
                ) : liveGames.length === 0 ? (
                  <div className="text-center py-12 bg-slate-800/50 border border-white/10 rounded-2xl">
                    <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No upcoming {selectedSport.toUpperCase()} games right now.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-400"><span className="text-white font-bold">{liveGames.length}</span> games available</p>
                    <div className="space-y-2">
                      {liveGames.map(game => (
                        <LiveGameCard
                          key={game.id}
                          game={game}
                          isSelected={modalGame !== null && 'commence_time' in modalGame && (modalGame as LiveGame).id === game.id}
                          onClick={() => setModalGame(game)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* No games at all */}
            {!loadingSummaries && !loadingLive && summaries.length === 0 && liveGames.length === 0 && !showFallback && (
              <div className="text-center py-12 bg-slate-800/50 border border-white/10 rounded-2xl">
                <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No {selectedSport.toUpperCase()} games available right now.</p>
                <p className="text-gray-600 text-sm mt-1">Run <code className="bg-white/10 px-1 rounded">/api/admin/trigger-fetch</code> to populate games.</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Custom Params Modal */}
      {modalGame && !prediction && (
        <CustomParamsModal
          game={modalGame}
          sport={selectedSport}
          isRunning={simulating}
          onRun={handleRunSim}
          onClose={() => setModalGame(null)}
        />
      )}
    </div>
  )
}