'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import { getOrders, orderStatusLabel } from '@/lib/orders'

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

  const statusChip = (status: string) => {
    const variants: Record<string, string> = {
      confirmed: 'bg-blue-100 text-blue-700',
      paid: 'bg-amber-100 text-amber-700',
      preparing: 'bg-amber-100 text-amber-700',
      shipped: 'bg-indigo-100 text-indigo-700',
      delivered: 'bg-indigo-100 text-indigo-700',
      complete: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
    }
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${variants[status] || 'bg-gray-100 text-gray-600'}`}>
      {orderStatusLabel(status)}
    </span>
  }

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" />

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Orders</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Your orders
              </h1>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-12 text-center border border-rule">
              <div className="text-4xl mb-4 opacity-50">📦</div>
              <p className="text-xl font-bold text-ink">No orders yet</p>
              <p className="text-ink-muted mt-2 mb-6">
                Orders you buy or sell appear here. Start from a listing page —
                agree with the seller, then tap &quot;Start order&quot;.
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
                      {statusChip(o.status)}
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
