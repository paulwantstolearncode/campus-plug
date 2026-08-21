'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function BecomeSellerPage() {
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState<'form' | 'pending'>('form')
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
          .select('is_seller, seller_status, whatsapp_number')
          .eq('id', user.id)
          .single()

        // Treat legacy rows (is_seller true, seller_status NULL — created before
        // the manual-approval flow) as already verified, so revisiting this page
        // doesn't silently downgrade them to 'pending' and put them back in the
        // admin queue. Rejected sellers (is_seller false) fall through to reapply.
        if (profile?.is_seller && profile?.seller_status !== 'pending') {
          alert('You are already a verified seller!')
          router.push('/')
          return
        }

        if (profile?.seller_status === 'pending' && profile?.whatsapp_number) {
          setStatus('pending')
        }

        if (profile?.whatsapp_number) {
          setWhatsapp(profile.whatsapp_number)
        }
      } catch (err) {
        // A failed auth/profile lookup must not strand the page on the
        // 'Loading...' screen forever — show the form; the submit path
        // re-checks the session anyway.
        console.error('Could not check seller status:', err)
      }

      setChecking(false)
    }

    checkAuth()
  }, [router])

  const validateWhatsApp = (number: string): boolean => {
    const digits = number.replace(/\D/g, '')
    if (digits.length === 10 && digits.startsWith('0')) return true
    if (digits.length === 12 && digits.startsWith('233')) return true
    // 9 digits without a leading 0 (e.g. 244123456 = 0244123456). A 9-digit
    // number starting with 0 is a truncated 10-digit input — reject it, since
    // formatWhatsApp would otherwise store the invalid "2330..." form.
    if (digits.length === 9 && !digits.startsWith('0')) return true
    return false
  }

  const formatWhatsApp = (number: string): string => {
    const digits = number.replace(/\D/g, '')
    if (digits.length === 10 && digits.startsWith('0')) return '233' + digits.slice(1)
    if (digits.length === 9) return '233' + digits
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

      // .update() silently matches 0 rows when no profile row exists (e.g.
      // accounts created before the handle_new_user trigger was deployed) and
      // then "succeeds" — the user would see 'Application received' while
      // nothing lands in the admin review queue. Detect the 0-row match and
      // create the row in that case.
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          whatsapp_number: formattedNumber,
          seller_status: 'pending',
        })
        .eq('id', user.id)
        .select('id')

      if (error) {
        alert('Something went wrong. Please try again.')
        console.error(error)
      } else if (!updated || updated.length === 0) {
        const { error: insertError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: user.id,
              whatsapp_number: formattedNumber,
              seller_status: 'pending',
              is_seller: false,
            },
            { onConflict: 'id' }
          )

        if (insertError) {
          alert('Something went wrong. Please try again.')
          console.error(insertError)
        } else {
          setWhatsapp(formattedNumber)
          setStatus('pending')
        }
      } else {
        // Show the formatted international number on the confirmation screen
        // instead of the raw local-format input (e.g. "+0244 123 456").
        setWhatsapp(formattedNumber)
        setStatus('pending')
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
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back
          </Link>
        </div>
      </nav>

      <section className="relative pt-32 pb-16 md:pt-40 md:pb-20 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px'}}></div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">
            {status === 'pending' ? 'Verification In Progress' : 'Apply to be a Seller'}
          </div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
            {status === 'pending' ? (<>You&apos;re on<br /><span className="gradient-text">the list</span></>) : (<>Your side hustle deserves<br />a <span className="gradient-text">better front door.</span></>)}
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70 max-w-xl mx-auto">
            {status === 'pending'
              ? 'We personally verify every seller to keep Campus Plug safe and trusted.'
              : 'Campus Plug helps you reach students looking for exactly what you do — while keeping the community intentional, verified, and easy to navigate.'}
          </p>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-8">
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6">

          <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-gray-100">

            {status === 'pending' ? (
              <div className="text-center space-y-6">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center text-4xl shadow-lg shadow-gold/30">
                  ⏳
                </div>

                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-2">Application received</h2>
                  <p className="text-gray-500">We&apos;ll WhatsApp you within 24 hours to verify and welcome you aboard.</p>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-gold/10 to-transparent border border-gold/20 text-left">
                  <div className="flex gap-3">
                    <span className="text-xl">💬</span>
                    <div>
                      <p className="text-sm font-semibold text-charcoal">What happens next</p>
                      <ul className="text-xs text-gray-600 mt-2 space-y-1">
                        <li>• Our team will WhatsApp you at <strong>+{whatsapp}</strong></li>
                        <li>• We&apos;ll verify you&apos;re a real person</li>
                        <li>• Once approved, you can post listings immediately</li>
                        <li>• Usually takes less than 24 hours</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-green-50 to-transparent border border-green-200 text-left">
                  <div className="flex gap-3">
                    <span className="text-xl">✨</span>
                    <div>
                      <p className="text-sm font-semibold text-charcoal">Why we do this</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Every seller and listing is personally reviewed. This keeps Campus Plug free from scams and ensures buyers can trust what they see.
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  href="/"
                  className="inline-flex items-center gap-2 bg-charcoal text-white px-8 py-4 rounded-full font-semibold hover:bg-black transition-all hover:scale-105 shadow-xl group"
                >
                  Browse Campus Plug
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-3xl mb-4 shadow-lg shadow-green-500/30">
                    💬
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-2">Your WhatsApp Number</h2>
                  <p className="text-gray-500">We&apos;ll reach out here to welcome you and verify your account.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                    WhatsApp Number for Buyers
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">🇬🇭</span>
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
                    Buyers will message this number on WhatsApp to book your services.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-gold/10 via-gold/5 to-transparent border border-gold/20">
                  <div className="flex gap-3">
                    <span className="text-xl">🤝</span>
                    <div>
                      <p className="text-sm font-semibold text-charcoal">Personally verified</p>
                      <p className="text-xs text-gray-600 mt-1">
                        We hand-verify every seller within 24 hours. This keeps Campus Plug premium and trusted.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['Free to apply', 'Manual review', 'WhatsApp-first enquiries', 'You control your terms'].map((point) => (
                    <div key={point} className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/20">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-gold text-charcoal flex items-center justify-center text-xs font-bold">✓</span>
                      <span className="text-sm font-semibold text-charcoal">{point}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full shine-button text-charcoal py-5 rounded-2xl font-bold text-lg hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-gold/25 flex items-center justify-center gap-2 group"
                >
                  {loading ? (<span>Submitting...</span>) : (<><span>Apply to list your service</span><span className="group-hover:translate-x-1 transition-transform">→</span></>)}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}