export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          <p className="text-gray-700 leading-relaxed">
            <strong>Effective Date:</strong> February 9, 2026
          </p>

          <p className="text-gray-700 leading-relaxed">
            Edge Up Sim ("we," "our," or "us") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
          </p>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mb-2 mt-4">Personal Information</h3>
            <p className="text-gray-700 leading-relaxed mb-2">
              We collect information that you provide directly to us:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li><strong>Account Information:</strong> Name, email address, password</li>
              <li><strong>Location Data:</strong> State of residence (for legal compliance)</li>
              <li><strong>Payment Information:</strong> Credit card details (processed securely via Stripe)</li>
              <li><strong>Preferences:</strong> Sport preferences, timezone</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-2 mt-4">Usage Information</h3>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Predictions you request</li>
              <li>Simulation usage patterns</li>
              <li>Feedback you provide on predictions</li>
              <li>Login history and timestamps</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mb-2 mt-4">Technical Information</h3>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device information</li>
              <li>Operating system</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              We use your information to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Provide and improve our Service</li>
              <li>Generate personalized predictions and recommendations</li>
              <li>Process payments and subscriptions</li>
              <li>Verify your location for legal compliance</li>
              <li>Send service-related communications (account updates, security alerts)</li>
              <li>Improve our AI algorithms and prediction accuracy</li>
              <li>Detect and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Marketing Communications</h2>
            <p className="text-gray-700 leading-relaxed">
              With your consent, we may send you:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-2">
              <li>Promotional emails about new features</li>
              <li>Tips for using the Service effectively</li>
              <li>Special offers and discounts</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-2">
              You can opt out of marketing emails at any time by clicking "unsubscribe" in any email or updating your preferences in your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Information Sharing</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              We do NOT sell your personal information. We may share your information with:
            </p>
            
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li><strong>Service Providers:</strong> Stripe (payment processing), Supabase (data hosting), Anthropic (AI processing), Vercel (hosting)</li>
              <li><strong>Legal Requirements:</strong> When required by law, subpoena, or legal process</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong>With Your Consent:</strong> When you explicitly authorize sharing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-2">
              <li>Encryption of data in transit (HTTPS/SSL)</li>
              <li>Encryption of data at rest</li>
              <li>Secure password hashing</li>
              <li>Regular security audits</li>
              <li>Limited employee access to personal data</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-2">
              However, no method of transmission over the Internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide services. If you cancel your account, we will delete or anonymize your personal information within 90 days, except where required by law to retain it longer.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Update inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your account and data</li>
              <li><strong>Portability:</strong> Receive your data in a machine-readable format</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-2">
              To exercise these rights, contact us at <a href="mailto:privacy@edgeupsim.com" className="text-blue-600 hover:underline">privacy@edgeupsim.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Cookies and Tracking</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Keep you logged in</li>
              <li>Remember your preferences</li>
              <li>Analyze usage patterns</li>
              <li>Improve Service performance</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-2">
              You can control cookies through your browser settings, but disabling them may affect functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Children's Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Our Service is not intended for individuals under 18. We do not knowingly collect information from children. If you believe we have collected information from a minor, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. State-Specific Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              If you reside in California, Virginia, Colorado, or other states with specific privacy laws, you may have additional rights:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Right to know what personal information is collected</li>
              <li>Right to know if personal information is sold or shared</li>
              <li>Right to opt-out of sale/sharing</li>
              <li>Right to correct inaccurate information</li>
              <li>Right to limit use of sensitive information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. International Users</h2>
            <p className="text-gray-700 leading-relaxed">
              Edge Up Sim is based in the United States and intended for U.S. residents in legal sports betting states. If you access the Service from outside the U.S., you acknowledge that your information will be transferred to and processed in the United States.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Changes to Privacy Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of significant changes by email or prominent notice on our Service. Your continued use after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              For questions or concerns about this Privacy Policy, contact us at:
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mt-2">
              <p className="text-gray-700">
                <strong>Email:</strong> <a href="mailto:privacy@edgeupsim.com" className="text-blue-600 hover:underline">privacy@edgeupsim.com</a><br />
                <strong>Address:</strong> P.O. Box 1234 Richmond, VA 23060
              </p>
            </div>
          </section>

          <div className="border-t pt-6 mt-8">
            <p className="text-sm text-gray-600">
              Last Updated: February 9, 2026
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <a href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}