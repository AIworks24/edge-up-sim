'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import { isLegalState, getLegalStates } from '@/lib/legal/state-validator'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    state: '',
    timezone: typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York',
    preferredSports: ['nfl', 'nba', 'ncaab', 'ncaaf']
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ageVerified, setAgeVerified] = useState(false)

  const handleSportToggle = (sport: string) => {
    setFormData(prev => ({
      ...prev,
      preferredSports: prev.preferredSports.includes(sport)
        ? prev.preferredSports.filter(s => s !== sport)
        : [...prev.preferredSports, sport]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate location
    if (!isLegalState(formData.state)) {
      setError(`Sorry, Edge Up Sim is only available in states where sports betting is legal. Your state (${formData.state}) is not currently supported.`)
      setLoading(false)
      return
    }

    // Validate age
    if (!ageVerified) {
      setError('You must be 18+ to use this service')
      setLoading(false)
      return
    }

    // Validate sports selection
    if (formData.preferredSports.length === 0) {
      setError('Please select at least one sport')
      setLoading(false)
      return
    }

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName
          }
        }
      })

      if (authError) throw authError

      // Wait a moment for the user to be created
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Create profile using service role (bypass RLS)
      if (authData.user) {
        const response = await fetch('/api/auth/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: authData.user.id,
            email: formData.email,
            fullName: formData.fullName,
            state: formData.state,
            timezone: formData.timezone,
            preferredSports: formData.preferredSports
          })
        })

        const result = await response.json()

        if (!response.ok) {
          console.error('Profile creation failed:', result)
          throw new Error(result.error || result.details || 'Failed to create profile')
        }
      }

      // Redirect to pricing page to start trial
      router.push('/pricing?trial=true')

    } catch (err: any) {
      console.error('Registration error:', err)
      setError(err.message || 'An error occurred during registration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Edge Up Sim
            </div>
          </Link>
          <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
            Create your account
          </h1>
          <p className="text-lg text-gray-600">
            Start your 3-day free trial
          </p>
        </div>

        {/* Registration Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm text-red-800 font-medium">{error}</p>
              </div>
            )}

            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-semibold text-gray-900 mb-2">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition text-gray-900 bg-white placeholder-gray-400"
                placeholder="Full Name"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition text-gray-900 bg-white placeholder-gray-400"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-900 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition text-gray-900 bg-white placeholder-gray-400"
                placeholder="••••••••"
              />
              <p className="mt-1 text-sm text-gray-500">Must be at least 8 characters</p>
            </div>

            {/* State */}
            <div>
              <label htmlFor="state" className="block text-sm font-semibold text-gray-900 mb-2">
                State
              </label>
              <select
                id="state"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition text-gray-900 bg-white"
              >
                <option value="">Select your state</option>
                {getLegalStates().map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Only available in states where sports betting is legal
              </p>
            </div>

            {/* Sport Preferences */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Sports Preferences (select all that interest you)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'nfl', label: 'NFL', icon: '🏈' },
                  { key: 'nba', label: 'NBA', icon: '🏀' },
                  { key: 'ncaaf', label: 'NCAA Football', icon: '🏈' },
                  { key: 'ncaab', label: 'NCAA Basketball', icon: '🏀' },
                  { key: 'mlb', label: 'MLB', icon: '⚾' },
                  { key: 'nhl', label: 'NHL', icon: '🏒' }
                ].map(sport => (
                  <label 
                    key={sport.key} 
                    className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition ${
                      formData.preferredSports.includes(sport.key)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.preferredSports.includes(sport.key)}
                      onChange={() => handleSportToggle(sport.key)}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-lg">{sport.icon}</span>
                    <span className="ml-2 font-medium text-gray-900">{sport.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Age Verification */}
            <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageVerified}
                  onChange={(e) => setAgeVerified(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span className="ml-3 text-sm text-gray-900">
                  I am 18 years of age or older and agree to the{' '}
                  <Link href="/terms" className="text-blue-600 hover:underline font-medium">
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link href="/privacy" className="text-blue-600 hover:underline font-medium">
                    Privacy Policy
                  </Link>
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-lg rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Start 3-Day Free Trial'
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="text-blue-600 hover:underline font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 mb-2">✓ No charges for 3 days</p>
          <p className="text-sm text-gray-500">✓ Cancel anytime during trial</p>
        </div>
      </div>
    </div>
  )
}