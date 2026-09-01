'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import { formatPrice } from '@/lib/format'
import { getCategoryLabel } from '@/lib/categories'
import { formatDateTime } from '@/lib/sales'

interface SaleRow {
  id: string
  total_amount: number
  status: string
  created_at: string
  completed_at: string
  buyer_name: string | null
  buyer_whatsapp: string | null
  seller_notes: string | null
  listing: { id: string; title: string; category: string | null } | null
  seller: { full_name: string | null; whatsapp_number: string | null } | null
}

interface BookingRow {
  id: string
  booking_date: string | null
  booking_time: string | null
  notes: string | null
  status: string | null
  completed_at: string | null
  actual_amount: number | null
  seller_notes: string | null
  created_at: string
  listing: { id: string; title: string; category: string | null } | null
  seller: { full_name: string | null; whatsapp_number: string | null } | null
  buyer: { full_name: string | null } | null
}

interface Txn {
  id: string
  type: 'booking' | 'sale'
  date: string
  sellerName: string
  sellerWhatsapp: string | null
  listingTitle: string
  category: string
  amount: number
  status: string
  buyer: string
  notes: string | null
}

type TimeFilter = 'all' | 'month' | 'week' | 'custom'
type StatusFilter = 'all' | 'completed' | 'pending' | 'cancelled'

// Pure helper (module scope) so filtering never calls impure functions during
// render. `now` and `monthStart` are snapshotted once via lazy state init.
function inWindow(
  dateStr: string | null | undefined,
  filter: TimeFilter,
  customFrom: string,
  customTo: string,
  now: number,
  monthStart: number
): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr).getTime()
  if (Number.isNaN(d)) return false

  if (filter === 'all') return true
  if (filter === 'month') return d >= monthStart
  if (filter === 'week') return d >= now - 7 * 24 * 60 * 60 * 1000

  // custom
  const from = customFrom ? new Date(customFrom + 'T00:00:00').getTime() : -Infinity
  const to = customTo ? new Date(customTo + 'T23:59:59').getTime() : Infinity
  return d >= from && d <= to
}

