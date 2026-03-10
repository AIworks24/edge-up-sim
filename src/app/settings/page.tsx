'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import {
  User, CreditCard, Bell, Shield, LogOut,
  Save, ChevronRight, Zap, AlertTriangle,
  Check, RefreshCw
} from 'lucide-react'

const SPORTS = [
  { key: 'nfl', label: 'NFL Football' },
  { key: 'nba', label: 'NBA Basketball' },
  { key: 'ncaab', label: 'NCAA Basketball' },
  { key: 'ncaaf', label: 'NCAA Football' },
  { key: 'mlb', label: 'MLB Baseball' },
  { key: 'nhl', label: 'NHL Hockey' }
]

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' }
]

type Tab = 'profile' | 'subscription' | 'preferences' | 'security'

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  // Form state
  const [fullName, setFullName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [preferredSports, setPreferredSports] = useState<string[]>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
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

    if (profileData) {
      setProfile(profileData)
      setFullName(profileData.full_name || '')
      setTimezone(profileData.reset_timezone || 'America/New_York')
      setPreferredSports(profileData.preferred_sports || [])
    }
    setLoading(false)
  }

  function toggleSport(sportKey: string) {
    setPreferredSports(prev =>
      prev.includes(sportKey) ? prev.filter(s => s !== sportKey) : [...prev, sportKey]
    )
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function saveProfile() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)
      if (error) throw error
      showMessage('success', 'Profile updated successfully!')
    } catch (err: any) {
      showMessage('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  async function savePreferences() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_sports: preferredSports, reset_timezone: timezone })
        .eq('id', user.id)
      if (error) throw error
      showMessage('success', 'Preferences saved!')
    } catch (err: any) {
      showMessage('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      showMessage('error', 'New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      showMessage('error', 'Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showMessage('success', 'Password updated successfully!')
    } catch (err: any) {
      showMessage('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  async function openStripePortal() {
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        }
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('Could not open billing portal')
      }
    } catch (err: any) {
      showMessage('error', err.message)
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const tierLabels: Record<string, { name: string; color: string }> = {
    edge_starter: { name: 'Edge Starter', color: 'from-blue-500 to-cyan-500' },
    edge_pro: { name: 'Edge Pro', color: 'from-purple-500 to-pink-500' },
    edge_elite: { name: 'Edge Elite', color: 'from-amber-500 to-orange-500' }
  }
  const currentTier = tierLabels[profile?.subscription_tier] || tierLabels.edge_starter

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'preferences', label: 'Preferences', icon: Bell },
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
    { id: 'security', label: 'Security', icon: Shield }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/dashboard" className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Edge Up Sim</span>
              </Link>
              <nav className="hidden md:flex items-center space-x-1">
                {[
                  { href: '/dashboard', label: 'Dashboard' },
                  { href: '/simulate', label: 'Simulate' },
                  { href: '/history', label: 'History' },
                  { href: '/settings', label: 'Settings' }
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      item.href === '/settings'
                        ? 'text-white bg-white/10'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-5xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Account Settings</h1>
          <p className="text-gray-400 mt-1">Manage your profile, preferences, and subscription</p>
        </div>

        {/* Toast Message */}
        {message && (
          <div className={`mb-6 flex items-center gap-3 p-4 rounded-xl ${
            message.type === 'success'
              ? 'bg-green-500/20 border border-green-500/30 text-green-300'
              : 'bg-red-500/20 border border-red-500/30 text-red-300'
          }`}>
            {message.type === 'success' ? <Check className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar Nav */}
          <div className="md:col-span-1">
            <nav className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex md:flex-col overflow-x-auto">
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-shrink-0 md:flex-shrink flex items-center gap-3 px-3 md:px-4 py-3 md:py-3.5 text-sm font-medium transition ${
                      activeTab === tab.id
                        ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-500'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                )
              })}
              <div className="border-t border-white/10">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </nav>
          </div>

          {/* Main Panel */}
          <div className="md:col-span-3 space-y-6">

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">Profile Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:border-blue-500 placeholder-gray-500"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 text-gray-500 rounded-xl cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed. Contact support if needed.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">State</label>
                    <input
                      type="text"
                      value={profile?.verified_state || ''}
                      disabled
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 text-gray-500 rounded-xl cursor-not-allowed"
                    />
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <h2 className="text-xl font-bold text-white mb-2">Sport Preferences</h2>
                  <p className="text-gray-400 text-sm mb-5">Your hot picks will be personalized to these sports.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {SPORTS.map(sport => (
                      <label
                        key={sport.key}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                          preferredSports.includes(sport.key)
                            ? 'bg-blue-600/20 border-blue-500/50 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={preferredSports.includes(sport.key)}
                          onChange={() => toggleSport(sport.key)}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          preferredSports.includes(sport.key) ? 'bg-blue-600 border-blue-600' : 'border-gray-500'
                        }`}>
                          {preferredSports.includes(sport.key) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium">{sport.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <h2 className="text-xl font-bold text-white mb-2">Timezone</h2>
                  <p className="text-gray-400 text-sm mb-4">Used to reset your daily simulation count at midnight.</p>
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:border-blue-500"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value} className="bg-slate-800">{tz.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={savePreferences}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Preferences
                </button>
              </div>
            )}

            {/* Subscription Tab */}
            {activeTab === 'subscription' && (
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <h2 className="text-xl font-bold text-white mb-5">Current Plan</h2>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg bg-gradient-to-br ${currentTier.color}`}>
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-white font-bold">{currentTier.name}</p>
                        <p className="text-gray-400 text-sm capitalize">{profile?.subscription_status || 'No active subscription'}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      profile?.subscription_status === 'active' ? 'bg-green-500/20 text-green-400' :
                      profile?.subscription_status === 'trialing' ? 'bg-blue-500/20 text-blue-400' :
                      profile?.subscription_status === 'past_due' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {profile?.subscription_status || 'inactive'}
                    </span>
                  </div>

                  {profile?.subscription_status === 'trialing' && profile?.trial_ends_at && (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-4">
                      <p className="text-blue-300 text-sm font-medium">
                        🕐 Trial ends {new Date(profile.trial_ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-blue-400 text-xs mt-1">Your card will be charged when the trial ends unless you cancel.</p>
                    </div>
                  )}

                  {profile?.stripe_customer_id ? (
                    <button
                      onClick={openStripePortal}
                      disabled={portalLoading}
                      className="flex items-center gap-2 w-full justify-center py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50"
                    >
                      {portalLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                      Manage Billing & Subscription
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/pricing')}
                      className="flex items-center gap-2 w-full justify-center py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
                    >
                      <CreditCard className="w-4 h-4" />
                      Choose a Plan
                    </button>
                  )}

                  <p className="text-gray-500 text-xs text-center mt-3">
                    Billing is managed securely via Stripe. You can upgrade, downgrade, or cancel at any time.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-white mb-3">Want to upgrade?</h3>
                  <button
                    onClick={() => router.push('/pricing')}
                    className="flex items-center gap-2 px-4 py-2 border border-white/20 text-gray-300 hover:text-white hover:border-white/40 rounded-xl text-sm transition"
                  >
                    View all plans <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <h2 className="text-xl font-bold text-white mb-5">Change Password</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:border-blue-500"
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:border-blue-500"
                        placeholder="••••••••"
                      />
                    </div>
                    <button
                      onClick={changePassword}
                      disabled={saving || !newPassword}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-50"
                    >
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                      Update Password
                    </button>
                  </div>
                </div>

                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-red-300 font-bold mb-1">Danger Zone</h3>
                      <p className="text-red-400/80 text-sm mb-4">
                        These actions are permanent and cannot be undone.
                      </p>
                      <button
                        onClick={handleSignOut}
                        className="px-4 py-2 border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded-lg text-sm font-medium transition"
                      >
                        Sign Out of All Devices
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  )
}