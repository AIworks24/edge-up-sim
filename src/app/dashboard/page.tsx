'use client'

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
      setHotPicks([]) // Will be populated when sports data is available
      setLoading(false)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
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
                <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Edge Up Sim
                </span>
              </Link>
              
              <nav className="hidden md:flex items-center space-x-1">
                <Link 
                  href="/dashboard" 
                  className="px-4 py-2 text-white font-medium bg-white/10 rounded-lg"
                >
                  Dashboard
                </Link>
                <Link 
                  href="/simulate" 
                  className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition"
                >
                  Simulate
                </Link>
                <Link 
                  href="/history" 
                  className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition"
                >
                  History
                </Link>
                <Link 
                  href="/settings" 
                  className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition"
                >
                  Settings
                </Link>
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden md:block text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Welcome back</div>
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Tier Card */}
        <div className={`relative overflow-hidden bg-gradient-to-r ${currentTier.color} rounded-3xl p-8 shadow-2xl`}>
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

        {/* Performance Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { 
              icon: TrendingUp, 
              label: 'Win Rate', 
              value: `${stats.winRate}%`, 
              subtitle: 'Last 30 days',
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
              value: `+${stats.roi}%`, 
              subtitle: 'Profit margin',
              color: 'from-purple-500 to-pink-500',
              bgColor: 'bg-purple-500/10',
              iconColor: 'text-purple-400'
            },
            { 
              icon: Percent, 
              label: 'Avg Edge', 
              value: `+${stats.edgeScore}%`, 
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
        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
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
              <span className="text-sm text-gray-400">Updated 5min ago</span>
            </div>
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
              {hotPicks.map((pick, index) => (
                <div key={index} className="bg-slate-700/30 border border-white/5 rounded-2xl p-6 hover:bg-slate-700/50 hover:border-white/10 transition">
                  {/* Pick details would go here */}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/simulate"
            className="group relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 hover:from-blue-500 hover:via-blue-600 hover:to-blue-700 rounded-2xl p-8 text-white transition shadow-2xl shadow-blue-500/50"
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
            className="group relative overflow-hidden bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 hover:from-slate-600 hover:via-slate-700 hover:to-slate-800 rounded-2xl p-8 text-white transition shadow-2xl"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-white/20 transition"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-sm">
                  <Target className="w-10 h-10" />
                </div>
                <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Account Settings</h3>
              <p className="text-gray-300">Manage your account and sport preferences</p>
            </div>
          </Link>
        </div>

        {/* Info Banner */}
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-blue-500/20 rounded-xl flex-shrink-0">
              <Info className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-2">How Edge Up Sim Works</h3>
              <p className="text-gray-300 leading-relaxed">
                Our AI analyzes team statistics, injuries, weather conditions, betting trends, and more to generate 
                predictions with confidence scores and edge calculations. Only recommendations above 65% confidence 
                with positive expected value are shown, ensuring you get the highest quality picks.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}