'use client'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'

export default function PrivacyPage() {

  return (
    <main className="min-h-screen bg-off-white">
      {/* Navigation — same as the landing page */}
<NavBar
        variant="light"
        rightSlot={
          <>
            <Link href="/login" className="text-sm font-medium text-charcoal hover:text-gold transition-colors px-3 py-2">
              Log in
            </Link>
            <Link href="/login" className="bg-charcoal text-white px-4 sm:px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-all hover:scale-105 shadow-lg shadow-charcoal/20">
              Get Started
            </Link>
          </>
        }
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-32 pb-20">
        <div className="bg-white rounded-3xl shadow-sm px-6 py-12 md:px-12 md:py-16">
          <h1 className="text-4xl md:text-5xl font-bold text-charcoal leading-tight mb-2">
            Privacy <em className="font-serif-accent italic text-gold">Policy</em>
          </h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: August 17, 2026</p>

          <div className="space-y-10 text-base md:text-lg text-gray-600 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">1. Introduction</h2>
              <p>
                Campus Plug is a student marketplace built for the University of Ghana community. This
                privacy policy explains what information we collect, why we collect it, and how it is
                used. It applies to everyone who visits or uses Campus Plug, whether you are browsing
                listings or signed in as a buyer or seller.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">2. What we collect</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong className="text-charcoal">Account information</strong> — your email address, full name, and phone/WhatsApp number when you create an account.</li>
                <li><strong className="text-charcoal">Listings</strong> — the listings and photos that sellers upload, including prices, categories, and location.</li>
                <li><strong className="text-charcoal">Transaction records</strong> — bookings and sales you make or record, including amounts, dates, and notes.</li>
                <li><strong className="text-charcoal">Reviews</strong> — ratings and written reviews you leave on the platform.</li>
                <li><strong className="text-charcoal">Browser and device information</strong> — anonymous usage statistics collected via Vercel Analytics, such as pages visited and approximate location.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">3. Why we collect it</h2>
              <p>
                We collect this information to let you sign in, connect buyers with sellers, keep
                records of bookings and sales, prevent fraud and abuse, verify that reviews come from
                real transactions, and improve Campus Plug for everyone. We never sell your personal
                data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">4. Who we share it with</h2>
              <p>We share data only with the service providers needed to run Campus Plug:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong className="text-charcoal">Supabase</strong> — database and authentication (stores your account and listing data).</li>
                <li><strong className="text-charcoal">Vercel</strong> — hosting and anonymous analytics.</li>
                <li><strong className="text-charcoal">Sentry</strong> — error tracking so we can find and fix bugs.</li>
                <li><strong className="text-charcoal">Resend</strong> — transactional emails.</li>
                <li><strong className="text-charcoal">WhatsApp</strong> — when you tap a &quot;Message&quot; button, we open a WhatsApp chat with the seller. We only initiate the chat; we do not see the conversation that follows.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">5. Your rights</h2>
              <p>
                You can request a copy of the personal data we hold about you, ask us to correct it,
                or ask us to delete your account and data. Contact us at{' '}
                <a href="mailto:zackjunianders@gmail.com" className="text-gold font-semibold hover:underline">zackjunianders@gmail.com</a>{' '}
                and we will respond as soon as possible.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">6. Cookies &amp; analytics</h2>
              <p>
                We use Vercel Analytics to collect anonymous, aggregated usage statistics (such as page
                views and device type) so we can understand how Campus Plug is used. This analytics
                does not track you across other websites and does not identify you personally.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">7. Children</h2>
              <p>
                Campus Plug is intended for University of Ghana students who are 18 or older. We do
                not knowingly collect personal information from anyone under 18. If you believe a
                minor has provided us with data, contact us and we will delete it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">8. Changes to this policy</h2>
              <p>
                We may update this policy from time to time. When we do, the &quot;Last updated&quot;
                date at the top of this page will change. Continuing to use Campus Plug after a change
                means you accept the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">9. Contact</h2>
              <p>
                Questions about privacy? Email us at{' '}
                <a href="mailto:zackjunianders@gmail.com" className="text-gold font-semibold hover:underline">zackjunianders@gmail.com</a>.
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* Footer — same as the landing page */}
      <footer className="bg-charcoal text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
              <span className="text-xl font-bold">Campus Plug</span>
            </Link>

            <p className="text-sm text-white/60 text-center">
              Made with <span className="text-gold">💛</span> in Ghana for UG students
            </p>

            <div className="flex gap-6 text-sm">
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Login
              </Link>
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Sign up
              </Link>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 text-center text-xs text-white/40">
            © 2026 Campus Plug. All rights reserved.
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-gold transition-colors">Privacy</Link>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-gold transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
