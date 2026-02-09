'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import { isLegalState, getLegalStates } from '@/lib/legal/state-validator'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    state: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    preferredSports: ['nfl', 'nba', 'ncaab', 'ncaaf']
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      setError(`Sorry, Edge Up Sim is only available in states where sports betting is legal. 
                Your state (${formData.state}) is not currently supported.`)
      setLoading(false)
      return
    }

    // Validate age (checkbox required)
    const ageCheckbox = document.getElementById('age-verify') as HTMLInputElement
    if (!ageCheckbox?.checked) {
      setError('You must be 18+ to use this service')
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

      // Create profile
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: formData.email,
            full_name: formData.fullName,
            verified_state: formData.state,
            reset_timezone: formData.timezone,
            preferred_sports: formData.preferredSports,
            subscription_status: 'none'  // Will be updated after Stripe checkout
          })

        if (profileError) throw profileError
      }

      // Redirect to pricing page to start trial
      router.push('/pricing?trial=true')

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Start your 3-day free trial
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>

            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                State
              </label>
              <select
                id="state"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              >
                <option value="">Select your state</option>
                {getLegalStates().map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Only available in states where sports betting is legal
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sports Preferences (select all that interest you)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'nfl', label: 'NFL' },
                  { key: 'nba', label: 'NBA' },
                  { key: 'ncaaf', label: 'NCAA Football' },
                  { key: 'ncaab', label: 'NCAA Basketball' },
                  { key: 'mlb', label: 'MLB' },
                  { key: 'nhl', label: 'NHL' }
                ].map(sport => (
                  <label key={sport.key} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.preferredSports.includes(sport.key)}
                      onChange={() => handleSportToggle(sport.key)}
                      className="rounded border-gray-300"
                    />
                    <span className="ml-2 text-sm">{sport.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-start">
              <input
                id="age-verify"
                type="checkbox"
                required
                className="h-4 w-4 rounded border-gray-300 text-blue-600 mt-1"
              />
              <label htmlFor="age-verify" className="ml-2 text-sm text-gray-600">
                I am 18 years of age or older and agree to the{' '}
                <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Creating account...' : 'Start 3-Day Free Trial'}
          </button>
        </form>
      </div>
    </div>
  )
}