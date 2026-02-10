'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [formData, setFormData] = useState({
    full_name: '',
    preferred_sports: [] as string[]
  })

  const sports = [
    { key: 'nfl', label: 'NFL' },
    { key: 'nba', label: 'NBA' },
    { key: 'ncaaf', label: 'NCAA Football' },
    { key: 'ncaab', label: 'NCAA Basketball' },
    { key: 'mlb', label: 'MLB' },
    { key: 'nhl', label: 'NHL' }
  ]

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
  }

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data)
      setFormData({
        full_name: data.full_name || '',
        preferred_sports: data.preferred_sports || []
      })
    }

    setLoading(false)
  }

  function toggleSport(sportKey: string) {
    setFormData(prev => ({
      ...prev,
      preferred_sports: prev.preferred_sports.includes(sportKey)
        ? prev.preferred_sports.filter(s => s !== sportKey)
        : [...prev.preferred_sports, sportKey]
    }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          preferred_sports: formData.preferred_sports
        })
        .eq('id', user.id)

      if (error) throw error

      setMessage('Profile updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error: any) {
      setMessage('Error: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
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
            <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('Error')
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}>
            {message}
          </div>
        )}

        {/* Account Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Account Information</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={user?.email}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <input
                type="text"
                value={profile?.verified_state}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">Location cannot be changed</p>
            </div>
          </div>
        </div>

        {/* Sport Preferences */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Sport Preferences</h2>
          <p className="text-sm text-gray-600 mb-4">
            Select sports you're interested in. Your hot picks will be personalized based on these preferences.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {sports.map((sport) => (
              <label key={sport.key} className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={formData.preferred_sports.includes(sport.key)}
                  onChange={() => toggleSport(sport.key)}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-3 font-medium">{sport.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Subscription</h2>
          
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="font-semibold">
                {profile?.subscription_tier === 'edge_starter' && 'Edge Starter'}
                {profile?.subscription_tier === 'edge_pro' && 'Edge Pro'}
                {profile?.subscription_tier === 'edge_elite' && 'Edge Elite'}
              </p>
              <p className="text-sm text-gray-600">
                Status: <span className="font-medium">{profile?.subscription_status}</span>
              </p>
              {profile?.subscription_status === 'trialing' && profile?.trial_ends_at && (
                <p className="text-sm text-gray-600">
                  Trial ends: {new Date(profile.trial_ends_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={() => router.push('/pricing')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Change Plan
            </button>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-600 mb-2">Usage this month:</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Daily Simulations</p>
                <p className="text-lg font-bold">{profile?.daily_simulation_count}/{profile?.daily_simulation_limit}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Monthly Total</p>
                <p className="text-lg font-bold">{profile?.monthly_simulation_count}</p>
              </div>
            </div>
            {profile?.monthly_simulation_rollover > 0 && (
              <p className="text-sm text-green-600 mt-2">
                +{profile.monthly_simulation_rollover} rollover simulations available
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleSignOut}
            className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200"
          >
            Sign Out
          </button>
        </div>
      </main>
    </div>
  )
}