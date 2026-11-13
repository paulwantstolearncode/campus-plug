'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

interface Stat {
  label: string
  value: number | null
}

/**
 * Ambient live-activity strip on the home feed.
 *
 * Aggregate-only metrics — never buyer names, never individual transactions,
 * never anything RLS hides from the public. Computed from existing tables
 * (no new SQL, no new tables):
 *
 *   • listings created in the last 7 days
 *   • orders completed in the last 7 days
 *   • distinct sellers with a completed order in the last 7 days
 *
 * Fetches once on mount. Silent failure — strip just doesn't render if the
 * query fails, so it never degrades the page.
 */
export default function StatsStrip() {
  const [stats, setStats] = useState<Stat[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    async function load() {
      try {
        const [listingsResult, ordersResult, sellerOrdersResult] =
          await Promise.all([
            supabase
              .from('listings')
              .select('*', { count: 'exact', head: true })
              .is('deleted_at', null)
              .gte('created_at', weekAgo),
            supabase
              .from('orders')
              .select('*', { count: 'exact', head: true })
              .eq('status', 'complete')
              .gte('updated_at', weekAgo),
            supabase
              .from('orders')
              .select('seller_id')
              .eq('status', 'complete')
              .gte('updated_at', weekAgo),
          ])

        const sellerIds = new Set(
          (sellerOrdersResult.data as { seller_id: string }[] | null)
            ?.filter((r) => r.seller_id)
            .map((r) => r.seller_id) || []
        )

        setStats([
          { label: 'listings this week', value: listingsResult.count ?? null },
          { label: 'deals completed', value: ordersResult.count ?? null },
          { label: 'sellers active', value: sellerIds.size ?? 0 },
        ])
      } catch (err) {
        console.error('Stats strip failed:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading || !stats) return null

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white/90 backdrop-blur-sm border border-rule rounded-3xl">
      {stats.map((s) => (
        <div key={s.label} className="text-center flex-1">
          <p
            className={`text-sm font-bold ${s.value ? 'text-gold-dark' : 'text-ink-muted'}`}
          >
            {s.value ?? '—'}
          </p>
          <p className="text-[10px] text-ink-muted uppercase tracking-wider">
            {s.label}
          </p>
        </div>
      ))}
    </div>
  )
}