export default function AdminSalesPage() {
  const [sales, setSales] = useState<SaleRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TimeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [{ now, monthStart }] = useState(() => {
    const n = Date.now()
    const d = new Date(n)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return { now: n, monthStart: d.getTime() }
  })
  const router = useRouter()

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Admin sales profile lookup failed:', profileError)
          setError('Could not verify admin access: ' + profileError.message)
          return
        }

        if (!profile?.is_admin) {
          alert('Admin access only')
          router.push('/')
          return
        }

        setIsAdmin(true)

        // Requires add_sales_tracking.sql (sales table + admin read policies).
        const { data: salesData, error: salesError } = await supabase
          .from('sales')
          .select('*, listing:listings!listing_id (id, title, category), seller:profiles!seller_id (full_name, whatsapp_number)')
          .order('completed_at', { ascending: false })

        if (salesError) {
          console.error('Admin sales fetch failed:', salesError)
          setError('Could not load sales: ' + salesError.message + ' — run add_sales_tracking.sql and refresh.')
        } else if (salesData) {
          setSales(salesData as unknown as SaleRow[])
        }

        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('*, listing:listings!listing_id (id, title, category), seller:profiles!seller_id (full_name, whatsapp_number), buyer:profiles!buyer_id (full_name)')
          .order('completed_at', { ascending: false })

        if (bookingError) {
          console.error('Admin bookings fetch failed:', bookingError)
          setError('Could not load bookings: ' + bookingError.message + ' — run add_sales_tracking.sql and refresh.')
        } else if (bookingData) {
          setBookings(bookingData as unknown as BookingRow[])
        }
      } catch (err) {
        console.error('Admin sales load failed:', err)
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router])

  const allTxns = useMemo<Txn[]>(() => {
    const bookingTxns: Txn[] = bookings.map((b) => ({
      id: b.id,
      type: 'booking',
      date: b.completed_at || b.created_at,
      sellerName: b.seller?.full_name || 'Unknown',
      sellerWhatsapp: b.seller?.whatsapp_number || null,
      listingTitle: b.listing?.title || 'Unknown',
      category: getCategoryLabel(b.listing?.category),
      amount: Number(b.actual_amount || 0),
      status: b.status || 'pending',
      buyer: b.buyer?.full_name || '',
      notes: b.seller_notes || b.notes || null,
    }))
    const saleTxns: Txn[] = sales.map((s) => ({
      id: s.id,
      type: 'sale',
      date: s.completed_at || s.created_at,
      sellerName: s.seller?.full_name || 'Unknown',
      sellerWhatsapp: s.seller?.whatsapp_number || null,
      listingTitle: s.listing?.title || 'Unknown',
      category: getCategoryLabel(s.listing?.category),
      amount: Number(s.total_amount || 0),
      status: s.status,
      buyer: s.buyer_name || '',
      notes: s.seller_notes || null,
    }))
    return [...bookingTxns, ...saleTxns].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [bookings, sales])

  const filteredTxns = allTxns.filter((t) => {
    if (!inWindow(t.date, filter, customFrom, customTo, now, monthStart)) return false
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    return true
  })

  // Completed-only revenue sets. Refunded/cancelled stay visible in the
  // transactions table + CSV but are excluded from headline numbers.
  const completedBookings = bookings.filter((b) =>
    b.status === 'completed' && inWindow(b.completed_at, filter, customFrom, customTo, now, monthStart)
  )
  const completedSales = sales.filter((s) =>
    s.status === 'completed' && inWindow(s.completed_at, filter, customFrom, customTo, now, monthStart)
  )
  const refundedSales = sales.filter((s) =>
    s.status === 'refunded' && inWindow(s.completed_at, filter, customFrom, customTo, now, monthStart)
  )

  const serviceAmount = completedBookings.reduce((sum, b) => sum + Number(b.actual_amount || 0), 0)
  const productAmount = completedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
  const totalFacilitated = serviceAmount + productAmount
  const refundedAmount = refundedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

  // Top sellers by revenue (completed only).
  const topSellers = (() => {
    const map = new Map<string, { name: string; amount: number; count: number }>()
    const add = (name: string | null | undefined, amount: number) => {
      const key = name || 'Unknown seller'
      const cur = map.get(key) || { name: key, amount: 0, count: 0 }
      cur.amount += amount
      cur.count += 1
      map.set(key, cur)
    }
    completedBookings.forEach((b) => add(b.seller?.full_name, Number(b.actual_amount || 0)))
    completedSales.forEach((s) => add(s.seller?.full_name, Number(s.total_amount || 0)))
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
  })()

  // Top categories by revenue (completed only).
  const topCategories = (() => {
    const map = new Map<string, number>()
    const add = (category: string | null | undefined, amount: number) => {
      const label = getCategoryLabel(category)
      map.set(label, (map.get(label) || 0) + amount)
    }
    completedBookings.forEach((b) => add(b.listing?.category, Number(b.actual_amount || 0)))
    completedSales.forEach((s) => add(s.listing?.category, Number(s.total_amount || 0)))
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  })()

  const statusLabel = (status: string) => {
    if (status === 'completed') return 'Completed'
    if (status === 'refunded') return 'Refunded'
    if (status === 'cancelled') return 'Cancelled'
    return 'Pending'
  }

  const statusChip = (status: string) => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold '
    if (status === 'completed') return <span className={base + 'bg-green-100 text-green-700'}>✅ Completed</span>
    if (status === 'refunded') return <span className={base + 'bg-amber-100 text-amber-700'}>↩️ Refunded</span>
    if (status === 'cancelled') return <span className={base + 'bg-red-100 text-red-700'}>❌ Cancelled</span>
    return <span className={base + 'bg-gray-100 text-gray-600'}>⏳ Pending</span>
  }

  function csvCell(value: string | number | null): string {
    const s = value == null ? '' : String(value)
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  function exportCsv() {
    // CSV exports filtered transactions (respects both time and status filters).
    const header = ['Date', 'Type', 'Seller Name', 'Seller WhatsApp', 'Listing', 'Category', 'Amount', 'Status', 'Buyer Name', 'Notes']
    const rows = filteredTxns.map((t) =>
      [t.date, t.type, t.sellerName, t.sellerWhatsapp, t.listingTitle, t.category, t.amount, statusLabel(t.status), t.buyer, t.notes].map(csvCell)
    )
    const csv = [header.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'campus-plug-sales-' + new Date().toISOString().split('T')[0] + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading sales dashboard...</p>
        </div>
      </div>
    )
  }

  if (error && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md text-center shadow-xl">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-600 font-semibold">{error}</p>
          <Link href="/" className="inline-block mt-5 text-sm text-white bg-charcoal rounded-full px-5 py-2.5 hover:bg-black transition-colors">← Back to app</Link>
        </div>
      </div>
    )
  }

  if (!isAdmin) return null

  const filterChip = (value: TimeFilter, label: string) => (
    <button
      onClick={() => setFilter(value)}
      className={"px-5 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-all " + (filter === value ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200 hover:border-gray-400')}
    >
      {label}
    </button>
  )

  return (
    <main className="min-h-screen bg-charcoal">
<NavBar variant="admin" back={{ href: '/admin', label: 'Review Queue' }} />

      <section className="relative pt-32 pb-12 md:pt-36 md:pb-14 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Admin Only</div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
            Sales <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70 max-w-xl">
            Private financial overview for the founder. Never shown publicly.
          </p>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-4">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8">

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Time filter */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {filterChip('all', 'All Time')}
            {filterChip('month', 'This Month')}
            {filterChip('week', 'This Week')}
            {filterChip('custom', 'Custom Range')}
            {filter === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-2.5 rounded-full border-2 border-gray-200 text-sm font-semibold text-charcoal focus:outline-none focus:border-gold transition-colors"
                />
                <span className="text-xs text-gray-500">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-2.5 rounded-full border-2 border-gray-200 text-sm font-semibold text-charcoal focus:outline-none focus:border-gold transition-colors"
                />
              </div>
            )}
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            {(['all', 'completed', 'pending', 'cancelled'] as StatusFilter[]).map((status) => {
              const count = status === 'all' ? allTxns.length : allTxns.filter((t) => t.status === status).length
              const labels: Record<StatusFilter, string> = { all: 'All', completed: 'Completed', pending: 'Pending', cancelled: 'Cancelled' }
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={'px-5 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-all ' + (statusFilter === status ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200 hover:border-gray-400')}
                >
                  {labels[status]} ({count})
                </button>
              )
            })}
          </div>

          {/* Transaction count breakdown */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 text-center">
              <div className="text-2xl font-bold text-green-600">{allTxns.filter((t) => t.status === 'completed').length}</div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">Completed</div>
            </div>
            <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 text-center">
              <div className="text-2xl font-bold text-amber-600">{allTxns.filter((t) => t.status === 'pending').length}</div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">Pending</div>
            </div>
            <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 text-center">
              <div className="text-2xl font-bold text-red-600">{allTxns.filter((t) => t.status === 'cancelled').length}</div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">Cancelled</div>
            </div>
          </div>

          {/* Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
              <div className="text-2xl mb-2">💰</div>
              <div className="text-2xl font-bold text-charcoal">{formatPrice(totalFacilitated)}</div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">Total Facilitated</div>
            </div>
            <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
              <div className="text-2xl mb-2">🧾</div>
              <div className="text-2xl font-bold text-charcoal">
                {completedBookings.length + completedSales.length}
                <span className="text-sm font-semibold text-gray-400"> ({completedBookings.length} + {completedSales.length})</span>
              </div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">Completed Transactions</div>
            </div>
            <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
              <div className="text-2xl mb-2">💼</div>
              <div className="text-2xl font-bold text-charcoal">{completedBookings.length}</div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">Service Bookings</div>
              <div className="text-sm font-bold text-gold-dark mt-1">{formatPrice(serviceAmount)}</div>
            </div>
            <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
              <div className="text-2xl mb-2">📦</div>
              <div className="text-2xl font-bold text-charcoal">{completedSales.length}</div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">Product Sales</div>
              <div className="text-sm font-bold text-gold-dark mt-1">{formatPrice(productAmount)}</div>
            </div>
          </div>

          {/* Refunded line */}
          <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 mb-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-2xl">↩️</span>
              <div>
                <div className="text-sm font-semibold text-amber-700">Refunded: {formatPrice(refundedAmount)} ({refundedSales.length} transaction{refundedSales.length === 1 ? '' : 's'})</div>
                <div className="text-xs text-gray-500 mt-0.5">Excluded from headline revenue — track this to spot refund patterns.</div>
              </div>
            </div>
          </div>

          {/* Commission preview */}
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-gold/40 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📈</span>
              <h2 className="font-bold text-charcoal">Hypothetical Commission</h2>
              <span className="text-xs text-gray-400 font-normal">(for planning only)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0.05, 0.1, 0.15].map((rate) => (
                <div key={rate} className="rounded-2xl bg-gray-50 p-4">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">At {Math.round(rate * 100)}%</div>
                  <div className="text-2xl font-bold text-gold-dark mt-1">{formatPrice(totalFacilitated * rate)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top sellers + top categories */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
              <h2 className="font-bold text-charcoal mb-4">🏆 Top Sellers by Revenue</h2>
              {topSellers.length === 0 ? (
                <p className="text-sm text-gray-400">No completed sales in this period yet.</p>
              ) : (
                <div className="space-y-3">
                  {topSellers.map((s, idx) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className={"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " + (idx === 0 ? 'bg-gold text-charcoal' : 'bg-gray-100 text-gray-600')}>{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-charcoal text-sm truncate">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.count} transaction{s.count === 1 ? '' : 's'}</p>
                      </div>
                      <span className="font-bold text-gold-dark text-sm whitespace-nowrap">{formatPrice(s.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
              <h2 className="font-bold text-charcoal mb-4">🗂️ Top Categories by Revenue</h2>
              {topCategories.length === 0 ? (
                <p className="text-sm text-gray-400">No completed sales in this period yet.</p>
              ) : (
                <div className="space-y-3">
                  {topCategories.map(([label, amount], idx) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className={"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " + (idx === 0 ? 'bg-gold text-charcoal' : 'bg-gray-100 text-gray-600')}>{idx + 1}</span>
                      <p className="font-semibold text-charcoal text-sm flex-1 truncate">{label}</p>
                      <span className="font-bold text-gold-dark text-sm whitespace-nowrap">{formatPrice(amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent transactions */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-charcoal">Recent Transactions</h2>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 bg-charcoal text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-colors"
            >
              📥 Export CSV
            </button>
          </div>

          <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-x-auto">
            {filteredTxns.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl mb-4">🗃️</div>
                <p className="text-xl font-bold text-charcoal">No transactions in this period</p>
                <p className="text-gray-500 mt-2">Adjust the time filter or wait for sellers to record activity.</p>
              </div>
            ) : (
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Seller</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Listing</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTxns.slice(0, 100).map((t) => (
                    <tr key={t.type + '-' + t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(t.date)}</td>
                      <td className="px-5 py-3 font-semibold text-charcoal truncate max-w-[140px]">{t.sellerName}</td>
                      <td className="px-5 py-3">
                        <span className={"inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold " + (t.type === 'booking' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                          {t.type === 'booking' ? '💼 Booking' : '📦 Sale'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-700 truncate max-w-[180px]">{t.listingTitle}</td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{t.category}</td>
                      <td className="px-5 py-3 font-bold text-gold-dark text-right whitespace-nowrap">{formatPrice(t.amount)}</td>
                      <td className="px-5 py-3">{statusChip(t.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {filteredTxns.length > 100 && (
              <p className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">
                Showing the latest 100 of {filteredTxns.length} transactions — the CSV export includes everything.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
