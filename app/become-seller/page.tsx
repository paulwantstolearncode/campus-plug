'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function BecomeSellerPage() {
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_seller, whatsapp_number')
          .eq('id', user.id)
          .single()

        if (profile?.is_seller) {
          alert('You are already a verified seller!')
          router.push('/')
          return
        }

        if (profile?.whatsapp_number) {
          setWhatsapp(profile.whatsapp_number)
        }
      } catch (err) {
        // A failed auth/profile lookup must not strand the page on the
        // 'Loading...' screen forever.
        console.error('Could not check seller status:', err)
        router.push('/login')
        return
      }

      // Only reached when we're keeping the visitor here — never flash the
      // form to someone being redirected away.
      setChecking(false)
    }

    checkAuth()
  }, [router])

  const validateWhatsApp = (number: string): boolean => {
    const digits = number.replace(/\D/g, '')
    if (digits.length === 10 && digits.startsWith('0')) return true
    if (digits.length === 12 && digits.startsWith('233')) return true
    // 9 digits without a leading 0 (e.g. 244123456 = 0244123456). A 9-digit
    // number starting with 0 is a truncated 10-digit input — reject it.
    if (digits.length === 9 && !digits.startsWith('0')) return true
    return false
  }

  const formatWhatsApp = (number: string): string => {
    const digits = number.replace(/\D/g, '')
    if (digits.length === 10 && digits.startsWith('0')) {
      return '233' + digits.slice(1)
    }
    if (digits.length === 9) {
      return '233' + digits
    }
    return digits
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateWhatsApp(whatsapp)) {
      alert('Please enter a valid Ghana WhatsApp number\n\nExamples:\n0244123456\n+233244123456')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const formattedNumber = formatWhatsApp(whatsapp)

      // Upsert rather than update: signup does not create a profile row, so
      // .update() would silently match 0 rows, 'succeed', and then /new would
      // bounce the user back here forever. Upsert creates the row if missing.
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            whatsapp_number: formattedNumber,
            is_seller: true,
          },
          { onConflict: 'id' }
        )

      if (error) {
        alert('Something went wrong. Please try again.')
        console.error(error)
      } else {
        alert('🎉 You are now a verified seller!\n\nYou can now post listings.')
        router.push('/new')
      }
    } catch (err) {
      console.error(err)
      alert('Something went wrong.')
    }

    setLoading(false)
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-charcoal">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>

          <Link
            href="/"
            className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-20 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
        </div>

        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        ></div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">
            Become a Seller
          </div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
            Ready to start<br />
            <span className="gradient-text">earning?</span>
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70 max-w-xl mx-auto">
            Add your WhatsApp number so buyers can reach you. That&apos;s it.
          </p>
        </div>
      </section>

      {/* Form + Benefits */}
      <section className="relative pb-24 md:pb-32 bg-off-white -mt-8">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

          <div className="grid lg:grid-cols-5 gap-6 md:gap-8">

            {/* LEFT — Form (3 cols) */}
            <div className="lg:col-span-3">
              <form
                onSubmit={handleSubmit}
                className="relative bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-gray-100"
              >
                {/* Header */}
                <div className="mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-3xl mb-4 shadow-lg shadow-green-500/30">
                    💬
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-2">
                    Add your WhatsApp
                  </h2>
                  <p className="text-gray-500">
                    Buyers will contact you here to arrange purchases and bookings.
                  </p>
                </div>

                {/* WhatsApp Input */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                    WhatsApp Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">
                      🇬🇭
                    </span>
                    <input
                      type="tel"
                      placeholder="0244 123 456"
                      className="w-full pl-16 pr-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <span>ℹ️</span>
                    Ghana numbers only. This will be visible on your listings.
                  </p>
                </div>

                {/* Trust badge */}
                <div className="mb-8 p-4 rounded-2xl bg-gradient-to-br from-gold/10 via-gold/5 to-transparent border border-gold/20">
                  <div className="flex gap-3">
                    <span className="text-xl">🔒</span>
                    <div>
                      <p className="text-sm font-semibold text-charcoal">Your privacy matters</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Only shown on your active listings. Never spammed or sold.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full shine-button text-charcoal py-5 rounded-2xl font-bold text-lg hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-gold/25 flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <span>Become a Seller</span>
                      <span className="group-hover:translate-x-1 transition-transform">🚀</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* RIGHT — Benefits (2 cols) */}
            <div className="lg:col-span-2">
              <div className="sticky top-24">

                {/* Big highlight card */}
                <div className="relative overflow-hidden bg-gradient-to-br from-charcoal to-gray-900 rounded-3xl p-8 text-white mb-4 border border-white/10">
                  <div className="absolute inset-0 opacity-30">
                    <div className="blob absolute top-10 right-10 w-40 h-40 bg-gold/40 rounded-full blur-3xl"></div>
                  </div>

                  <div className="relative">
                    <div className="text-4xl mb-4">✨</div>
                    <h3 className="text-2xl font-bold mb-2">
                      Why sell on<br />
                      <span className="gradient-text">Campus Plug?</span>
                    </h3>
                    <p className="text-sm text-white/60">
                      Everything you need. Nothing you don&apos;t.
                    </p>
                  </div>
                </div>

                {/* Benefits list */}
                <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100 space-y-4">
                  {[
                    { icon: '💰', title: '0% signup fees', desc: 'Completely free to start' },
                    { icon: '📱', title: 'WhatsApp built-in', desc: 'Buyers contact you directly' },
                    { icon: '🎯', title: 'Set your own prices', desc: 'You control everything' },
                    { icon: '🚀', title: 'Instant setup', desc: 'Start selling in 60 seconds' },
                  ].map((benefit) => (
                    <div key={benefit.title} className="flex gap-3 items-start">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center shrink-0 text-lg">
                        {benefit.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-charcoal text-sm">{benefit.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{benefit.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>
    </main>
  )
}
