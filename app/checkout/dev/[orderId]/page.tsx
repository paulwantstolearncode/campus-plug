'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import NavBar from '@/app/components/NavBar'

// Dev-only completion page. Simulates MoMo payment success/failure when
// NEXT_PUBLIC_MOMO_API_KEY is not set (sandbox mode). In production this
// route is unreachable — real providers POST to /api/momo/webhook instead.
export default function DevCheckoutPage() {
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed'>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const rawId = params.orderId
  const id = Array.isArray(rawId) ? rawId[0] : rawId

  useEffect(() => {
    let cancelled = false
    if (!cancelled) {
      ;(async () => {
        if (id) {
          const urlStatus = new URLSearchParams(window.location.search).get('status')
          if (urlStatus === 'paid') setStatus('paid')
          else if (urlStatus === 'failed') setStatus('failed')
        }
        if (!cancelled) setLoading(false)
      })()
    }
    return () => { cancelled = true }
  }, [id])

  const completePayment = async () => {
    if (!id) return
    setLoading(true)
    try {
      // Call the record_payment RPC with a simulated reference
      const { error } = await supabase.rpc('record_payment', {
        p_order_id: id,
        p_mo_mo_reference: 'dev_sim_' + id,
        p_amount: 0, // amount filled by the order itself via RPC? No — RPC takes amount
      })

      if (error) throw error

      // Refresh order page
      router.push('/orders/' + id)
    } catch (err) {
      console.error('Dev payment completion failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to complete payment')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" />
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <div className="space-y-4">
              <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
              <div className="h-12 bg-white/10 rounded-xl w-3/4 mb-3 animate-pulse" />
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" back={{ href: '/checkout/' + id, label: 'Back to checkout' }} />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="space-y-4">
            <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
            <div className="h-12 bg-white/10 rounded-xl w-3/4 mb-3 animate-pulse" />
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
          {status === 'pending' && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-12 text-center border border-gold/50">
              <div className="text-6xl mb-4">📱</div>
              <h2 className="text-3xl font-bold text-charcoal mb-4">Approve the STK prompt</h2>
              <p className="text-ink-muted mb-8">
                We’ve sent a Mobile Money prompt to your phone. Approve it to pay
                <span className="text-gold-dark font-bold">{formatPrice(0)}</span> for this order.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={completePayment}
                  className="flex items-center justify-center gap-2 bg-gold text-charcoal px-8 py-4 rounded-full font-bold hover:bg-gold-dark transition-all shadow-lg shadow-gold/30"
                >
                  ✅ I approved on my phone
                </button>
                <button
                  onClick={() => router.push('/orders/' + id)}
                  className="flex items-center justify-center gap-2 bg-white border-2 border-rule text-charcoal px-8 py-4 rounded-full font-bold hover:bg-white/90 transition-colors"
                >
                  ❌ Cancel payment
                </button>
              </div>
              {error && (
                <p className="mt-4 text-red-600 text-sm font-medium">{error}</p>
              )}
            </div>
          )}

          {status === 'paid' && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-12 text-center border border-green-200">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-3xl font-bold text-charcoal mb-4">Payment received</h2>
              <p className="text-ink-muted mb-8">
                Your order has been marked as paid. The seller can now start
                preparing your item/service.
              </p>
              <button
                onClick={() => router.push('/orders/' + id)}
                className="flex items-center justify-center gap-2 bg-charcoal text-white px-8 py-4 rounded-full font-bold hover:bg-black transition-colors"
              >
                View order →
              </button>
            </div>
          )}

          {status === 'failed' && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-12 text-center border border-red-200">
              <div className="text-6xl mb-4">❌</div>
              <h2 className="text-3xl font-bold text-charcoal mb-4">Payment failed</h2>
              <p className="text-ink-muted mb-8">
                The MoMo payment didn’t go through. Please try again.
              </p>
              <button
                onClick={() => router.push('/checkout/' + id)}
                className="flex items-center justify-center gap-2 bg-charcoal text-white px-8 py-4 rounded-full font-bold hover:bg-black transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
