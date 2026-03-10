'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import {
  ArrowLeft, Zap, ChevronDown, Calendar,
  AlertCircle, Loader2, CheckCircle2,
} from 'lucide-react'

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

// ── Sub-components ────────────────────────────────────────────────────────────

function VerdictPill({ verdict }: { verdict: 'BET' | 'LEAN' | 'PASS' }) {
  const s = {
    BET:  'bg-green-500/20 text-green-300 border border-green-500/40',
    LEAN: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
    PASS: 'bg-white/10 text-gray-400 border border-white/10',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-wide ${s[verdict]}`}>
      {verdict}
    </span>
  )
}

function edgeColor(e: number) {
  if (e >= 20) return 'text-green-400'
  if (e >= 10) return 'text-yellow-400'
  return 'text-gray-400'
}

function fmtOdds(n: number) { return n > 0 ? `+${n}` : `${n}` }

// One bet side row — label, edge %, win prob, odds, fair line, analysis paragraph
function BetRow({
  label, win_pct, edge_pct, odds, fair_line, verdict, analysis, highlight,
}: {
  label: string; win_pct: number; edge_pct: number; odds: number
  fair_line: string; verdict: 'BET' | 'LEAN' | 'PASS'
  analysis: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 space-y-2 transition ${
      highlight
        ? 'bg-blue-500/10 border border-blue-500/30 shadow-sm shadow-blue-500/10'
        : 'bg-white/5 border border-white/5'
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">{label}</span>
          {highlight && <span className="text-blue-400 text-xs font-semibold">★ BEST SIDE</span>}
        </div>
        <div className="flex items-center gap-3">
          <VerdictPill verdict={verdict} />
          <span className={`text-lg font-bold ${edgeColor(edge_pct)}`}>{edge_pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
        <span>Win Prob <span className="text-white font-semibold">{win_pct.toFixed(1)}%</span></span>
        <span>Odds <span className="text-white font-semibold">{fmtOdds(odds)}</span></span>
        <span className="text-blue-300 truncate">{fair_line}</span>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{analysis}</p>
    </div>
  )
}

// Wrapper card for each bet type section
function BetSection({
  icon, label, colorClass, children,
}: {
  icon: string; label: string; colorClass: string; children: React.ReactNode
}) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-3">
      <h3 className="text-white font-bold text-lg flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center font-bold ${colorClass}`}>
          {icon}
        </span>
        {label}
      </h3>
      {children}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SimulatePage() {
  const router = useRouter()
  const [user, setUser]                     = useState<any>(null)
  const [profile, setProfile]               = useState<any>(null)
  const [loading, setLoading]               = useState(true)
  const [selectedSport, setSelectedSport]   = useState('')
  const [availableGames, setAvailableGames] = useState<Game[]>([])
  const [selectedGame, setSelectedGame]     = useState<Game | null>(null)
  const [loadingGames, setLoadingGames]     = useState(false)
  const [simulating, setSimulating]         = useState(false)
  const [prediction, setPrediction]         = useState<any>(null)
  const [error, setError]                   = useState('')

  const sports = [
    { key: 'ncaab', name: 'NCAA Basketball', icon: '🏀', description: 'College Basketball' },
    { key: 'nfl',   name: 'NFL',             icon: '🏈', description: 'National Football League' },
    { key: 'nba',   name: 'NBA',             icon: '🏀', description: 'Pro Basketball' },
  ]

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { if (selectedSport) loadGames() }, [selectedSport])

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

  async function loadGames() {
    setLoadingGames(true); setError(''); setAvailableGames([])
    try {
      const res  = await fetch(`/api/sports/events?sport=${selectedSport}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `API error ${res.status}`)
      const games: Game[] = body.events || []
      if (games.length === 0) {
        setError(`No upcoming ${selectedSport.toUpperCase()} games right now. Check back closer to game time.`)
      } else { setAvailableGames(games) }
    } catch (e: any) {
      setError(`Failed to load games: ${e.message}`)
    } finally { setLoadingGames(false) }
  }

  function getGameOdds(game: Game) {
    try {
      if (!game.odds_data) return { spread: null, total: null, moneyline: null, raw: null }
      const o = typeof game.odds_data === 'string' ? JSON.parse(game.odds_data) : game.odds_data
      if (o && ('spread_home' in o || 'total' in o || 'moneyline_home' in o)) {
        const fmt = (n: number | null | undefined) =>
          n == null ? null : n > 0 ? `+${n}` : `${n}`
        return {
          raw: o,
          spread:    o.spread_home    != null ? { home: `${o.spread_home > 0 ? '+' : ''}${o.spread_home} (${fmt(o.spread_home_odds)})`, away: `${(-o.spread_home) > 0 ? '+' : ''}${-o.spread_home} (${fmt(o.spread_away_odds)})` } : null,
          total:     o.total          != null ? { over: `O${o.total} (${fmt(o.total_over_odds)})`, under: `U${o.total} (${fmt(o.total_under_odds)})` } : null,
          moneyline: (o.moneyline_home != null || o.moneyline_away != null) ? { home: fmt(o.moneyline_home), away: fmt(o.moneyline_away) } : null,
        }
      }
      return { spread: null, total: null, moneyline: null, raw: o }
    } catch { return { spread: null, total: null, moneyline: null, raw: null } }
  }

  async function runSimulation() {
    if (!selectedGame || !user) return
    const dailyLimit   = profile?.daily_simulation_limit      || 3
    const currentCount = profile?.daily_simulation_count      || 0
    const rollover     = profile?.monthly_simulation_rollover || 0
    if (currentCount >= dailyLimit + rollover) {
      setError(`Daily limit reached (${dailyLimit} + ${rollover} rollover).`)
      return
    }

    setSimulating(true); setError(''); setPrediction(null)
    try {
      const { raw } = getGameOdds(selectedGame)
      const o = (raw as any) || {}
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id:        selectedGame.id,
          sport:           selectedGame.sport_key,
          user_id:         user.id,
          home_team:       selectedGame.home_team,
          away_team:       selectedGame.away_team,
          home_team_sr_id: selectedGame.home_team_sr_id,
          away_team_sr_id: selectedGame.away_team_sr_id,
          spread_home:     o.spread_home      ?? 0,
          total:           o.total            ?? 140,
          odds_spread:     o.spread_home_odds ?? -110,
          odds_total:      o.total_over_odds  ?? -110,
          odds_ml_home:    o.moneyline_home   ?? -150,
          odds_ml_away:    o.moneyline_away   ?? 130,
          neutral_site:    false,
          game_time:       selectedGame.commence_time,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Simulation failed')
      setPrediction(result.prediction || result)
      const { data: updated } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (updated) setProfile(updated)
    } catch (e: any) {
      setError(e.message || 'Simulation failed.')
    } finally { setSimulating(false) }
  }

  function resetForm() {
    setSelectedSport(''); setSelectedGame(null)
    setPrediction(null); setError(''); setAvailableGames([])
  }

  // ── Loading screen ──────────────────────────────────────────────────────────
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
          <h1 className="text-4xl font-bold text-white mb-2">Run Simulation</h1>
          <p className="text-gray-400">
            Pick a sport and game — we run full analytics across Spread, Total, and Moneyline, then surface the best edge.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════ RESULTS ═══ */}
        {p && (
          <div className="space-y-6">

            {/* Top header card */}
            <div className="bg-slate-800/60 backdrop-blur-xl border border-green-500/30 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <CheckCircle2 className="w-7 h-7 text-green-400 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-bold text-white">Full Analysis Complete</h2>
                  <p className="text-gray-400 text-sm">
                    {p.projected_score?.away_team} @ {p.projected_score?.home_team}
                  </p>
                </div>
              </div>

              {/* 4-stat summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Projected Score</div>
                  <div className="text-white font-bold text-sm">
                    {p.projected_score?.home_team?.split(' ').pop()} {p.projected_score?.home}
                    {' – '}
                    {p.projected_score?.away_team?.split(' ').pop()} {p.projected_score?.away}
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Best Edge</div>
                  <div className={`text-2xl font-bold ${edgeColor(p.edge_up_score ?? 0)}`}>
                    {(p.edge_up_score ?? 0).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Tier</div>
                  <div className="text-blue-300 font-bold">{p.edge_tier || '—'}</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Overall Call</div>
                  <div className={`font-bold text-lg ${p.recommendation === 'BET' ? 'text-green-400' : 'text-gray-400'}`}>
                    {p.recommendation}
                  </div>
                </div>
              </div>

              {p.headline && (
                <p className="text-blue-300 font-semibold text-sm mb-2">{p.headline}</p>
              )}
              {p.game_summary && (
                <p className="text-gray-300 text-sm leading-relaxed">{p.game_summary}</p>
              )}
            </div>

            {/* Top Pick callout */}
            {p.top_pick && (
              <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/40 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <span className="text-yellow-300 font-bold text-sm uppercase tracking-wide">
                    Top Pick — Highest Edge
                  </span>
                  <VerdictPill verdict={p.top_pick.verdict} />
                </div>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div>
                    <div className="text-white text-2xl font-bold">{p.top_pick.label}</div>
                    <div className="text-gray-400 text-sm mt-1">{p.top_pick.fair_line}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-4xl font-bold ${edgeColor(p.top_pick.edge_pct)}`}>
                      {p.top_pick.edge_pct?.toFixed(1)}%
                    </div>
                    <div className="text-gray-400 text-xs">edge score</div>
                  </div>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{p.top_pick.analysis}</p>
                {p.sizing_note && (
                  <p className="text-blue-300 text-sm mt-3 font-semibold border-t border-white/10 pt-3">
                    {p.sizing_note}
                  </p>
                )}
              </div>
            )}

            {/* Point Spread */}
            {p.spread && (
              <BetSection icon="S" label="Point Spread" colorClass="bg-purple-500/30 text-purple-300">
                <BetRow
                  {...p.spread.home}
                  highlight={p.spread.best_side === 'home' && p.spread.home.verdict !== 'PASS'}
                />
                <BetRow
                  {...p.spread.away}
                  highlight={p.spread.best_side === 'away' && p.spread.away.verdict !== 'PASS'}
                />
              </BetSection>
            )}

            {/* Over / Under */}
            {p.total && (
              <BetSection icon="T" label="Over / Under" colorClass="bg-teal-500/30 text-teal-300">
                <BetRow
                  {...p.total.over}
                  highlight={p.total.best_side === 'over' && p.total.over.verdict !== 'PASS'}
                />
                <BetRow
                  {...p.total.under}
                  highlight={p.total.best_side === 'under' && p.total.under.verdict !== 'PASS'}
                />
              </BetSection>
            )}

            {/* Moneyline */}
            {p.moneyline && (
              <BetSection icon="M" label="Moneyline" colorClass="bg-orange-500/30 text-orange-300">
                <BetRow
                  {...p.moneyline.home}
                  highlight={p.moneyline.best_side === 'home' && p.moneyline.home.verdict !== 'PASS'}
                />
                <BetRow
                  {...p.moneyline.away}
                  highlight={p.moneyline.best_side === 'away' && p.moneyline.away.verdict !== 'PASS'}
                />
              </BetSection>
            )}

            {/* Key factors */}
            {p.key_factors?.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h3 className="text-white font-bold mb-3">Key Statistical Factors</h3>
                <ul className="space-y-2">
                  {p.key_factors.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={resetForm}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition">
              Run Another Simulation
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ FORM ══════ */}
        {!p && (
          <>
            {/* Step 1 */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                <h2 className="text-2xl font-bold text-white">Select Sport</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sports.map(s => (
                  <button key={s.key}
                    onClick={() => { setSelectedSport(s.key); setSelectedGame(null); setError('') }}
                    className={`p-6 rounded-xl border-2 transition ${
                      selectedSport === s.key
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}>
                    <div className="text-4xl mb-2">{s.icon}</div>
                    <div className="text-white font-bold text-lg">{s.name}</div>
                    <div className="text-gray-400 text-sm">{s.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 */}
            {selectedSport && (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
                    <h2 className="text-2xl font-bold text-white">Select Game</h2>
                  </div>
                  {availableGames.length > 0 && (
                    <span className="text-sm text-gray-400">{availableGames.length} games available</span>
                  )}
                </div>

                {loadingGames ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="ml-3 text-gray-400">Loading live games...</span>
                  </div>
                ) : error && availableGames.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                    <p className="text-yellow-300 mb-4">{error}</p>
                    <button onClick={loadGames}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition">
                      Try Again
                    </button>
                  </div>
                ) : availableGames.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400">No upcoming {selectedSport.toUpperCase()} games at this time.</p>
                  </div>
                ) : (
                  <div className="space-y-4">

                    {/* Scrollable list */}
                    <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1">
                      {availableGames.map(game => {
                        const odds = getGameOdds(game)
                        const ml   = odds.moneyline as any
                        const sp   = odds.spread    as any
                        const tot  = odds.total     as any
                        const isSel = selectedGame?.id === game.id
                        return (
                          <button key={game.id} onClick={() => setSelectedGame(game)}
                            className={`w-full p-4 rounded-xl border-2 transition text-left ${
                              isSel ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}>
                            <div className="flex flex-col gap-2">
                              {/* Top row: team name + chevron */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-white font-semibold text-sm leading-tight">
                                    {game.away_team} @ {game.home_team}
                                  </div>
                                  <div className="text-gray-400 text-xs mt-0.5">
                                    {new Date(game.commence_time).toLocaleString([], {
                                      weekday: 'short', month: 'short', day: 'numeric',
                                      hour: '2-digit', minute: '2-digit',
                                    })}
                                  </div>
                                </div>
                                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition ${isSel ? 'rotate-180 text-blue-400' : 'text-gray-400'}`} />
                              </div>
                              {/* Bottom row: odds badges — wrap on mobile */}
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {ml  && <span className="bg-white/10 rounded px-2 py-1 text-gray-300 whitespace-nowrap">ML {ml.home} / {ml.away}</span>}
                                {sp  && <span className="bg-white/10 rounded px-2 py-1 text-gray-300 whitespace-nowrap">{sp.home}</span>}
                                {tot && <span className="bg-white/10 rounded px-2 py-1 text-gray-300 whitespace-nowrap">{tot.over}</span>}
                                {!ml && !sp && !tot && <span className="text-gray-500 italic text-xs">No odds yet</span>}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Step 3 — Run full analysis */}
                    {selectedGame && (
                      <div className="pt-6 border-t border-white/10 space-y-4">

                        {/* Confirmed game chip */}
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                          <div className="text-blue-400 text-xs font-semibold uppercase tracking-wide mb-1">Selected Game</div>
                          <div className="text-white font-bold">{selectedGame.away_team} @ {selectedGame.home_team}</div>
                          <div className="text-gray-400 text-sm">
                            {new Date(selectedGame.commence_time).toLocaleString([], {
                              weekday: 'long', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </div>
                        </div>

                        {/* 3-bet badge strip */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                          {[
                            { icon: 'S', label: 'Point Spread', sub: 'Fair spread vs market gap', cls: 'bg-purple-500/30 text-purple-300' },
                            { icon: 'T', label: 'Over / Under', sub: 'Fair total + pace impact',  cls: 'bg-teal-500/30 text-teal-300'   },
                            { icon: 'M', label: 'Moneyline',    sub: 'True win prob vs market ML', cls: 'bg-orange-500/30 text-orange-300'},
                          ].map(({ icon, label, sub, cls }) => (
                            <div key={label} className="bg-white/5 rounded-xl p-2 sm:p-3 border border-white/10 text-center">
                              <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg mx-auto mb-1.5 text-xs flex items-center justify-center font-bold ${cls}`}>
                                {icon}
                              </div>
                              <div className="text-gray-200 font-semibold text-xs">{label}</div>
                              <div className="text-gray-500 text-xs mt-0.5 hidden sm:block">{sub}</div>
                            </div>
                          ))}
                        </div>

                        {error && (
                          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            <p className="text-red-300 text-sm">{error}</p>
                          </div>
                        )}

                        <button onClick={runSimulation} disabled={simulating}
                          className="w-full py-4 sm:py-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-2xl font-bold text-lg sm:text-xl transition shadow-xl shadow-blue-500/30">
                          {simulating ? (
                            <span className="flex items-center justify-center space-x-2 sm:space-x-3">
                              <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                              <span className="text-sm sm:text-base">Analysing Spread, Total & Moneyline...</span>
                            </span>
                          ) : (
                            <span className="flex items-center justify-center space-x-2 sm:space-x-3">
                              <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
                              <span>Run Full Analysis</span>
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}