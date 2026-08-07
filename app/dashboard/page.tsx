'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/format'

interface MyListing {
  id: string
  title: string
  price: number
  image_url: string | null
  listing_type: string
  approval_status: string
  created_at: string
}

interface MyBooking {
  id: string
  booking_date: string | null
  booking_time: string | null
  notes: string | null
  created_at: string
  listing: { id: string; title: string } | null
  buyer: { full_name: string | null } | null
}

export default function DashboardPage() {
  const [listings, setListings] = useState<MyListing[]>([])
  const [bookings, setBookings] = useState<MyBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function loadDashboard() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_seller')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Dashboard profile lookup failed:', profileError)
          setError('Could not verify your seller account: ' + profileError.message)
          return
        }

        if (!profile?.is_seller) {
          router.push('/become-seller')
          return
        }

        // My listings, all statuses, newest first.
        const { data: listingData, error: listingError } = await supabase
          .from('listings')
          .select('id, title, price, image_url, listing_type, approval_status, created_at')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })

        if (listingError) {
          console.error('Dashboard listings fetch failed:', listingError)
          setError('Could not load your listings: ' + listingError.message)
        } else if (listingData) {
          setListings(listingData as unknown as MyListing[])
        }

        // Recent bookings. The buyer embed needs the seller_dashboard_rls.sql
        // policy; if it hasn't been run, this logs an RLS error and buyer
        // names show as — (listings still render).
        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('*, listing:listings!listing_id (id, title), buyer:profiles!buyer_id (full_name)')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (bookingError) {
          console.error('Dashboard bookings fetch failed:', bookingError)
          setBookingsError('Could not load bookings: ' + bookingError.message)
        } else if (bookingData) {
          setBookings(bookingData as unknown as MyBooking[])
        }
      } catch (err) {
        console.error('Dashboard load failed:', err)
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [router])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      window.location.reload()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const approved = listings.filter(l => l.approval_status === 'approved').length
  const pending = listings.filter(l => l.approval_status === 'pending').length

  const statusChip = (status: string) => {
    if (status === 'approved') {
      return <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">✅ Approved</span>
    }
    if (status === 'pending') {
      return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold">⏳ Pending</span>
    }
    return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">❌ Rejected</span>
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group">
              <span className="group-hover:-translate-x-1 transition-transform">←</span>
              Back to app
            </Link>
            <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white transition-colors">Logout</button>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px' }}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Seller Dashboard</div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
            Your Campus Plug<br />
            <span className="gradient-text">at a glance</span>
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70 max-w-xl">
            Track your listings and bookings in one place.
          </p>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-4">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10">
          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            {[
              { label: 'Total listings', value: listings.length, icon: '📦' },
              { label: 'Approved', value: approved, icon: '✅' },
              { label: 'Pending review', value: pending, icon: '⏳' },
              { label: 'Bookings received', value: bookings.length, icon: '📅' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
                <div className="text-2xl mb-2">{stat.icon}</div>
                <div className="text-3xl font-bold text-charcoal">{stat.value}</div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* MY LISTINGS */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-charcoal">My Listings</h2>
            <Link href="/new" className="bg-charcoal text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-colors">＋ New Listing</Link>
          </div>

          {listings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 mb-12">
              <div className="text-5xl mb-4">🏠</div>
              <p className="text-xl font-bold text-charcoal">No listings yet</p>
              <p className="text-gray-500 mt-2 mb-6">Create your first listing and start selling on campus.</p>
              <Link href="/new" className="inline-flex items-center gap-2 bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors">＋ Post a listing</Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-12">
              {listings.map((listing) => (
                <div key={listing.id} className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
                  {listing.image_url ? (
                    <img src={listing.image_url} alt={listing.title} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-gradient-to-br from-charcoal to-gray-800 flex items-center justify-center">
                      <span className="text-4xl opacity-40">{listing.listing_type === 'service' ? '💼' : '📦'}</span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs text-gray-500">{formatDate(listing.created_at)}</span>
                      {statusChip(listing.approval_status)}
                    </div>
                    <h3 className="font-bold text-charcoal text-lg line-clamp-1">{listing.title}</h3>
                    <p className="text-xl font-bold text-gold-dark mb-4">{formatPrice(listing.price)}</p>
                    <div className="flex gap-2">
                      <Link href={"/new?edit=" + listing.id} className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-colors text-sm">✏️ Edit</Link>
                      <Link href={"/listing/" + listing.id} className="flex-1 flex items-center justify-center bg-white text-charcoal py-2.5 rounded-full font-semibold border border-gray-200 hover:border-charcoal transition-colors text-sm">👁 View</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RECENT BOOKINGS */}
          <h2 className="text-2xl font-bold text-charcoal mb-4">Recent Bookings</h2>

          {bookingsError && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
              ⚠️ {bookingsError} — run seller_dashboard_rls.sql (or check the bookings schema) and refresh.
            </div>
          )}

          {bookings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4">📅</div>
              <p className="text-xl font-bold text-charcoal">No bookings yet</p>
              <p className="text-gray-500 mt-2">When buyers book your services, they&apos;ll show up here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 divide-y divide-gray-100">
              {bookings.map((booking) => (
                <div key={booking.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-semibold text-charcoal">{booking.listing?.title || 'Unknown listing'}</p>
                    {booking.listing && (
                      <Link href={"/listing/" + booking.listing.id} className="text-xs text-gold-dark hover:underline">view →</Link>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    📅 {formatDate(booking.booking_date)} · 🕒 {booking.booking_time || '—'} · 👤 {booking.buyer?.full_name || '—'}
                  </p>
                  {booking.notes && <p className="text-xs text-gray-600 mt-1 italic">&quot;{booking.notes}&quot;</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
