'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatName } from '@/lib/formatName'
import { formatPrice } from '@/lib/format'
import NavBar from '@/app/components/NavBar'
import { getPayoutSummary, getSellerPayouts, type PayoutTransaction } from '@/lib/payouts'

export default function SellerPayoutsPage() {
  const [summary, setSummary] = useState<{
    total_earned: number
    held_in_escrow: number
    available_to_withdraw: number
    transaction_count: number
  } | null>(null)
  const [payouts, setPayouts] = useState<PayoutTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()

  const loadPayouts = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)

      const [summaryResult, payoutsResult] = await Promise.all([
        getPayoutSummary(user.id),
        getSellerPayouts(user.id),
      ])

      setSummary(summaryResult)
      setPayouts(payoutsResult)
      setError(null)
    } catch (err) {
      console.error('Failed to load payouts:', err)
      setError('Could not load your payouts. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    let cancelled = false
    if (!cancelled) {
      ;(async () => {
        await loadPayouts()
      })()
    }
    return () => { cancelled = true }
  }, [loadPayouts])

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" />
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <div className="space-y-4">
              <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
              <div className="h-12 bg-white/10 rounded-xl w-3/4 mb-3 animate-pulse" />
              <div className="h-5 bg-white/10 rounded-lg w-1/2 animate-pulse" />
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (error || !userId) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" back={{ href: '/dashboard', label: 'Back to dashboard' }} />
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
            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                {error}
              </div>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-ink text-white px-5 py-2 rounded-full font-semibold hover:bg-black transition-colors"
            >
              ← Back to dashboard
            </button>
          </div>
        </section>
      </main>
    )
  }

  const held = summary!.held_in_escrow
  const earned = summary!.total_earned

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" back={{ href: '/dashboard', label: 'Back to dashboard' }} />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Payouts</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Your <span className="font-serif-accent italic text-gold">earnings</span>
              </h1>
            </div>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

          {/* Summary cards */}
          <div className="grid gap-6 sm:grid-cols-3 mb-10">
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Total earned</p>
              <p className="text-3xl font-bold text-gold-dark">{formatPrice(earned)}</p>
              <p className="text-xs text-ink-muted mt-2">Released to you after delivery confirmed</p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Held in escrow</p>
              <p className="text-3xl font-bold text-ink">{formatPrice(held)}</p>
              <p className="text-xs text-ink-muted mt-2">Paid by buyers, awaiting delivery confirmation</p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Platform fee (5%)</p>
              <p className="text-3xl font-bold text-ink-muted">
                {formatPrice((earned / 19) * 1)}
              </p>
              <p className="text-xs text-ink-muted mt-2">Deducted automatically from each sale</p>
            </div>
          </div>

          {/* Transaction list */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Transactions</p>
              {summary!.transaction_count === 0 && (
                <p className="text-xs text-ink-muted">No transactions yet</p>
              )}
            </div>

            {payouts.length === 0 ? (
              <div className="p-8 text-center text-ink-muted">
                <p>No payouts yet. Make your first sale and the buyer’s payment will show here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payouts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-rule bg-white"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gold-soft flex items-center justify-center text-gold-dark shrink-0">
                        {p.order_title?.charAt(0).toUpperCase() || 'O'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-charcoal truncate">
                          {p.order_title || 'Order'}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                          Buyer: {formatName(p.buyer_name || 'Unknown')}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${
                        p.status === 'released' ? 'text-green-600' :
                        p.status === 'paid' ? 'text-ink' :
                        'text-ink-muted'
                      }`}>
                        {p.status === 'released' ? '+' : ''}{formatPrice(p.seller_receives)}
                      </p>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                        p.status === 'released'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : p.status === 'paid'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-white/50 text-ink-muted border border-white/20'
                      }`}>
                        {p.status === 'released' ? 'Released' :
                          p.status === 'paid' ? 'Held' : p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </section>
    </main>
  )
}
