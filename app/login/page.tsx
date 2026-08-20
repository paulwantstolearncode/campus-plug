'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

// ── Phone formatting helpers ──────────────────────────────────────────────

/** Normalise any Ghana phone input to +233XXXXXXXXX for Supabase OTP. */
function formatPhoneForSupabase(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.startsWith('233') && digits.length === 12) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+233' + digits.slice(1)
  if (digits.length === 9) return '+233' + digits
  if (raw.startsWith('+')) return raw
  return '+233' + digits
}

/** Display-friendly format: +233 XXX XXX XXXX */
function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/[^0-9]/g, '')
  if (digits.length >= 12) {
    return '+233 ' + digits.slice(3, 6) + ' ' + digits.slice(6, 9) + ' ' + digits.slice(9, 12)
  }
  return e164
}

function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [authMethod, setAuthMethod] = useState<'google-email' | 'phone'>('google-email')
  const submitAttempted = useRef(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')

  // Email/password state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Phone auth state
  const [phoneName, setPhoneName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpTouched, setOtpTouched] = useState(false)
  const otpRef = useRef<HTMLInputElement>(null)
  const [countdown, setCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const nextParam = searchParams.get('next')
    const nextPath = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/services'
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(nextPath)
    })
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const validateEmail = (value: string): string | null => {
    const v = value.trim()
    if (!v) return 'Email is required'
    if (!EMAIL_REGEX.test(v)) return 'Please enter a valid email'
    return null
  }
  const validatePassword = (value: string): string | null => {
    if (!value) return 'Password is required'
    if (value.length < 6) return 'Password must be at least 6 characters'
    return null
  }
  const validatePhone = (value: string): string | null => {
    const digits = value.replace(/[^0-9]/g, '')
    if (!digits) return 'Phone number is required'
    if (digits.length < 9 || digits.length > 13) return 'Please enter a valid Ghana phone number'
    return null
  }
  const validateOtp = (value: string): string | null => {
    const digits = value.replace(/[^0-9]/g, '')
    if (!digits) return 'Verification code is required'
    if (digits.length !== 6) return 'Code must be 6 digits'
    return null
  }

  const handleEmailBlur = () => { setEmailTouched(true); setEmailError(validateEmail(email)) }
  const handleEmailFocus = () => { if (!submitAttempted.current) setEmailError(null) }
  const handlePasswordBlur = () => { setPasswordTouched(true); setPasswordError(validatePassword(password)) }
  const handlePasswordFocus = () => { if (!submitAttempted.current) setPasswordError(null) }
  const handlePhoneBlur = () => { setPhoneTouched(true); setPhoneError(validatePhone(phoneNumber)) }
  const handlePhoneFocus = () => { setPhoneError(null) }
  const handleOtpBlur = () => { setOtpTouched(true); setOtpError(validateOtp(otpCode)) }
  const handleOtpFocus = () => { setOtpError(null) }

  const showEmailError = emailTouched && emailError !== null
  const showPasswordError = passwordTouched && passwordError !== null
  const showPhoneError = phoneTouched && phoneError !== null
  const showOtpError = otpTouched && otpError !== null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailValidation = validateEmail(email)
    const passwordValidation = validatePassword(password)
    setEmailTouched(true); setPasswordTouched(true)
    setEmailError(emailValidation); setPasswordError(passwordValidation)
    if (emailValidation || passwordValidation) {
      submitAttempted.current = true
      if (emailValidation) emailRef.current?.focus(); else passwordRef.current?.focus()
      return
    }
    submitAttempted.current = false; setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() })
    if (error) { alert('Login failed: ' + (typeof error === 'string' ? error : error?.message || 'Unknown error')) }
    else {
      const next = new URLSearchParams(window.location.search).get('next')
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/services')
    }
    setLoading(false)
  }

  const handleSendOtp = async () => {
    const phoneValidation = validatePhone(phoneNumber)
    setPhoneTouched(true); setPhoneError(phoneValidation)
    if (phoneValidation) { phoneRef.current?.focus(); return }
    setLoading(true); setOtpError(null)
    const { error } = await supabase.auth.signInWithOtp({ phone: formatPhoneForSupabase(phoneNumber), options: { shouldCreateUser: true, data: { full_name: phoneName.trim() || undefined, name: phoneName.trim() || undefined } } })
    if (error) { setPhoneError(error.message); setLoading(false); return }
    setOtpSent(true); setLoading(false); setOtpCode(''); setOtpTouched(false)
    startCountdown()
    setTimeout(() => otpRef.current?.focus(), 100)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const otpValidation = validateOtp(otpCode)
    setOtpTouched(true); setOtpError(otpValidation)
    if (otpValidation) { otpRef.current?.focus(); return }
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: formatPhoneForSupabase(phoneNumber),
      token: otpCode.replace(/[^0-9]/g, ''),
      type: 'sms',
    })
    if (error) { setOtpError(error.message); setLoading(false); return }
    const next = new URLSearchParams(window.location.search).get('next')
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/services')
  }

  const handleResendOtp = async () => {
    if (countdown > 0) return
    setLoading(true); setOtpError(null)
    const { error } = await supabase.auth.signInWithOtp({ phone: formatPhoneForSupabase(phoneNumber), options: { shouldCreateUser: true, data: { full_name: phoneName.trim() || undefined, name: phoneName.trim() || undefined } } })
    if (error) setOtpError(error.message); else startCountdown()
    setLoading(false)
  }

  const startCountdown = () => {
    setCountdown(60)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    })
    if (error) alert('Google sign in failed: ' + (typeof error === 'string' ? error : error?.message || 'Unknown error'))
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp)
    setEmailError(null); setPasswordError(null); setEmailTouched(false); setPasswordTouched(false)
    submitAttempted.current = false
    setOtpSent(false); setOtpCode(''); setOtpError(null); setOtpTouched(false)
    setPhoneError(null); setPhoneTouched(false)
  }

  const switchToPhone = () => {
    setAuthMethod('phone')
    setOtpSent(false); setOtpCode(''); setOtpError(null); setPhoneError(null); setPhoneTouched(false)
  }

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* LEFT SIDE */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 relative overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-20 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute bottom-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          <div className="blob absolute top-1/2 left-1/3 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" style={{animationDelay: '10s'}}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px'}}></div>
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
              Every skill.<br /><span className="gradient-text">One plug.</span>
            </h1>
            <p className="text-lg text-white/70 leading-relaxed">
              Join hundreds of UG students booking and offering trusted services on campus.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            {[{ number: '100+', label: 'Students' }, { number: '50+', label: 'Services' }, { number: '24/7', label: 'Open' }].map((stat) => (
              <div key={stat.label} className="glass rounded-2xl p-4">
                <div className="text-2xl font-bold text-gold">{stat.number}</div>
                <div className="text-xs text-white/60 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex-1 flex flex-col relative">
        <div className="md:hidden relative animated-gradient overflow-hidden py-12 px-6">
          <div className="blob absolute -top-10 -right-10 w-64 h-64 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="relative">
            <Link href="/" className="flex items-center gap-2 text-white mb-6">
              <span className="text-2xl">🔌</span>
              <span className="text-xl font-bold">Campus Plug</span>
            </Link>
            <h1 className="text-3xl font-bold text-white leading-tight">
              Every skill.<br /><span className="gradient-text">One plug.</span>
            </h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            {authError && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                Sign-in failed. Please try again.
              </div>
            )}

            <div className="mb-8">
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-2">
                {authMethod === 'phone' ? 'Welcome' : isSignUp ? 'Create account' : 'Welcome back'}
              </h2>
              <p className="text-gray-500">
                {authMethod === 'phone'
                  ? 'Enter your phone number — we\u2019ll set you up if you\u2019re new'
                  : isSignUp ? 'Sign up with Google to get started' : 'Log in to continue to Campus Plug'}
              </p>
            </div>

            <button type="button" onClick={handleGoogleSignIn}
              className="w-full py-4 rounded-2xl border-2 border-gray-200 text-charcoal font-semibold hover:border-charcoal hover:bg-gray-50 transition-all flex items-center justify-center gap-3 mb-6">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {isSignUp ? 'Sign up with Google' : 'Continue with Google'}
            </button>

                <div className="flex gap-2 mb-4">
                  <button type="button" onClick={() => setAuthMethod('google-email')}
                    className={'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ' + (authMethod === 'google-email' ? 'bg-charcoal text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                    ✉️ Email
                  </button>
                  <button type="button" onClick={switchToPhone}
                    className={'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ' + (authMethod === 'phone' ? 'bg-charcoal text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                    📱 Phone
                  </button>
                </div>

                {authMethod === 'google-email' && isSignUp && (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    For email sign-up, use <button type="button" onClick={handleGoogleSignIn} className="text-gold font-semibold hover:text-gold-dark">Google</button> or switch to <button type="button" onClick={switchToPhone} className="text-gold font-semibold hover:text-gold-dark">Phone</button>.
                  </div>
                )}

                {authMethod === 'google-email' && !isSignUp && (
                  <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-2">Email</label>
                      <input ref={emailRef} type="email" placeholder="you@example.com"
                        className={"w-full px-4 py-3.5 rounded-2xl border-2 text-charcoal placeholder:text-gray-400 focus:outline-none transition-colors " + (showEmailError ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-gold")}
                        value={email} onChange={(e) => { submitAttempted.current = false; setEmail(e.target.value) }}
                        onBlur={handleEmailBlur} onFocus={handleEmailFocus} required />
                      {showEmailError && emailError && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><span>⚠️</span> {emailError}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-2">Password</label>
                      <input ref={passwordRef} type="password" placeholder="Your password"
                        className={"w-full px-4 py-3.5 rounded-2xl border-2 text-charcoal placeholder:text-gray-400 focus:outline-none transition-colors " + (showPasswordError ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-gold")}
                        value={password} onChange={(e) => { submitAttempted.current = false; setPassword(e.target.value) }}
                        onBlur={handlePasswordBlur} onFocus={handlePasswordFocus} required />
                      {showPasswordError && passwordError && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><span>⚠️</span> {passwordError}</p>}
                    </div>
                    <button type="submit" disabled={loading}
                      className="w-full bg-charcoal text-white py-4 rounded-2xl font-semibold hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-charcoal/20 flex items-center justify-center gap-2 group">
                      {loading ? <span>Logging in...</span> : <><span>Log In</span><span className="group-hover:translate-x-1 transition-transform">→</span></>}
                    </button>
                  </form>
                )}

                {authMethod === 'phone' && !otpSent && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-2">Your Name</label>
                      <input type="text" placeholder="e.g., Kwame Adjei"
                        className="w-full px-4 py-3.5 rounded-2xl border-2 border-gray-200 focus:border-gold text-charcoal placeholder:text-gray-400 focus:outline-none transition-colors"
                        value={phoneName} onChange={(e) => setPhoneName(e.target.value)} />
                      <p className="text-xs text-gray-400 mt-2">This will be your display name on Campus Plug.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-2">Phone number</label>
                      <div className="flex gap-2">
                        <span className="flex items-center px-3 rounded-2xl border-2 border-gray-200 bg-gray-50 text-sm font-semibold text-charcoal shrink-0">🇬🇭 +233</span>
                        <input ref={phoneRef} type="tel" placeholder="24 123 4567"
                          className={"flex-1 px-4 py-3.5 rounded-2xl border-2 text-charcoal placeholder:text-gray-400 focus:outline-none transition-colors " + (showPhoneError ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-gold")}
                          value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                          onBlur={handlePhoneBlur} onFocus={handlePhoneFocus} />
                      </div>
                      {showPhoneError && phoneError && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><span>⚠️</span> {phoneError}</p>}
                      <p className="text-xs text-gray-400 mt-2">Enter your Ghana mobile number. We&apos;ll send a 6-digit code.</p>
                    </div>
                    <button type="button" onClick={handleSendOtp} disabled={loading}
                      className="w-full bg-charcoal text-white py-4 rounded-2xl font-semibold hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-charcoal/20 flex items-center justify-center gap-2 group">
                      {loading ? <span>Sending code...</span> : <><span>Send Code</span><span className="group-hover:translate-x-1 transition-transform">→</span></>}
                    </button>
                  </div>
                )}

                {authMethod === 'phone' && otpSent && (
                  <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
                    <div className="p-3 rounded-2xl bg-gold/10 border border-gold/20 text-sm text-charcoal">
                      Code sent to <span className="font-semibold">{formatPhoneDisplay(formatPhoneForSupabase(phoneNumber))}</span>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-2">6-digit code</label>
                      <input ref={otpRef} type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                        className={"w-full px-4 py-3.5 rounded-2xl border-2 text-charcoal placeholder:text-gray-400 focus:outline-none transition-colors text-center text-2xl tracking-[0.3em] font-mono " + (showOtpError ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-gold")}
                        value={otpCode}
                        onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 6); setOtpCode(v); setOtpError(null) }}
                        onBlur={handleOtpBlur} onFocus={handleOtpFocus} />
                      {showOtpError && otpError && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><span>⚠️</span> {otpError}</p>}
                    </div>
                    <button type="submit" disabled={loading || otpCode.replace(/[^0-9]/g, '').length !== 6}
                      className="w-full bg-charcoal text-white py-4 rounded-2xl font-semibold hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-charcoal/20 flex items-center justify-center gap-2 group">
                      {loading ? <span>Verifying...</span> : <><span>Verify &amp; Continue</span><span className="group-hover:translate-x-1 transition-transform">→</span></>}
                    </button>
                    <div className="text-center">
                      {countdown > 0 ? (
                        <p className="text-sm text-gray-500">Resend code in <span className="font-semibold text-charcoal">{countdown}s</span></p>
                      ) : (
                        <button type="button" onClick={handleResendOtp} disabled={loading}
                          className="text-sm text-gold hover:text-gold-dark font-semibold transition-colors">Resend code</button>
                      )}
                    </div>
                    <div className="text-center">
                      <button type="button" onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(null); setOtpTouched(false) }}
                        className="text-sm text-gray-500 hover:text-charcoal transition-colors">← Change phone number</button>
                    </div>
                  </form>
                )}

            {isSignUp && authMethod === 'google-email' && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-gold/10 via-gold/5 to-transparent border border-gold/20 mb-4">
                <div className="flex gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">Quick &amp; secure</p>
                    <p className="text-xs text-gray-600 mt-1">Sign up in 2 clicks with your Google account. No passwords to remember.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 text-center">
              <button type="button" onClick={toggleMode} className="text-sm text-gray-600 hover:text-charcoal transition-colors">
                {isSignUp ? 'Already have an account? Log in' : "New to Campus Plug? Sign up"}
              </button>
            </div>

            <div className="mt-8 text-center">
              <Link href="/" className="text-sm text-gray-500 hover:text-charcoal transition-colors inline-flex items-center gap-1 group">
                <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to home
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
