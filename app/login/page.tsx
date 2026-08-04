'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      alert('Please enter both email and password')
      return
    }

    if (trimmedPassword.length < 6) {
      alert('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        }
      })
      if (error) {
  console.error('Full signup error:', JSON.stringify(error, null, 2))
  alert('Error: ' + (error.message || error.code || JSON.stringify(error)))
} else {
        alert(
          '📧 Check your email!\n\n' +
          'We sent a confirmation link to ' + trimmedEmail + '\n\n' +
          'Click the link to activate your account, then come back and log in.'
        )
        setIsSignUp(false)
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      })
      if (error) {
        alert(error.message)
      } else {
        router.push('/')
        router.refresh()
      }
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-white">

      {/* LEFT SIDE — Branded Panel (hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 relative overflow-hidden animated-gradient">

        {/* Animated blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-20 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute bottom-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          <div className="blob absolute top-1/2 left-1/3 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" style={{animationDelay: '10s'}}></div>
        </div>

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        ></div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">

          {/* Top: Logo */}
          <Link href="/" className="flex items-center gap-2 group w-fit">
            <span className="text-3xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-2xl font-bold tracking-tight">Campus Plug</span>
          </Link>

          {/* Middle: Big Text */}
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full text-sm font-semibold text-gold mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
              </span>
              Now live at UG
            </div>

            <h1 className="text-5xl xl:text-6xl font-bold leading-tight tracking-tight mb-6">
              Every skill.<br />
              <span className="gradient-text">One plug.</span>
            </h1>

            <p className="text-lg text-white/70 leading-relaxed">
              Join hundreds of UG students booking and offering trusted services on campus.
            </p>
          </div>

          {/* Bottom: Testimonial / Stats */}
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            {[
              { number: '100+', label: 'Students' },
              { number: '50+', label: 'Services' },
              { number: '24/7', label: 'Open' },
            ].map((stat) => (
              <div key={stat.label} className="glass rounded-2xl p-4">
                <div className="text-2xl font-bold text-gold">{stat.number}</div>
                <div className="text-xs text-white/60 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE — Form */}
      <div className="flex-1 flex flex-col relative">

        {/* Mobile-only top branding with gradient background */}
        <div className="md:hidden relative animated-gradient overflow-hidden py-12 px-6">
          <div className="blob absolute -top-10 -right-10 w-64 h-64 bg-gold/30 rounded-full blur-3xl"></div>

          <div className="relative">
            <Link href="/" className="flex items-center gap-2 text-white mb-6">
              <span className="text-2xl">🔌</span>
              <span className="text-xl font-bold">Campus Plug</span>
            </Link>

            <h1 className="text-3xl font-bold text-white leading-tight">
              Every skill.<br />
              <span className="gradient-text">One plug.</span>
            </h1>
          </div>
        </div>

        {/* Form container */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-2">
                {isSignUp ? 'Create account' : 'Welcome back'}
              </h2>
              <p className="text-gray-500">
                {isSignUp
                  ? 'Start booking services in minutes'
                  : 'Log in to continue to Campus Plug'}
              </p>
            </div>

            {/* Info banner for signup */}
            {isSignUp && (
              <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-gold/10 via-gold/5 to-transparent border border-gold/20">
                <div className="flex gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">New here?</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Sign up with any email to browse. Add your WhatsApp number to start selling.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-charcoal text-white py-4 rounded-2xl font-semibold hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-charcoal/20 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <span>{isSignUp ? 'Create Account' : 'Log In'}</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-gray-400 uppercase tracking-widest">or</span>
                </div>
              </div>

              {/* Toggle */}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="w-full py-4 rounded-2xl border-2 border-gray-200 text-charcoal font-semibold hover:border-charcoal transition-colors"
              >
                {isSignUp
                  ? 'Already have an account? Log in'
                  : "Don't have an account? Sign up"}
              </button>

            </form>

            {/* Footer */}
            <div className="mt-8 text-center">
              <Link
                href="/"
                className="text-sm text-gray-500 hover:text-charcoal transition-colors inline-flex items-center gap-1 group"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span>
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}