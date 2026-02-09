'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/database/supabase-client'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const router = useRouter()
  const supabase = createBrowserClient()

  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'predictions' | 'codes' | 'analytics'>('users')
  const [users, setUsers] = useState<any[]>([])
  const [predictions, setPredictions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login')
      return
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', session.user.id)
      .single()

    if (profile?.subscription_tier !== 'admin') {
      router.push('/dashboard')
      return
    }

    setUser(session.user)
    await loadData()
  }

  async function loadData() {
    setLoading(true)

    // Load users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (usersData) setUsers(usersData)

    // Load predictions needing review
    const { data: predictionsData } = await supabase
      .from('ai_predictions')
      .select(`
        *,
        event:sports_events (
          home_team,
          away_team,
          sport_title
        )
      `)
      .eq('was_correct', false)
      .eq('admin_marked_bad', false)
      .gte('confidence_score', 75)
      .order('created_at', { ascending: false })
      .limit(50)

    if (predictionsData) setPredictions(predictionsData)

    setLoading(false)
  }

  async function banUser(userId: string) {
    if (!confirm('Are you sure you want to ban this user? This will cancel their subscription.')) {
      return
    }

    try {
      // Update user status
      await supabase
        .from('profiles')
        .update({
          subscription_status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      // Log action
      await supabase
        .from('admin_logs')
        .insert({
          admin_id: user.id,
          action: 'ban_user',
          target_type: 'user',
          target_id: userId,
          details: { reason: 'Manual ban by admin' }
        })

      alert('User banned successfully')
      await loadData()
    } catch (error) {
      console.error('Error banning user:', error)
      alert('Error banning user')
    }
  }

  async function markPredictionBad(predictionId: string) {
    const reason = prompt('Why was this prediction bad?')
    if (!reason) return

    try {
      await supabase
        .from('ai_predictions')
        .update({
          admin_marked_bad: true,
          admin_reason: reason,
          admin_marked_by: user.id,
          admin_marked_at: new Date().toISOString()
        })
        .eq('id', predictionId)

      // Log action
      await supabase
        .from('admin_logs')
        .insert({
          admin_id: user.id,
          action: 'mark_prediction_bad',
          target_type: 'prediction',
          target_id: predictionId,
          details: { reason }
        })

      alert('Prediction marked for learning')
      await loadData()
    } catch (error) {
      console.error('Error marking prediction:', error)
      alert('Error marking prediction')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {['users', 'predictions', 'codes', 'analytics'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {activeTab === 'users' && (
            <div>
              <h2 className="text-xl font-bold mb-4">User Management</h2>
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Tier
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        State
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{u.full_name}</div>
                            <div className="text-sm text-gray-500">{u.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {u.subscription_tier}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            u.subscription_status === 'active' ? 'bg-green-100 text-green-800' :
                            u.subscription_status === 'trialing' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {u.subscription_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {u.verified_state}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => banUser(u.id)}
                            className="text-red-600 hover:text-red-900 mr-4"
                          >
                            Ban
                          </button>
                          <button
                            onClick={() => router.push(`/admin/users/${u.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'predictions' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Predictions Needing Review</h2>
              <p className="text-sm text-gray-600 mb-4">
                High-confidence predictions (≥75%) that were incorrect
              </p>
              <div className="space-y-4">
                {predictions.map((pred) => (
                  <div key={pred.id} className="bg-white shadow rounded-lg p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-lg">
                          {pred.event?.away_team} @ {pred.event?.home_team}
                        </p>
                        <p className="text-sm text-gray-600">{pred.event?.sport_title}</p>
                        <div className="mt-2">
                          <span className="text-sm font-medium">Confidence: {pred.confidence_score}%</span>
                          <span className="mx-2">|</span>
                          <span className="text-sm font-medium">Edge: +{pred.edge_score.toFixed(1)}%</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          <strong>Prediction:</strong> {pred.recommended_line}
                        </p>
                      </div>
                      <button
                        onClick={() => markPredictionBad(pred.id)}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                      >
                        Mark as Bad
                      </button>
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-1">Key Factors:</p>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {pred.key_factors?.map((factor: string, idx: number) => (
                          <li key={idx}>{factor}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
                {predictions.length === 0 && (
                  <p className="text-gray-600 text-center py-8">
                    No predictions need review
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'codes' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Promo & Invite Codes</h2>
              <div className="bg-white shadow rounded-lg p-6">
                <p className="text-gray-600">
                  Promo code management coming soon...
                </p>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Analytics</h2>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="bg-white shadow rounded-lg p-6">
                  <p className="text-sm text-gray-600">Total Users</p>
                  <p className="text-3xl font-bold">{users.length}</p>
                </div>
                <div className="bg-white shadow rounded-lg p-6">
                  <p className="text-sm text-gray-600">Active Subscriptions</p>
                  <p className="text-3xl font-bold">
                    {users.filter(u => u.subscription_status === 'active').length}
                  </p>
                </div>
                <div className="bg-white shadow rounded-lg p-6">
                  <p className="text-sm text-gray-600">In Trial</p>
                  <p className="text-3xl font-bold">
                    {users.filter(u => u.subscription_status === 'trialing').length}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}