'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import type { Order } from '@/lib/orders'
import { momoCheckout, momoProviderForPhone, momoDevCompleteUrl, type MomoCheckoutRequest } from '@/lib/momo'
import NavBar from '@/app/components/NavBar'

export default function CheckoutPage() {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [phone, setPhone] = useState('')
  const [provider, setProvider] = useState<'mtn' | 'vodafone' | 'airteltigo'>('mtn')
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const rawId = params.orderId
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId

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

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!order || !userId) return
    if (!phone) {
      setError('Please enter your MoMo phone number')
      return
    }

    setPaying(true)
    setError(null)

    try {
      const input: MomoCheckoutRequest = {
        orderId: order.id,
        amount: order.amount,
        phone,
        provider,
        payerMessage: 'Campus Plug order #' + order.id.slice(-4),
        payeeNote: 'Payment for ' + (order.listing?.title || 'order'),
      }

      const result = await momoCheckout(input)
      if (result.status === 'failed') {
        setError('MoMo checkout failed. Please try again.')
        setPaying(false)
        return
      }

      // In dev mode, show a "simulate payment" button instead of real STK
      if (result.transactionId.startsWith('dev_')) {
        setError(null)
        // Auto-redirect to dev completion page for testing
        router.push(momoDevCompleteUrl(order.id, 'paid'))
        return
      }

      // Real provider: user sees STK prompt on their phone
      // Poll /api/momo/status or wait for webhook
      setError('STK prompt sent to your phone. Approve the payment, then we’ll verify.')
    } catch (err) {
      console.error('MoMo checkout failed:', err)
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.')
    } finally {
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
  const platformFee = Math.round(order.amount * 0.05)
  const sellerReceives = order.amount - platformFee

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
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Amount</p>
                <p className="text-lg font-bold text-gold-dark">{formatPrice(order.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Platform fee (5%)</p>
                <p className="text-sm text-ink-muted">-{formatPrice(platformFee)}</p>
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
              to approve the payment. Funds are held in escrow until you confirm delivery.
            </p>

            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                  Phone number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
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
                  onChange={(e) => setProvider(e.target.value as 'mtn' | 'vodafone' | 'airteltigo')}
                  className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all text-lg font-semibold"
                >
                  <option value="mtn">MTN Ghana</option>
                  <option value="vodafone">Vodafone Ghana</option>
                  <option value="airteltigo">AirtelTigo</option>
                </select>
                <p className="text-[11px] text-ink-muted mt-1">
                  Detected: {momoProviderForPhone(phone || '0') === 'mtn' ? 'MTN' : momoProviderForPhone(phone || '0') === 'vodafone' ? 'Vodafone' : 'AirtelTigo'}
                </p>
              </div>

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
                {paying ? 'Sending STK prompt...' : 'Pay with MoMo'}
              </button>

              {process.env.NEXT_PUBLIC_MOMO_ENV === 'sandbox' && (
                <div className="mt-4 p-3 rounded-xl border border-gold/30 bg-gold/5">
                  <p className="text-xs text-gold-dark font-semibold mb-1">Sandbox mode</p>
                  <p className="text-xs text-ink-muted">
                    No real MOMO_API_KEY set. In production this sends a real STK prompt.
                    For testing, the payment will auto-complete.
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
