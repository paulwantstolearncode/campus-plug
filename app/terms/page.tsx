'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function TermsPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <main className="min-h-screen bg-off-white">
      {/* Navigation — same as the landing page */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/80 backdrop-blur-xl shadow-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-charcoal tracking-tight">
              Campus Plug
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-charcoal hover:text-gold transition-colors px-3 py-2"
            >
              Log in
            </Link>
            <Link
              href="/login"
              className="bg-charcoal text-white px-4 sm:px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-all hover:scale-105 shadow-lg shadow-charcoal/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-32 pb-20">
        <div className="bg-white rounded-3xl shadow-sm px-6 py-12 md:px-12 md:py-16">
          <h1 className="text-4xl md:text-5xl font-bold text-charcoal leading-tight mb-2">
            Terms of <em className="font-serif-accent italic text-gold">Service</em>
          </h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: August 17, 2026</p>

          <div className="space-y-10 text-base md:text-lg text-gray-600 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">1. Introduction</h2>
              <p>
                Welcome to Campus Plug. By accessing or using our platform, you agree to be bound by
                these Terms of Service. Please read them carefully. If you do not agree with any part
                of these terms, do not use Campus Plug.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">2. Who can use Campus Plug</h2>
              <p>
                Campus Plug is available to verified students of the University of Ghana who are 18
                years or older. By using the platform you confirm that you meet these requirements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">3. What Campus Plug is</h2>
              <p>
                Campus Plug is a marketplace that connects student buyers and sellers. We are not a
                party to transactions between users. Buyers and sellers arrange payment and delivery
                directly, usually via WhatsApp. Campus Plug does not process payments and is not
                responsible for the quality, safety, legality, or delivery of goods and services
                offered by sellers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">4. User accounts</h2>
              <p>
                You are responsible for your account. Keep your login details secure, and do not share
                them with anyone. One account per person — creating multiple or fake accounts may
                result in suspension.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">5. Seller responsibilities</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Keep your listings accurate, honest, and up to date.</li>
                <li>Price your goods and services fairly and as advertised.</li>
                <li>Deliver what you promise, on time and as described.</li>
                <li>Respond to buyers promptly and respectfully.</li>
                <li>Comply with all applicable Ghanaian laws.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">6. Buyer responsibilities</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Communicate respectfully with sellers.</li>
                <li>Honour bookings you make, or cancel promptly if you cannot.</li>
                <li>Leave honest reviews based on real transactions.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">7. Prohibited content &amp; conduct</h2>
              <p>You may not use Campus Plug to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>List or sell illegal goods or services.</li>
                <li>Post adult content.</li>
                <li>Commit fraud or attempt to deceive other users.</li>
                <li>Harass, threaten, or abuse other users.</li>
                <li>Send spam or unsolicited messages.</li>
                <li>Impersonate another person or business.</li>
                <li>Circumvent the platform in ways that harm other users.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">8. Reviews</h2>
              <p>
                Reviews must be honest and based on real transactions. We may remove reviews that
                violate this policy or our community standards, at our discretion.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">9. Content ownership</h2>
              <p>
                You retain all rights to the content you upload. By posting listings, photos, or
                reviews, you grant Campus Plug a licence to store and display that content on the
                platform so it can function for everyone.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">10. Account termination</h2>
              <p>
                We may suspend or terminate accounts that violate these terms, defraud other users, or
                otherwise harm the community. You may stop using Campus Plug at any time by contacting
                us to delete your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">11. Disclaimers</h2>
              <p>
                Campus Plug is provided &quot;as is&quot; without warranties of any kind. We are not
                liable for disputes between users or for damages arising from transactions, including
                loss of money, goods, or services arranged through the platform.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">12. Governing law</h2>
              <p>
                These terms are governed by the laws of Ghana. Any disputes arising from your use of
                Campus Plug will be resolved in the courts of Accra.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">13. Changes to terms</h2>
              <p>
                We may update these terms from time to time. Continued use of Campus Plug after a
                change means you accept the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-charcoal mb-3">14. Contact</h2>
              <p>
                Questions about these terms? Email us at{' '}
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
