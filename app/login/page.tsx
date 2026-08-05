'use client'
import { useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()

  // The OAuth callback redirects here with ?error=signin_failed when the code
  // exchange failed.
  const authError = useSearchParams().get('error')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      alert('Please enter both email and password')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    })

    if (error) {
      alert('Login failed: ' + error.message)
    } else {
      router.push('/')
      router.refresh()
    }

    setLoading(false)
  }

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      }
    })
    if (error) alert('Google sign in failed: ' + error.message)
  }

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-white">

      {/* LEFT SIDE — Branded Panel */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 relative overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-20 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute bottom-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          <div className="blob absolute top-1/2 left-1/3 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" style={{animationDelay: '10s'}}></div>
        </div>

        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        ></div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <Link href="/" className="flex items-center gap-2 group w-fit">
            <span className="text-3xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-2xl font-bold tracking-tight">Campus Plug</span>
          </Link>

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

        {/* Mobile top branding */}
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

            {/* Error banner (e.g. failed OAuth code exchange) */}
            {authError && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                Sign-in failed. Please try again.
              </div>
            )}

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-2">
                {isSignUp ? 'Create account' : 'Welcome back'}
              </h2>
              <p className="text-gray-500">
                {isSignUp
                  ? 'Sign up with Google to get started'
                  : 'Log in to continue to Campus Plug'}
              </p>
            </div>

            {/* Google Sign In — Always shown, prominent when signing up */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-4 rounded-2xl border-2 border-gray-200 text-charcoal font-semibold hover:border-charcoal hover:bg-gray-50 transition-all flex items-center justify-center gap-3 mb-6"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {isSignUp ? 'Sign up with Google' : 'Continue with Google'}
            </button>

            {/* Show email/password form only for LOGIN, not signup */}
            {!isSignUp && (
              <>
                {/* Divider */}
                <div className="relative py-2 mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 text-gray-400 uppercase tracking-widest">or log in with email</span>
                  </div>
                </div>

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
                      placeholder="Your password"
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
                      <span>Logging in...</span>
                    ) : (
                      <>
                        <span>Log In</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            )}

            {/* Info banner for signup mode */}
            {isSignUp && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-gold/10 via-gold/5 to-transparent border border-gold/20 mb-4">
                <div className="flex gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">Quick & secure</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Sign up in 2 clicks with your Google account. No passwords to remember.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Toggle */}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-gray-600 hover:text-charcoal transition-colors"
              >
                {isSignUp
                  ? 'Already have an account? Log in'
                  : "New to Campus Plug? Sign up"}
              </button>
            </div>

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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}