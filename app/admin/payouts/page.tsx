'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { COMMISSION_RATE } from '@/lib/commerceConfig'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import {
  getAllPayouts,
  getAdminPayoutSummary,
  type AdminPayoutTransaction,
} from '@/lib/adminPayouts'
import { getOpenDisbursements, type Disbursement } from '@/lib/wallet'

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<AdminPayoutTransaction[]>([])
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [summary, setSummary] = useState<{
    total_platform_fees: number
    total_seller_earnings: number
    held_in_escrow: number
    total_transactions: number
    pending_count: number
    released_count: number
  } | null>(null)
  const [sellerNames, setSellerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const loadPayouts = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Admin gate
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      if (!profile?.is_admin) {
        router.push('/dashboard')
        return
      }

      setLoading(true)
      const [summaryResult, payoutsResult, disbursementsResult] = await Promise.all([
        getAdminPayoutSummary(),
        getAllPayouts(),
        getOpenDisbursements(),
      ])

      setSummary(summaryResult)
      setPayouts(payoutsResult)
      setDisbursements(disbursementsResult)

      // Fetch seller names for display
      const sellerIds = [
        ...new Set([
          ...payoutsResult.map((p) => p.seller_id),
          ...disbursementsResult.map((d) => d.seller_id),
        ].filter(Boolean)),
      ]
      if (sellerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', sellerIds)
        const names: Record<string, string> = {}
        for (const p of (profiles || [])) {
          names[p.id] = p.full_name || 'Unknown'
        }
        setSellerNames(names)
      }

      setError(null)
    } catch (err) {
      console.error('Failed to load admin payouts:', err)
      setError('Could not load payouts. Please try again.')
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

  const handleSend = async (id: string) => {
    setSendingId(id)
    setNotice(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setNotice({ kind: 'error', text: 'Your session expired. Please sign in again.' })
        return
      }

      const res = await fetch('/api/momo/disburse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ disbursementId: id }),
      })
      const data = (await res.json()) as { status?: string; error?: string }

      if (!res.ok) {
        setNotice({ kind: 'error', text: data.error || 'Could not send the transfer.' })
        return
      }

      setNotice({
        kind: 'ok',
        text:
          data.status === 'paid'
            ? 'Transfer sent and recorded in the seller wallet.'
            : 'Transfer accepted by the provider. Press Re-check shortly to confirm.',
      })
      await loadPayouts()
    } catch (err) {
      console.error('Disbursement request failed:', err)
      setNotice({ kind: 'error', text: 'Could not send the transfer. Please try again.' })
    } finally {
      setSendingId(null)
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
              <div className="h-5 bg-white/10 rounded-lg w-1/2 animate-pulse" />
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" back={{ href: '/admin', label: 'Back to admin' }} />
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
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="bg-ink text-white px-5 py-2 rounded-full font-semibold hover:bg-black transition-colors"
            >
              ← Back to admin
            </button>
          </div>
        </section>
      </main>
    )
  }

  const s = summary!

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" back={{ href: '/admin', label: 'Back to admin' }} />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Payouts</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Marketplace <span className="font-serif-accent italic text-gold">payouts</span>
              </h1>
            </div>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8">

          {/* Platform summary */}
          <div className="grid gap-6 sm:grid-cols-4 mb-10">
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Platform fees</p>
              <p className="text-3xl font-bold text-gold-dark">{formatPrice(s.total_platform_fees)}</p>
              <p className="text-xs text-ink-muted mt-2">{Math.round(COMMISSION_RATE * 100)}% collected on every sale</p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Seller earnings</p>
              <p className="text-3xl font-bold text-ink">{formatPrice(s.total_seller_earnings)}</p>
              <p className="text-xs text-ink-muted mt-2">Released to sellers after delivery</p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Held in escrow</p>
              <p className="text-3xl font-bold text-ink-muted">{formatPrice(s.held_in_escrow)}</p>
              <p className="text-xs text-ink-muted mt-2">Paid, awaiting delivery confirmation</p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Transactions</p>
              <p className="text-3xl font-bold text-charcoal">{s.total_transactions}</p>
              <p className="text-xs text-ink-muted mt-2">
                {s.pending_count} pending · {s.released_count} released
              </p>
            </div>
          </div>

          {notice && (
            <div
              className={`mb-6 p-4 rounded-2xl text-sm font-medium border ${
                notice.kind === 'ok'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {notice.text}
            </div>
          )}

          {/* Pending disbursements: seller payouts + buyer refunds */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-gold/40 mb-8">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Pending transfers</p>
              {disbursements.length === 0 && (
                <p className="text-xs text-ink-muted">Nothing waiting</p>
              )}
            </div>

            {disbursements.length === 0 ? (
              <div className="p-6 text-center text-ink-muted text-sm">
                No payouts or refunds are waiting to be sent.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-rule">
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Type</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Seller</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">MoMo</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Network</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest text-right">Amount</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Status</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {disbursements.map((d) => (
                      <tr key={d.id} className="hover:bg-white/50 transition-colors">
                        <td className="py-3 text-sm text-charcoal font-semibold">
                          {d.kind === 'seller_payout' ? 'Payout' : 'Refund'}
                        </td>
                        <td className="py-3 text-sm text-charcoal">
                          {formatName(sellerNames[d.seller_id] || 'Unknown')}
                        </td>
                        <td className="py-3 text-sm text-ink font-mono">
                          {d.momo_phone.slice(0, 3)}•••{d.momo_phone.slice(-2)}
                        </td>
                        <td className="py-3 text-sm text-ink uppercase">{d.provider}</td>
                        <td className="py-3 text-sm text-right font-semibold">{formatPrice(d.amount)}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            d.status === 'processing'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {d.status === 'processing' ? 'Processing' : 'Requested'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleSend(d.id)}
                            disabled={sendingId === d.id}
                            className="bg-gold text-charcoal px-4 py-2 rounded-full text-xs font-bold hover:bg-gold-dark transition-colors disabled:opacity-50"
                          >
                            {sendingId === d.id
                              ? 'Sending…'
                              : d.status === 'processing'
                                ? 'Re-check'
                                : 'Send'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Transaction table */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest">All transactions</p>
              {payouts.length === 0 && (
                <p className="text-xs text-ink-muted">No transactions yet</p>
              )}
            </div>

            {payouts.length === 0 ? (
              <div className="p-8 text-center text-ink-muted">
                <p>No marketplace transactions yet. Sales will appear here as buyers pay with MoMo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-rule">
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Order</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Buyer</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Seller</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest text-right">Amount</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest text-right">Platform fee</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest text-right">Seller receives</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest">Status</th>
                      <th className="pb-3 text-xs font-bold text-charcoal uppercase tracking-widest text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-white/50 transition-colors">
                        <td className="py-3 text-sm text-charcoal font-semibold">{p.order_title || 'Order'}</td>
                        <td className="py-3 text-sm text-ink">{formatName(p.buyer_name || 'Unknown')}</td>
                        <td className="py-3 text-sm text-charcoal font-medium">{formatName(sellerNames[p.seller_id] || 'Unknown')}</td>
                        <td className="py-3 text-sm text-right text-charcoal">{formatPrice(p.amount)}</td>
                        <td className="py-3 text-sm text-right text-ink-muted">-{formatPrice(p.platform_fee)}</td>
                        <td className="py-3 text-sm text-right font-semibold">{formatPrice(p.seller_receives)}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            p.status === 'released'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : p.status === 'paid'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : p.status === 'failed'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-white/50 text-ink-muted border border-white/20'
                          }`}>
                            {p.status === 'released' ? 'Released' :
                              p.status === 'paid' ? 'Held' :
                              p.status === 'failed' ? 'Failed' : 'Pending'}
                          </span>
                        </td>
                        <td className="py-3 text-sm text-right text-ink-muted font-mono">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </section>
    </main>
  )
}
