'use client'

import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600">Edge Up Sim</h1>
            <div className="flex gap-4">
              <button
                onClick={() => router.push('/login')}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Sign In
              </button>
              <button
                onClick={() => router.push('/register')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Start Free Trial
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            AI-Powered Sports Betting Analytics
          </h2>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Get data-driven betting recommendations with confidence scores and edge calculations. 
            Our AI learns and improves with every prediction.
          </p>
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            <div className="rounded-md shadow">
              <button
                onClick={() => router.push('/register')}
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10"
              >
                Start 3-Day Free Trial
              </button>
            </div>
            <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
              <button
                onClick={() => router.push('/pricing')}
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
              >
                View Pricing
              </button>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-20">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-blue-600 text-3xl mb-4">🎯</div>
              <h3 className="text-lg font-semibold mb-2">High-Confidence Picks</h3>
              <p className="text-gray-600">
                Only recommendations with &gt;65% confidence and positive expected value
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-blue-600 text-3xl mb-4">🧠</div>
              <h3 className="text-lg font-semibold mb-2">AI Learning System</h3>
              <p className="text-gray-600">
                Our AI continuously improves by learning from outcomes and feedback
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-blue-600 text-3xl mb-4">📊</div>
              <h3 className="text-lg font-semibold mb-2">Personalized Analytics</h3>
              <p className="text-gray-600">
                Get picks tailored to your favorite sports with detailed analysis
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-blue-600 text-3xl mb-4">🏈</div>
              <h3 className="text-lg font-semibold mb-2">Multiple Sports</h3>
              <p className="text-gray-600">
                NFL, NBA, NCAA Basketball, NCAA Football, MLB, and NHL coverage
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-blue-600 text-3xl mb-4">💎</div>
              <h3 className="text-lg font-semibold mb-2">Edge Score Analysis</h3>
              <p className="text-gray-600">
                See exactly how much value you're getting on every bet
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-blue-600 text-3xl mb-4">📈</div>
              <h3 className="text-lg font-semibold mb-2">Performance Tracking</h3>
              <p className="text-gray-600">
                Track all predictions, outcomes, and your overall ROI
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Preview */}
        <div className="mt-20 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Simple, Transparent Pricing</h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-gray-200">
              <h3 className="text-xl font-bold mb-2">Edge Starter</h3>
              <p className="text-4xl font-bold text-blue-600 mb-4">$29<span className="text-lg text-gray-600">/mo</span></p>
              <ul className="text-left space-y-2 mb-6 text-sm">
                <li>✓ 3 hot picks daily</li>
                <li>✓ 3 simulations daily</li>
                <li>✓ Basic analytics</li>
                <li>✓ All major sports</li>
              </ul>
              <button
                onClick={() => router.push('/register')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Start Free Trial
              </button>
            </div>

            {/* Pro */}
            <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-blue-600 transform scale-105">
              <div className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full inline-block mb-2">
                POPULAR
              </div>
              <h3 className="text-xl font-bold mb-2">Edge Pro</h3>
              <p className="text-4xl font-bold text-blue-600 mb-4">$99<span className="text-lg text-gray-600">/mo</span></p>
              <ul className="text-left space-y-2 mb-6 text-sm">
                <li>✓ 3 hot picks daily</li>
                <li>✓ 10 simulations daily</li>
                <li>✓ Advanced analytics</li>
                <li>✓ Player props</li>
              </ul>
              <button
                onClick={() => router.push('/register')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Start Free Trial
              </button>
            </div>

            {/* Elite */}
            <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-gray-200">
              <h3 className="text-xl font-bold mb-2">Edge Elite</h3>
              <p className="text-4xl font-bold text-blue-600 mb-4">$249<span className="text-lg text-gray-600">/mo</span></p>
              <ul className="text-left space-y-2 mb-6 text-sm">
                <li>✓ 3 hot picks daily</li>
                <li>✓ 50 simulations daily</li>
                <li>✓ Premium analytics</li>
                <li>✓ All bet types</li>
              </ul>
              <button
                onClick={() => router.push('/register')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Start Free Trial
              </button>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            All plans include a 3-day free trial. Cancel anytime.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 mt-20">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm">
            © 2026 Edge Up Sim. For entertainment purposes only. Must be 18+ and in a legal state.
          </p>
        </div>
      </footer>
    </div>
  )
}