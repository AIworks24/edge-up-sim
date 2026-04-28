'use client'
// src/app/dashboard/page.tsx
//
// CHANGES (layout preserved, two targeted fixes):
//   1. loadDashboard() now fetches /api/metrics and populates the 4 stat cards
//      (previously they were hardcoded to zero and never updated)
//   2. MetricsBar component is now rendered directly above the Hot Picks section
//      (it was built but never placed in this file)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import { 
  TrendingUp, 
  Target, 
  Zap, 
  BarChart3, 
  Calendar,
  ChevronRight,
  Sparkles,
  Trophy,
  Clock,
  DollarSign,
  Percent,
  Info,
  ArrowRight,
  Star
} from 'lucide-react'
import { MetricsBar } from '@/components/dashboard/MetricsBar'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [hotPicks, setHotPicks] = useState<any[]>([])
  const [stats, setStats] = useState({
    winRate: 0,
    totalPicks: 0,
    roi: 0,
    edgeScore: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
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

      // FIX: Fetch real metrics to populate the 4 stat cards.
      // Previously these were never fetched — cards always showed 0.
      await Promise.all([
        loadHotPicks(),
        loadMetrics(),
      ])

      setLoading(false)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
    }
  }

  const loadHotPicks = async () => {
    try {
      const res = await fetch('/api/predictions/hot-picks')
      if (!res.ok) return
      const data = await res.json()
      setHotPicks(data.picks ?? [])
    } catch (err) {
      console.error('Hot picks fetch failed:', err)
    }
  }

  // FIX: New function — pulls win rate, total picks, avg edge from /api/metrics
  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/metrics?scope=all')
      if (!res.ok) return
      const data = await res.json()

      setStats({
        winRate:    data.win_rate       ?? 0,
        totalPicks: data.resolved       ?? 0,
        roi:        data.roi            ?? 0,
        edgeScore:  data.avg_edge_score ?? 0,
      })
    } catch (err) {
      console.error('Metrics fetch failed:', err)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const tierInfo = {
    edge_starter: { name: 'Edge Starter', color: 'from-blue-500 to-cyan-500', simLimit: 3 },
    edge_pro: { name: 'Edge Pro', color: 'from-purple-500 to-pink-500', simLimit: 10 },
    edge_elite: { name: 'Edge Elite', color: 'from-amber-500 to-orange-500', simLimit: 50 }
  }

  const currentTier = tierInfo[profile?.subscription_tier as keyof typeof tierInfo] || tierInfo.edge_starter

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Modern Header */}
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/dashboard" className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/50">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-black text-white">Edge Up Sim</span>
              </Link>
              <nav className="hidden md:flex items-center space-x-1">
                {[
                  { href: '/dashboard', label: 'Dashboard', active: true },
                  { href: '/simulate',  label: 'Simulate',  active: false },
                  { href: '/history',   label: 'History',   active: false },
                  { href: '/settings',  label: 'Settings',  active: false },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      item.active
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
             </nav>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:block text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Welcome back</div>
                <div className="text-white font-semibold">{profile?.full_name || user?.email?.split('@')[0]}</div>
              </div>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
          {/* Mobile bottom nav bar */}
          <div className="md:hidden border-t border-white/10 flex">
            {[
              { href: '/dashboard', label: 'Dashboard', active: true  },
              { href: '/simulate',  label: 'Simulate',  active: false },
              { href: '/history',   label: 'History',   active: false },
              { href: '/settings',  label: 'Settings',  active: false },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 py-2 text-center text-xs font-medium transition ${
                  item.active ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Hero Tier Card */}
        <div className={`relative overflow-hidden bg-gradient-to-r ${currentTier.color} rounded-3xl p-5 sm:p-8 shadow-2xl`}>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between">
            <div className="mb-6 md:mb-0">
              <div className="flex items-center space-x-2 mb-3">
                <Trophy className="w-6 h-6 text-white" />
                <span className="text-sm font-bold uppercase tracking-wider text-white/90">Your Plan</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-2">{currentTier.name}</h2>
              <div className="flex items-center space-x-4 text-white/90">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  <span className="font-semibold">{profile?.subscription_status === 'trialing' ? 'Free Trial' : 'Active'}</span>
                </div>
                <div className="h-4 w-px bg-white/30"></div>
                <span className="font-medium">
                  {profile?.daily_simulation_count || 0} / {currentTier.simLimit} sims today
                </span>
              </div>
            </div>
            <Link
              href="/pricing"
              className="group px-8 py-4 bg-white hover:bg-white/90 text-gray-900 rounded-xl font-bold text-lg transition shadow-xl flex items-center space-x-2"
            >
              <Star className="w-5 h-5" />
              <span>Upgrade</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
            </Link>
          </div>
        </div>

        {/* Performance Stats — now wired to /api/metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {[
            { 
              icon: TrendingUp, 
              label: 'Win Rate', 
              value: stats.winRate > 0 ? `${stats.winRate}%` : '—', 
              subtitle: 'Resolved picks',
              color: 'from-green-500 to-emerald-500',
              bgColor: 'bg-green-500/10',
              iconColor: 'text-green-400'
            },
            { 
              icon: Target, 
              label: 'Total Picks', 
              value: stats.totalPicks.toString(), 
              subtitle: 'All time',
              color: 'from-blue-500 to-cyan-500',
              bgColor: 'bg-blue-500/10',
              iconColor: 'text-blue-400'
            },
            { 
              icon: DollarSign, 
              label: 'ROI', 
              value: stats.roi !== 0 ? `${stats.roi > 0 ? '+' : ''}${stats.roi}%` : '—', 
              subtitle: 'Theoretical at -110',
              color: 'from-purple-500 to-pink-500',
              bgColor: 'bg-purple-500/10',
              iconColor: 'text-purple-400'
            },
            { 
              icon: Percent, 
              label: 'Avg Edge', 
              value: stats.edgeScore > 0 ? `+${stats.edgeScore}%` : '—', 
              subtitle: 'Expected value',
              color: 'from-amber-500 to-orange-500',
              bgColor: 'bg-amber-500/10',
              iconColor: 'text-amber-400'
            }
          ].map((stat, index) => (
            <div key={index} className="group bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-slate-800/70 hover:border-white/20 transition">
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 ${stat.bgColor} rounded-xl`}>
                  <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-white">{stat.value}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">{stat.subtitle}</div>
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Hot Picks Section */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl shadow-lg shadow-orange-500/50">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-white">Today's Hot Picks</h2>
                <p className="text-gray-400">AI-powered predictions based on your sport preferences</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-2 px-4 py-2 bg-slate-700/50 rounded-lg">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Updated daily at 6am</span>
            </div>
          </div>

          {/* FIX: MetricsBar placed here — above the picks grid, inside the Hot Picks card */}
          <div className="mb-8">
            <MetricsBar />
          </div>

          {hotPicks.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-24 h-24 bg-gradient-to-br from-slate-700 to-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                <Calendar className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">No hot picks available yet</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
                Hot picks are generated daily based on upcoming games in your preferred sports. 
                Check back soon or run a custom simulation!
              </p>
              <Link
                href="/simulate"
                className="inline-flex items-center space-x-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-bold text-lg transition shadow-xl shadow-blue-500/50 group"
              >
                <Zap className="w-6 h-6" />
                <span>Run Custom Simulation</span>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {hotPicks.map((pick: any, index: number) => {
                const fr = pick.full_response
                const tp = fr?.top_pick ?? pick.recommended_line?.top_pick
                const isBet = (fr?.recommendation === 'BET') || pick.edge_score >= 20
                const tierColors: Record<string, string> = {
                  EXCEPTIONAL: 'text-emerald-300',
                  STRONG:      'text-green-300',
                  MODERATE:    'text-yellow-300',
                  RISKY:       'text-orange-300',
                  NO_VALUE:    'text-gray-400',
                }
                const edgeColor = tierColors[pick.edge_tier] ?? 'text-gray-300'
                const projHome = pick.projected_home_score != null ? Number(pick.projected_home_score).toFixed(0) : '—'
                const projAway = pick.projected_away_score != null ? Number(pick.projected_away_score).toFixed(0) : '—'

                return (
                  <div key={pick.id ?? index} className={`bg-slate-700/30 border rounded-2xl p-6 hover:bg-slate-700/50 hover:border-white/10 transition flex flex-col gap-3 ${
                    isBet ? 'border-green-500/30' : 'border-white/5'
                  }`}>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">{pick.away_team} @</p>
                      <p className="text-lg font-black text-white leading-tight">{pick.home_team}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={`text-2xl font-black ${edgeColor}`}>
                        {pick.edge_score?.toFixed(1)}%
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        isBet
                          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                          : 'bg-slate-600/50 text-gray-400'
                      }`}>
                        {pick.edge_tier ?? 'N/A'}
                      </span>
                    </div>

                    {pick.confidence_score != null && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                            style={{ width: `${Math.min(pick.confidence_score, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{pick.confidence_score.toFixed(0)}% conf</span>
                      </div>
                    )}

                   {(tp?.label || pick.recommended_bet_type) && (
                                        <div className="bg-slate-800/60 rounded-xl px-3 py-2">
                                          <p className="text-xs text-gray-500 mb-0.5">
                                            {tp?.bet_category?.toUpperCase() ?? pick.recommended_bet_type?.toUpperCase() ?? 'Best Bet'}
                                          </p>
                                          <p className="text-sm font-bold text-white">
                                            {tp?.verdict === 'BET' ? '✅ ' : tp?.verdict === 'LEAN' ? '⚡ ' : ''}{tp?.label ?? pick.recommended_bet_type}
                                          </p>
                                          {tp?.fair_line && (
                                            <p className="text-xs text-blue-300/80 mt-1">{tp.fair_line}</p>
                                          )}
                                        </div>
                                      )}
                    <div className="flex justify-between text-xs text-gray-500 pt-1">
                      <span>{pick.sport?.toUpperCase()}</span>
                      <span>Proj: {projHome} – {projAway}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/simulate"
            className="group relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 hover:from-blue-500 hover:via-blue-600 hover:to-blue-700 rounded-2xl p-5 sm:p-8 text-white transition shadow-2xl shadow-blue-500/50"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-white/20 transition"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                  <Zap className="w-10 h-10" />
                </div>
                <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Run Simulation</h3>
              <p className="text-blue-100">Analyze any upcoming game with AI-powered predictions</p>
            </div>
          </Link>

          <Link
            href="/history"
            className="group relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 hover:from-purple-500 hover:via-purple-600 hover:to-purple-700 rounded-2xl p-8 text-white transition shadow-2xl shadow-purple-500/50"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-white/20 transition"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                  <BarChart3 className="w-10 h-10" />
                </div>
                <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Prediction History</h3>
              <p className="text-purple-100">View past picks and track your performance over time</p>
            </div>
          </Link>

          <Link
            href="/settings"
            className="group relative overflow-hidden bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 hover:from-slate-500 hover:via-slate-600 hover:to-slate-700 rounded-2xl p-8 text-white transition shadow-2xl shadow-slate-500/50"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-white/20 transition"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                  <Info className="w-10 h-10" />
                </div>
                <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Account Settings</h3>
              <p className="text-slate-300">Manage subscription and preferences</p>
            </div>
          </Link>
        </div>

      </main>
    </div>
  )
}