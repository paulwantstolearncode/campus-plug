'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import { getOrders } from '@/lib/orders'
import { OrderStatusChip } from '@/app/components/OrderStatusChip'

interface OrderRow {
  id: string
  listing_id: string | null
  buyer_id: string | null
  seller_id: string
  kind: 'product' | 'service'
  amount: number
  status: string
  created_at: string
  listing?: { id: string; title: string | null } | null
  buyer?: { id: string; full_name: string | null } | null
  seller?: { id: string; full_name: string | null } | null
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const loadOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)
      const data = await getOrders(user.id)
      setOrders(data as OrderRow[])
      setError(null)
    } catch (err) {
      console.error('Failed to load orders:', err)
      setError('Could not load your orders. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    async function init() {
      await loadOrders()
    }
    init()
  }, [loadOrders])

  const otherParty = (o: OrderRow) => {
    if (userId && o.buyer_id === userId) return o.seller
    if (userId && o.seller_id === userId) return o.buyer
    return null
  }

  const otherName = (o: OrderRow) => {
    const party = otherParty(o)
    return party?.full_name ? formatName(party.full_name) : 'Unknown'
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" />
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
            <div className="h-12 bg-white/10 rounded-xl w-3/4 mb-3 animate-pulse" />
            <div className="h-5 bg-white/10 rounded-lg w-1/2 animate-pulse" />
          </div>
        </section>
        <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
            <div className="space-y-4">
              <div className="h-4 w-1/3 skeleton-shimmer-light" />
              <div className="h-4 w-1/2 skeleton-shimmer-light" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 skeleton-shimmer-light rounded-2xl" />
              ))}
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (error || !userId) {
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
        <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                {error}
              </div>
            )}
            <p className="text-ink text-center">Not signed in.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Orders</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Your <span className="font-serif-accent italic text-gold">orders</span>
              </h1>
            </div>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

          {orders.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-12 text-center border border-rule">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 mb-4 text-ink-muted opacity-50"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <p className="text-xl font-bold text-ink">No wahala, chale — nothing here yet</p>
              <p className="text-ink-muted mt-2 mb-6">
                Your buys and sells will show up here once you start a deal. Open a listing and tap &quot;Message&quot; to begin.
              </p>
              <Link
                href="/services"
                className="inline-flex items-center gap-2 bg-ink text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors"
              >
                Browse listings
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => {
                const name = otherName(o)
                const listingTitle = o.listing?.title || 'General order'
                return (
                  <Link
                    key={o.id}
                    href={'/orders/' + o.id}
                    className="flex items-center justify-between p-4 rounded-2xl border border-rule bg-white/90 backdrop-blur-sm hover:border-gold transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-lg font-bold text-gold-dark shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-charcoal truncate">{name}</p>
                        <p className="text-xs text-ink-muted truncate">{listingTitle}</p>
                        <p className="text-xs text-ink-muted truncate">
                          {formatPrice(o.amount)} · {o.kind === 'product' ? 'Product' : 'Service'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      {<OrderStatusChip status={o.status} />}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
