'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'

interface DisputeRow {
  id: string
  order_id: string
  opened_by: string
  reason: string
  status: 'open' | 'resolved' | 'closed'
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  order?: {
    id: string
    amount: number
    status: string
    title: string | null
    buyer_id: string | null
    seller_id: string
    listing?: { title: string | null } | null
    buyer?: { full_name: string | null } | null
    seller?: { full_name: string | null } | null
  }
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()

  const loadDisputes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)

      const { data, error: dbError } = await supabase
        .from('disputes')
        .select(`
          *,
          order:orders (
            id, amount, status,
            listing:listings!listing_id (title),
            buyer:profiles!buyer_id (full_name),
            seller:profiles!seller_id (full_name)
          )
        `)
        .order('created_at', { ascending: false })

      if (dbError) throw dbError

      // Filter to only disputes this user is a party to (buyer or seller of the order)
      const filtered = (data as DisputeRow[] || []).filter((d) => {
        if (!d.order) return false
        return d.order.buyer_id === userId || d.order.seller_id === userId
      })

      setDisputes(filtered)
      setError(null)
    } catch (err) {
      console.error('Failed to load disputes:', err)
      setError('Could not load disputes. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (!cancelled) {
      ;(async () => {
        await loadDisputes()
      })()
    }
    return () => { cancelled = true }
  }, [loadDisputes])

  const otherParty = (d: DisputeRow) => {
    if (!d.order || !userId) return null
    return d.order.buyer_id === userId ? d.order.seller : d.order.buyer
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
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Disputes</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Disputes <span className="font-serif-accent italic text-gold">resolved fairly</span>
              </h1>
            </div>
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors"
            >
              ← Back to orders
            </Link>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

          {disputes.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-12 text-center border border-rule">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 mb-4 text-ink-muted opacity-50"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <p className="text-xl font-bold text-ink">No disputes yet</p>
              <p className="text-ink-muted mt-2 mb-6">
                Open a dispute from an order page if something goes wrong with a purchase.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {disputes.map((d) => {
                const party = otherParty(d)
                const order = d.order!
                return (
                  <a
                    key={d.id}
                    href={'/disputes/' + d.id}
                    className="flex items-center justify-between p-4 rounded-2xl border border-rule bg-white/90 backdrop-blur-sm hover:border-gold transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-50/20 to-red-50/5 flex items-center justify-center text-lg font-bold text-red-700 shrink-0">
                        {party?.full_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-charcoal truncate">
                          {d.status === 'open' ? 'Open dispute' : 'Resolved dispute'}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                          {order.listing?.title || 'Order'} · {formatPrice(order.amount)}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                          With {formatName(party?.full_name || 'Unknown')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        d.status === 'open'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-green-50 text-green-700 border border-green-200'
                      }`}>
                        {d.status === 'open' ? 'Open' : 'Resolved'}
                      </span>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
