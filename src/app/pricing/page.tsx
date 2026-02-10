'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/database/supabase-client'
import Link from 'next/link'

export default function PricingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoValid, setPromoValid] = useState<boolean | null>(null)
  const [promoMessage, setPromoMessage] = useState('')

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      setUser(session.user)
    }
  }

  async function handleSelectPlan(tier: 'starter' | 'pro' | 'elite') {
    if (!user) {
      router.push('/register')
      return
    }

    setLoading(tier)

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
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
    } catch (error) {
      setPromoValid(false)
      setPromoMessage('Error validating code')
    }
  }

  const plans = [
    {
      id: 'starter',
      name: 'Edge Starter',
      price: 29,
      description: 'Perfect for casual bettors',
      features: [
        '3 personalized hot picks daily',
        '3 custom simulations daily',
        'Moneyline, Spread, Totals',
        'All major sports (NFL, NBA, NCAA, MLB, NHL)',
        'Basic performance analytics',
        'Edge score calculations'
      ],
      popular: false
    },
    {
      id: 'pro',
      name: 'Edge Pro',
      price: 99,
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
      popular: true
    },
    {
      id: 'elite',
      name: 'Edge Elite',
      price: 249,
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
      popular: false
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <Link href="/">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent cursor-pointer">
                Edge Up Sim
              </h1>
            </Link>
            {user ? (
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
              >
                Go to Dashboard
              </button>
            ) : (
              <div className="flex gap-4">
                <button
                  onClick={() => router.push('/login')}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                >
                  Sign In
                </button>
                <button
                  onClick={() => router.push('/register')}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold"
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h2>
          <p className="text-xl text-gray-600 mb-2">
            Start with a 3-day free trial. No credit card required until trial ends.
          </p>
          <p className="text-lg text-gray-600">
            Save 20% with annual billing
          </p>
        </div>
      </section>

      {/* Promo Code */}
      {user && (
        <section className="max-w-md mx-auto px-4 mb-12">
          <div className="bg-white rounded-lg shadow-md p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                placeholder="PROMO CODE"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
              />
              <button
                onClick={validatePromoCode}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
            {promoValid !== null && (
              <p className={`mt-2 text-sm ${promoValid ? 'text-green-600' : 'text-red-600'}`}>
                {promoMessage}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Pricing Cards */}
      <section className="max-w-7xl mx-auto px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl shadow-lg overflow-hidden ${
                plan.popular ? 'ring-2 ring-blue-600 transform scale-105' : ''
              }`}
            >
              {plan.popular && (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-2 font-semibold">
                  MOST POPULAR
                </div>
              )}

              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <p className="text-gray-600 mb-6">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-5xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-xl text-gray-600">/month</span>
                  {promoValid && (
                    <div className="mt-2">
                      <span className="text-sm text-green-600 font-semibold">
                        {promoMessage} applied!
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSelectPlan(plan.id as any)}
                  disabled={loading !== null}
                  className={`w-full py-3 px-6 rounded-xl font-semibold transition-all ${
                    plan.popular
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-xl'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading === plan.id ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </span>
                  ) : user ? (
                    'Start Free Trial'
                  ) : (
                    'Sign Up to Start'
                  )}
                </button>

                <ul className="mt-8 space-y-4">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <svg className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Annual Discount Info */}
        <div className="mt-12 text-center">
          <div className="inline-block bg-blue-50 rounded-lg px-6 py-4">
            <p className="text-lg text-gray-900">
              <span className="font-bold text-blue-600">Save 20%</span> with annual billing
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Starter: $278/year • Pro: $950/year • Elite: $2,390/year
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Frequently Asked Questions
          </h3>
          <div className="space-y-6">
            <div className="bg-white rounded-lg p-6 shadow">
              <h4 className="font-bold text-gray-900 mb-2">How does the 3-day free trial work?</h4>
              <p className="text-gray-600">
                Start using Edge Up Sim immediately with full access to your chosen plan. You won't be charged until after 3 days. Cancel anytime during the trial at no cost.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h4 className="font-bold text-gray-900 mb-2">Can I change plans later?</h4>
              <p className="text-gray-600">
                Yes! Upgrade or downgrade your plan anytime from your account settings. Changes take effect immediately.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h4 className="font-bold text-gray-900 mb-2">What payment methods do you accept?</h4>
              <p className="text-gray-600">
                We accept all major credit cards (Visa, Mastercard, American Express) through our secure Stripe payment processor.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <h4 className="font-bold text-gray-900 mb-2">Is my data secure?</h4>
              <p className="text-gray-600">
                Absolutely. We use industry-standard encryption and never store your payment information. All payments are processed securely through Stripe.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}