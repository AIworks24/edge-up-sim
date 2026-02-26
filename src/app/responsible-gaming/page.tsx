export default function ResponsibleGamingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Responsible Gaming</h1>
        <p className="text-gray-600 mb-8">Last Updated: February 2026</p>

        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-red-800 mb-2">Need Help Right Now?</h2>
          <p className="text-red-700 mb-3">
            If you or someone you know is struggling with a gambling problem, free confidential help is available 24/7.
          </p>
          <p className="text-red-800 font-bold text-lg">
            National Problem Gambling Helpline: 1-800-MY-RESET (1-800-697-3738)
          </p>
          <p className="text-red-700 mt-1">
            Also: Call or Text 1-800-522-4700
          </p>
          <p className="text-red-600 text-sm mt-1">Free — Confidential — 24/7</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Commitment</h2>
            <p className="text-gray-700 leading-relaxed">
              Edge Up Sim is committed to promoting responsible gaming. Our platform provides AI-powered
              sports betting analytics for entertainment and educational purposes only. We believe gambling
              should be fun, and we want to help our users maintain healthy habits around sports betting.
            </p>
          </div>

          <div className="mb-8">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-5 rounded">
              <h3 className="text-lg font-bold text-yellow-800 mb-2">Important Disclaimer</h3>
              <p className="text-yellow-700 text-sm">Edge Up Sim is for entertainment and educational purposes only.</p>
              <p className="text-yellow-700 text-sm">We make no guarantees of profit or winning outcomes.</p>
              <p className="text-yellow-700 text-sm">Sports betting involves risk — you may lose money.</p>
              <p className="text-yellow-700 text-sm">Never bet more than you can afford to lose.</p>
              <p className="text-yellow-700 text-sm">Past prediction performance does not guarantee future results.</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Know the Warning Signs</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Problem gambling can affect anyone. Be aware of these warning signs:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Spending more money or time gambling than intended</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Chasing losses by gambling more to win back money</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Gambling to escape problems or relieve stress</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Lying to family or friends about gambling habits</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Borrowing money or selling possessions to gamble</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Neglecting work, school, or family responsibilities</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Feeling restless or irritable when trying to stop</div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">Failed attempts to cut back or stop gambling</div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Tips for Responsible Gaming</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-lg">
                <span className="text-2xl">💰</span>
                <p className="text-gray-700">Set a budget before you start and stick to it — only bet what you can afford to lose</p>
              </div>
              <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-lg">
                <span className="text-2xl">⏱️</span>
                <p className="text-gray-700">Set time limits on how long you spend gambling each day or week</p>
              </div>
              <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-lg">
                <span className="text-2xl">🚫</span>
                <p className="text-gray-700">Never chase losses — accept losing as part of the game</p>
              </div>
              <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-lg">
                <span className="text-2xl">🧠</span>
                <p className="text-gray-700">Treat gambling as entertainment, not as a way to make money</p>
              </div>
              <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-lg">
                <span className="text-2xl">📊</span>
                <p className="text-gray-700">Use our analytics as one tool among many — never rely solely on any prediction service</p>
              </div>
              <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-lg">
                <span className="text-2xl">🛑</span>
                <p className="text-gray-700">Take regular breaks and step away if gambling stops being fun</p>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Help and Resources</h2>
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-1">National Council on Problem Gambling</h3>
                <p className="text-gray-600 text-sm mb-2">The leading national advocate for problem gamblers and their families.</p>
                <p className="text-sm">Phone: <strong>1-800-MY-RESET (1-800-697-3738)</strong></p>
                <p className="text-sm">Also: <strong>1-800-522-4700</strong></p>
                <p className="text-sm">
                  Website: <a href="https://www.ncpgambling.org/help-treatment/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ncpgambling.org</a>
                </p>
                <p className="text-gray-500 text-sm mt-1">Available 24/7 — Free — Confidential</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-1">Gamblers Anonymous</h3>
                <p className="text-gray-600 text-sm mb-2">A fellowship of men and women who share their experience to help others recover.</p>
                <p className="text-sm">
                  Website: <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">gamblersanonymous.org</a>
                </p>
                <p className="text-gray-500 text-sm mt-1">Find local meetings and online support</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-bold text-gray-900 mb-1">SAMHSA National Helpline</h3>
                <p className="text-gray-600 text-sm mb-2">National helpline for mental health and substance use disorders including gambling.</p>
                <p className="text-sm">Phone: <strong>1-800-662-4357</strong></p>
                <p className="text-sm">
                  Website: <a href="https://www.samhsa.gov" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">samhsa.gov</a>
                </p>
                <p className="text-gray-500 text-sm mt-1">Available 24/7 — Free — Confidential — English and Spanish</p>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Take a Self-Assessment</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Not sure if gambling is becoming a problem? The NCPG offers a free anonymous
              10-question self-assessment to help you understand your gambling habits.
            </p>
            <a
              href="https://www.ncpgambling.org/help-treatment/self-assessment/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              Take the Free Self-Assessment
            </a>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Edge Up Sim</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have concerns about your account or want to discuss responsible gaming options, contact us at{' '}
              <a href="mailto:support@edgeupsim.com" className="text-blue-600 hover:underline">
                support@edgeupsim.com
              </a>
              . We can assist with account limitations or self-exclusion requests.
            </p>
          </div>

          <div className="border-t pt-6">
            <p className="text-sm text-gray-500">
              Remember: Gambling should be fun. If it stops being fun, please reach out for help. You are not alone.
            </p>
          </div>

        </div>

        <div className="mt-8 text-center">
          <a href="/" className="text-blue-600 hover:underline">
            Back to Home
          </a>
        </div>

      </div>
    </div>
  )
}