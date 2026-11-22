'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import NavBar from '@/app/components/NavBar'
import {
  getSellerDisbursements,
  getWalletEntries,
  getWalletOverview,
  requestPayout,
  cancelPayout,
  type Disbursement,
  type WalletEntry,
  type WalletOverview,
} from '@/lib/wallet'
import { momoProviderForPhone, type MomoProvider } from '@/lib/momo'

interface ProviderOption {
  id: MomoProvider
  label: string
}

export default function SellerPayoutsPage() {
  const [overview, setOverview] = useState<WalletOverview | null>(null)
  const [entries, setEntries] = useState<WalletEntry[]>([])
  const [payouts, setPayouts] = useState<Disbursement[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [provider, setProvider] = useState<MomoProvider>('mtn')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
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

      const [overviewResult, entriesResult, payoutsResult, profileResult, providersResult] =
        await Promise.all([
          getWalletOverview(user.id),
          getWalletEntries(user.id),
          getSellerDisbursements(user.id),
          supabase.from('profiles').select('whatsapp_number').eq('id', user.id).single(),
          fetch('/api/momo/initiate').then((res) => (res.ok ? res.json() : null)).catch(() => null),
        ])

      setOverview(overviewResult)
      setEntries(entriesResult)
      setPayouts(payoutsResult.filter((p) => p.kind === 'seller_payout'))

      const available: ProviderOption[] = providersResult?.providers?.length
        ? (providersResult.providers as ProviderOption[])
        : [{ id: 'mtn', label: 'MTN Mobile Money' }]
      setProviders(available)

      if (!phone && profileResult.data?.whatsapp_number) {
        const detected = profileResult.data.whatsapp_number
        const detectedProvider = momoProviderForPhone(detected)
        setPhone(detected)
        setProvider(
          available.some((p) => p.id === detectedProvider)
            ? detectedProvider
            : available[0].id
        )
      }

      setError(null)
    } catch (err) {
      console.error('Failed to load payouts:', err)
      setError('Could not load your payouts. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router, phone])

  useEffect(() => {
    let cancelled = false
    if (!cancelled) {
      ;(async () => {
        await loadPayouts()
      })()
    }
    return () => { cancelled = true }
    // Intentionally runs once per mount; loadPayouts is re-created when phone
    // changes and re-running here would refetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overview) return

    const value = Number(amount)
    if (!value || value <= 0) {
      setNotice({ kind: 'error', text: 'Enter an amount greater than zero.' })
      return
    }
    if (value > overview.available) {
      setNotice({ kind: 'error', text: 'That is more than your available balance.' })
      return
    }
    if (phone.replace(/[^0-9]/g, '').length < 9) {
      setNotice({ kind: 'error', text: 'Enter the phone number linked to your MoMo wallet.' })
      return
    }

    setSubmitting(true)
    setNotice(null)

    const { id, error: rpcError } = await requestPayout({ amount: value, phone, provider })
    if (rpcError || !id) {
      setNotice({ kind: 'error', text: rpcError || 'Could not request the payout.' })
      setSubmitting(false)
      return
    }

    setAmount('')
    setNotice({ kind: 'ok', text: 'Payout requested. We’ll send it to your MoMo wallet.' })
    await loadPayouts()
    setSubmitting(false)
  }

  const handleCancel = async (id: string) => {
    const { error: rpcError } = await cancelPayout(id)
    if (rpcError) {
      setNotice({ kind: 'error', text: rpcError })
      return
    }
    setNotice({ kind: 'ok', text: 'Payout cancelled.' })
    await loadPayouts()
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

  if (error || !userId || !overview) {
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

  const pendingPayouts = payouts.filter(
    (p) => p.status === 'requested' || p.status === 'processing'
  )

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" back={{ href: '/dashboard', label: 'Back to dashboard' }} />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Wallet</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Your <span className="font-serif-accent italic text-gold">earnings</span>
              </h1>
            </div>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

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

          {/* Summary cards */}
          <div className="grid gap-6 sm:grid-cols-3 mb-10">
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Available to withdraw</p>
              <p className="text-3xl font-bold text-gold-dark">{formatPrice(overview.available)}</p>
              <p className="text-xs text-ink-muted mt-2">
                {overview.pending_payouts > 0
                  ? `${formatPrice(overview.pending_payouts)} already requested`
                  : 'Released sales, ready to cash out'}
              </p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Held in escrow</p>
              <p className="text-3xl font-bold text-ink">{formatPrice(overview.held_in_escrow)}</p>
              <p className="text-xs text-ink-muted mt-2">Paid by buyers, awaiting delivery confirmation</p>
            </div>
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Paid out to date</p>
              <p className="text-3xl font-bold text-ink-muted">{formatPrice(overview.lifetime_paid_out)}</p>
              <p className="text-xs text-ink-muted mt-2">Lifetime earnings {formatPrice(overview.lifetime_released)}</p>
            </div>
          </div>

          {/* Withdraw */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule mb-8">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-4">Withdraw to Mobile Money</p>
            <form onSubmit={handleWithdraw} className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                  Amount (GH₵)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={overview.available > 0 ? String(overview.available) : '0.00'}
                  className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                  MoMo number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9+]/g, '')
                    setPhone(next)
                    if (next.replace(/[^0-9]/g, '').length >= 9) {
                      setProvider(momoProviderForPhone(next))
                    }
                  }}
                  placeholder="024xxxxxxx"
                  className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                  Network
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as MomoProvider)}
                  className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all font-semibold"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-ink-muted">
                  Payouts are sent by the Campus Plug team, usually within one business day.
                </p>
                <button
                  type="submit"
                  disabled={submitting || overview.available <= 0}
                  className="bg-gold text-charcoal px-6 py-3 rounded-full font-bold text-sm hover:bg-gold-dark transition-colors disabled:opacity-50 shadow-lg shadow-gold/30"
                >
                  {submitting ? 'Requesting…' : 'Request payout'}
                </button>
              </div>
            </form>
          </div>

          {/* Pending payouts */}
          {pendingPayouts.length > 0 && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule mb-8">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-4">Payout requests</p>
              <div className="space-y-3">
                {pendingPayouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rule bg-white">
                    <div className="min-w-0">
                      <p className="font-semibold text-charcoal">{formatPrice(p.amount)}</p>
                      <p className="text-xs text-ink-muted truncate">
                        {p.momo_phone.slice(0, 3)}•••{p.momo_phone.slice(-2)} · {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {p.status === 'requested' ? 'Requested' : 'Processing'}
                      </span>
                      {p.status === 'requested' && (
                        <button
                          onClick={() => handleCancel(p.id)}
                          className="text-xs font-semibold text-ink-muted hover:text-red-600 px-2 py-1 rounded-full"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ledger */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Wallet activity</p>
              {entries.length === 0 && <p className="text-xs text-ink-muted">No activity yet</p>}
            </div>

            {entries.length === 0 ? (
              <div className="p-8 text-center text-ink-muted">
                <p>No activity yet. When a buyer confirms delivery, your earnings land here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map((entry) => {
                  const credit = entry.amount > 0
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rule bg-white">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          credit ? 'bg-gold-soft text-gold-dark' : 'bg-white/60 text-ink-muted border border-rule'
                        }`}>
                          {credit ? '↓' : '↑'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-charcoal text-sm truncate">
                            {entry.description || entry.entry_type.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {new Date(entry.created_at).toLocaleDateString()} · Balance {formatPrice(entry.balance_after)}
                          </p>
                        </div>
                      </div>
                      <p className={`font-bold text-sm shrink-0 ${credit ? 'text-green-600' : 'text-ink-muted'}`}>
                        {credit ? '+' : '-'}{formatPrice(Math.abs(entry.amount))}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </section>
    </main>
  )
}
