'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'
import { Zap, Check, AlertCircle, CreditCard } from 'lucide-react'

// ─── Inner component that uses useSearchParams ───────────────────────────────
function PricingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isTrialFlow = searchParams.get('trial') === 'true'
  const wasCanceled = searchParams.get('canceled') === 'true'

  const [loading, setLoading] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoValid, setPromoValid] = useState<boolean | null>(null)
  const [promoMessage, setPromoMessage] = useState('')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      setUser(session.user)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(profileData)
    }
  }

  async function handleSelectPlan(tier: 'starter' | 'pro' | 'elite') {
    if (!user) {
      router.push('/register')
      return
    }
    setLoading(tier)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          tier,
          billingCycle,
          promoCode: promoValid ? promoCode : undefined
        })
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (error: any) {
      alert('Error creating checkout: ' + error.message)
      setLoading(null)
    }
  }

  async function validatePromoCode() {
    if (!promoCode) return
    try {
      const response = await fetch('/api/stripe/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode })
      })
      const data = await response.json()
      setPromoValid(data.valid)
      setPromoMessage(data.message || data.discount || '')
    } catch {
      setPromoValid(false)
      setPromoMessage('Error validating code')
    }
  }

  const plans = [
    {
      id: 'starter' as const,
      name: 'Edge Starter',
      monthlyPrice: 29,
      annualPrice: 23,
      description: 'Perfect for casual bettors',
      features: [
        '3 personalized hot picks daily',
        '3 custom simulations daily',
        'Moneyline, Spread, Totals',
        'All major sports (NFL, NBA, NCAA, MLB, NHL)',
        'Basic performance analytics',
        'Edge score calculations'
      ],
      popular: false,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      id: 'pro' as const,
      name: 'Edge Pro',
      monthlyPrice: 99,
      annualPrice: 79,
      description: 'For serious bettors',
      features: [
        '3 personalized hot picks daily',
        '10 custom simulations daily',
        'Player Props included',
        'All major sports',
        'Advanced analytics dashboard',
        'Edge score & ROI tracking',
        'Historical performance data'
      ],
      popular: true,
      color: 'from-purple-500 to-pink-500'
    },
    {
      id: 'elite' as const,
      name: 'Edge Elite',
      monthlyPrice: 249,
      annualPrice: 199,
      description: 'Maximum edge, unlimited power',
      features: [
        '3 personalized hot picks daily',
        '50 custom simulations daily',
        'All bet types included',
        'All major sports',
        'Premium analytics suite',
        'Priority AI recommendations',
        'Full historical data access',
        'Premium support'
      ],
      popular: false,
      color: 'from-amber-500 to-orange-500'
    }
  ]

  const hasActiveSub =
    profile?.subscription_status === 'active' ||
    profile?.subscription_status === 'trialing'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">Edge Up Sim</span>
            </Link>
            {hasActiveSub ? (
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-white bg-white/10 hover:bg-white/20 rounded-lg font-medium transition"
              >
                Go to Dashboard
              </button>
            ) : user && !isTrialFlow ? (
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-gray-400 hover:text-white font-medium transition"
              >
                Skip for now
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* Trial Required Banner */}
      {isTrialFlow && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
            <CreditCard className="w-5 h-5 text-white flex-shrink-0" />
            <p className="text-white font-semibold text-center">
              🎉 Account created! Choose your plan to start your 3-day free trial — your card won't be charged until day 4.
            </p>
          </div>
        </div>
      )}

      {/* Canceled Banner */}
      {wasCanceled && (
        <div className="bg-yellow-500/20 border-b border-yellow-500/30 py-3 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400" />
            <p className="text-yellow-300 text-sm">
              Checkout was canceled. Please select a plan to continue.
            </p>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-3">
            {isTrialFlow ? 'Start Your Free Trial' : 'Choose Your Plan'}
          </h2>
          <p className="text-gray-400 text-lg mb-6">
            3-day free trial • Cancel anytime • Card charged after trial ends
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center bg-white/10 rounded-full p-1 mb-8">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-semibold transition ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-900'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-6 py-2 rounded-full text-sm font-semibold transition ${
                billingCycle === 'annual'
                  ? 'bg-white text-slate-900'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Annual <span className="text-green-400 ml-1">Save 20%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Promo Code */}
      {user && (
        <section className="max-w-md mx-auto px-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Have a promo code?
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value.toUpperCase())
                  setPromoValid(null)
                }}
                placeholder="ENTER CODE"
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={validatePromoCode}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                Apply
              </button>
            </div>
            {promoValid !== null && (
              <p className={`mt-2 text-sm ${promoValid ? 'text-green-400' : 'text-red-400'}`}>
                {promoMessage}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Pricing Cards */}
      <section className="max-w-7xl mx-auto px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const price = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl overflow-hidden border transition-transform hover:-translate-y-1 ${
                  plan.popular
                    ? 'border-purple-500 bg-gradient-to-b from-purple-900/50 to-slate-900'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                {plan.popular && (
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-center py-1.5 text-xs font-bold uppercase tracking-wider">
                    ⭐ Most Popular
                  </div>
                )}
                <div className="p-6">
                  <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${plan.color} mb-4`}>
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-white">${price}</span>
                    <span className="text-gray-400">/month</span>
                    {billingCycle === 'annual' && (
                      <p className="text-green-400 text-sm mt-1">
                        Billed ${price * 12}/year (save ${(plan.monthlyPrice - price) * 12})
                      </p>
                    )}
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
                        <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loading !== null}
                    className={`w-full py-3 rounded-xl font-semibold transition ${
                      plan.popular
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/30'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    } disabled:opacity-50`}
                  >
                    {loading === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Redirecting to checkout...
                      </span>
                    ) : (
                      'Start 3-Day Free Trial'
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Trust Footer */}
        <div className="mt-10 text-center">
          <p className="text-gray-400 text-sm">
            🔒 Powered by Stripe • 256-bit SSL encryption • Cancel anytime during trial
          </p>
        </div>
      </section>
    </div>
  )
}

// ─── Loading fallback ─────────────────────────────────────────────────────────
function PricingLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── Default export wraps inner component in Suspense ────────────────────────
export default function PricingPage() {
  return (
    <Suspense fallback={<PricingLoading />}>
      <PricingContent />
    </Suspense>
  )
}