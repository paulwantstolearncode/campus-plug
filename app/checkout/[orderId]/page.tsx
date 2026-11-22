'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { COMMISSION_RATE, commission } from '@/lib/commerceConfig'
import { formatName } from '@/lib/formatName'
import type { Order } from '@/lib/orders'
import { momoDevCompleteUrl, momoProviderForPhone, type MomoProvider } from '@/lib/momo'
import NavBar from '@/app/components/NavBar'

interface ProviderOption {
  id: MomoProvider
  label: string
}

type PaymentStage = 'idle' | 'stk' | 'verifying' | 'paid' | 'failed'

export default function CheckoutPage() {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [phone, setPhone] = useState('')
  const [provider, setProvider] = useState<MomoProvider>('mtn')
  const [providers, setProviders] = useState<ProviderOption[]>([
    { id: 'mtn', label: 'MTN Mobile Money' },
  ])
  const [simulated, setSimulated] = useState(false)
  const [stage, setStage] = useState<PaymentStage>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const aliveRef = useRef(true)
  const router = useRouter()
  const params = useParams()
  const rawId = params.orderId
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId

  useEffect(() => {
    return () => {
      aliveRef.current = false
    }
  }, [])

  const loadOrder = useCallback(async () => {
    if (!orderId) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)

      // Fetch order + verify the user is a party
      const { data, error: orderError } = await supabase
        .from('orders')
        .select('*, listing:listings!listing_id (id, title, image_url, price), seller:profiles!seller_id (id, full_name), buyer:profiles!buyer_id (id, full_name)')
        .eq('id', orderId)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .maybeSingle()

      if (orderError) throw orderError
      if (!data) {
        setError('Order not found or you are not a party to it.')
        setLoading(false)
        return
      }

      const typed = data as Order
      setOrder(typed)

      // Prefill phone from buyer profile if available
      const buyer = typed.buyer
      if (buyer) {
        // Try to get phone from profiles - we need to fetch separately
        const { data: profile } = await supabase
          .from('profiles')
          .select('whatsapp_number')
          .eq('id', user.id)
          .single()
        if (profile?.whatsapp_number) setPhone(profile.whatsapp_number)
      }

      setError(null)
    } catch (err) {
      console.error('Failed to load order:', err)
      setError('Could not load order. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [orderId, router])

  useEffect(() => {
    let cancelled = false
    if (!cancelled) {
      ;(async () => {
        await loadOrder()
      })()
    }
    return () => { cancelled = true }
  }, [loadOrder])

  // Ask the server which networks are actually configured (item 3/4). A
  // provider without credentials is hidden instead of failing after the buyer
  // has already typed their number.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/momo/initiate')
        if (!res.ok) return
        const data = (await res.json()) as {
          providers?: ProviderOption[]
          simulated?: boolean
        }
        if (cancelled) return
        if (data.providers?.length) setProviders(data.providers)
        setSimulated(!!data.simulated)
      } catch {
        // Keep the MTN default; the pay call will surface a real error.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!order || !userId) return
    if (!phone) {
      setPaymentError('Please enter your MoMo phone number')
      return
    }

    setPaying(true)
    setPaymentError(null)
    setStage('stk')
    setStatusMessage('Sending the payment prompt to your phone…')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setPaymentError('Your session expired. Please sign in again.')
        setStage('idle')
        setPaying(false)
        return
      }

      const initiateRes = await fetch('/api/momo/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId: order.id, phone, provider }),
      })
      const initiate = (await initiateRes.json()) as {
        simulated?: boolean
        error?: string
      }

      if (!initiateRes.ok) {
        setPaymentError(initiate.error || 'Could not start the MoMo payment.')
        setStage('failed')
        setPaying(false)
        return
      }

      // Local dev: no real STK prompt exists, so the dev completion route
      // records the payment through the same RPC as a real callback.
      if (initiate.simulated) {
        router.push(momoDevCompleteUrl(order.id, 'paid'))
        return
      }

      setStage('verifying')
      setStatusMessage(
        'Approve the prompt on your phone. We’ll confirm automatically — keep this page open.'
      )

      // Item 5: poll the provider through our server for up to ~2 minutes. The
      // webhook may still land first; record_payment() is idempotent either way.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        if (!aliveRef.current) return

        const statusRes = await fetch('/api/momo/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orderId: order.id }),
        })

        if (!statusRes.ok) continue
        const status = (await statusRes.json()) as { status?: string }

        if (status.status === 'paid' || status.status === 'released') {
          setStage('paid')
          setStatusMessage('Payment confirmed. Your money is held in escrow.')
          router.push('/orders/' + order.id)
          return
        }
        if (status.status === 'failed') {
          setStage('failed')
          setPaymentError('The payment was not approved. Please try again.')
          setPaying(false)
          return
        }
      }

      setStatusMessage(
        'Still waiting for confirmation. If you approved the prompt, we’ll update this order automatically.'
      )
      setPaying(false)
    } catch (err) {
      console.error('MoMo checkout failed:', err)
      setPaymentError(err instanceof Error ? err.message : 'Payment failed. Please try again.')
      setStage('failed')
      setPaying(false)
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

  if (error || !order) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" back={{ href: '/orders', label: 'Back to orders' }} />
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
              onClick={() => router.push('/orders')}
              className="bg-ink text-white px-5 py-2 rounded-full font-semibold hover:bg-black transition-colors"
            >
              ← Back to orders
            </button>
          </div>
        </section>
      </main>
    )
  }

  const listing = order.listing as { title: string | null; image_url: string | null; price: number } | null
  const seller = order.seller as { full_name: string | null } | null
  // Use the shared helper so this matches the fee record_payment() stores in
  // the DB (round to 2 decimals), instead of rounding to whole cedis here.
  const commissionAmount = commission(order.amount)
  const sellerReceives = Number(order.amount) - commissionAmount

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" back={{ href: '/orders', label: 'Back to orders' }} />

      <section className="relative pt-28 pb-10 md:pt-36 md:pb-14 overflow-hidden animated-gradient">
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Checkout</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Pay for <span className="font-serif-accent italic text-gold">{listing?.title || 'your order'}</span>
              </h1>
              <p className="text-xs text-white/70 mt-1">
                Order #{order.id.slice(-4).toUpperCase()} · With {formatName(seller?.full_name || 'seller')}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border border-white/20 text-white">
              Order #{order.id.slice(-4).toUpperCase()}
            </span>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

          {/* Order summary */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule mb-8">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-4">Order summary</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Item</p>
                <p className="text-sm text-ink">{listing?.title || 'Order item'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Seller</p>
                <p className="text-sm text-ink">{formatName(seller?.full_name || 'Unknown')}</p>
              </div>
              {order.kind === 'service' && (
                <div>
                  <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Appointment</p>
                  <p className="text-sm font-semibold text-ink">
                    {order.scheduled_for
                      ? new Date(order.scheduled_for).toLocaleString('en-GB', {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        })
                      : 'Not specified'}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Amount</p>
                <p className="text-lg font-bold text-gold-dark">{formatPrice(order.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Platform fee ({Math.round(COMMISSION_RATE * 100)}%)</p>
                <p className="text-sm text-ink-muted">-{formatPrice(commissionAmount)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Seller receives</p>
                <p className="text-sm font-semibold text-ink">{formatPrice(sellerReceives)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Payment method</p>
                <p className="text-sm text-ink">Mobile Money (MoMo)</p>
              </div>
            </div>
          </div>

          {/* MoMo payment form */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-4">Mobile Money</p>
            <p className="text-sm text-ink-muted mb-6">
              Enter the phone number linked to your MoMo wallet. You’ll receive an STK prompt
              to approve the payment. {order.kind === 'service'
                ? 'Payment confirms the booking; funds stay in escrow until the service is completed.'
                : 'Funds are held in escrow until you confirm delivery.'}
            </p>

            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                  Phone number
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
                  className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all text-lg font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                  Network
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as MomoProvider)}
                  className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all text-lg font-semibold"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-muted mt-1">
                  Detected: {providers.find((p) => p.id === provider)?.label || 'MTN Mobile Money'}
                </p>
              </div>

              {paymentError && (
                <div className="p-3 rounded-xl text-xs font-medium border bg-red-50 border-red-200 text-red-700">
                  {paymentError}
                </div>
              )}

              {statusMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium border ${
                    stage === 'paid'
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : stage === 'failed'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-gold/5 border-gold/30 text-gold-dark'
                  }`}
                >
                  {statusMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={paying || !phone}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-full font-bold text-sm transition-all disabled:opacity-50 ${
                  paying ? 'bg-white/50 text-ink-muted border border-white/20' : 'bg-gold text-charcoal hover:bg-gold-dark shadow-lg shadow-gold/30'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mr-1 ${paying ? 'animate-spin' : ''}`}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="2" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                {paying
                  ? stage === 'verifying'
                    ? 'Waiting for approval…'
                    : 'Sending prompt…'
                  : 'Pay with MoMo'}
              </button>

              {simulated && (
                <div className="mt-4 p-3 rounded-xl border border-gold/30 bg-gold/5">
                  <p className="text-xs text-gold-dark font-semibold mb-1">Sandbox mode</p>
                  <p className="text-xs text-ink-muted">
                    Local simulation is active and no real provider is configured, so no real
                    STK prompt is sent. For testing, the payment completes automatically.
                  </p>
                </div>
              )}
            </form>
          </div>

          <div className="mt-8">
            <button
              onClick={() => router.push('/orders')}
              className="text-sm text-gold hover:underline font-medium"
            >
              ← Back to orders
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
