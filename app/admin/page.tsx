'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface PendingSeller {
  id: string
  full_name: string | null
  whatsapp_number: string | null
  seller_status: string
  created_at: string
}

interface PendingListing {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  listing_type: string
  service_duration: string | null
  service_location: string | null
  approval_status: string
  created_at: string
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
}

export default function AdminPage() {
  const [tab, setTab] = useState<'sellers' | 'listings'>('sellers')
  const [sellers, setSellers] = useState<PendingSeller[]>([])
  const [listings, setListings] = useState<PendingListing[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      // Load pending sellers
      const { data: sellersData, error: sellersError } = await supabase
        .from('profiles')
        .select('id, full_name, whatsapp_number, seller_status, created_at')
        .eq('seller_status', 'pending')
        .not('whatsapp_number', 'is', null)
        .order('created_at', { ascending: false })

      if (sellersError) {
        setError('Could not load pending sellers: ' + sellersError.message)
      } else if (sellersData) {
        setSellers(sellersData)
      }

      // Load pending listings
      const { data: listingsData, error: listingsError } = await supabase
        .from('listings')
        .select('*, seller:profiles!seller_id (full_name, whatsapp_number)')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false })

      if (listingsError) {
        setError('Could not load pending listings: ' + listingsError.message)
      } else if (listingsData) {
        setListings(listingsData as unknown as PendingListing[])
      }
    }

    async function checkAdmin() {
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

        // A failed lookup (missing column, RLS, etc.) must not masquerade as
        // "not an admin" — surface the real reason instead.
        if (profileError) {
          console.error('Admin profile lookup failed:', profileError)
          setError('Could not verify admin access: ' + profileError.message)
          return
        }

        if (!profile?.is_admin) {
          alert('Admin access only')
          router.push('/')
          return
        }

        setIsAdmin(true)
        await loadData()
      } catch (err) {
        // A failed lookup must not strand the admin on the spinner forever.
        console.error('Could not load admin data:', err)
        setError('Could not load the review queue. Check your connection and try again.')
      } finally {
        setLoading(false)
      }
    }

    checkAdmin()
  }, [])

  async function approveSeller(id: string) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ seller_status: 'approved', is_seller: true })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setSellers(prev => prev.filter(s => s.id !== id))
      }
    } catch (err) {
      console.error('Approve seller failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  async function rejectSeller(id: string) {
    if (!confirm('Reject this seller?')) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ seller_status: 'rejected', is_seller: false })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setSellers(prev => prev.filter(s => s.id !== id))
      }
    } catch (err) {
      console.error('Reject seller failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  async function approveListing(id: string) {
    try {
      const { error } = await supabase
        .from('listings')
        .update({ approval_status: 'approved' })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setListings(prev => prev.filter(l => l.id !== id))
      }
    } catch (err) {
      console.error('Approve listing failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  async function rejectListing(id: string, title: string) {
    if (!confirm('Reject "' + title + '"?')) return

    try {
      const { error } = await supabase
        .from('listings')
        .update({ approval_status: 'rejected' })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setListings(prev => prev.filter(l => l.id !== id))
      }
    } catch (err) {
      console.error('Reject listing failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading admin...</p>
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

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug Admin</span>
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors">← Back to app</Link>
        </div>
      </nav>

      <section className="pt-32 pb-12 animated-gradient">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Admin Dashboard</div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Review Queue</h1>
          <p className="text-white/70">Approve sellers and listings to keep Campus Plug premium.</p>
        </div>
      </section>

      <section className="bg-off-white -mt-4 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-2 mb-8 overflow-x-auto">
            <button
              onClick={() => setTab('sellers')}
              className={"px-6 py-3 rounded-full font-semibold whitespace-nowrap transition-all " + (tab === 'sellers' ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200')}
            >
              👤 Pending Sellers ({sellers.length})
            </button>
            <button
              onClick={() => setTab('listings')}
              className={"px-6 py-3 rounded-full font-semibold whitespace-nowrap transition-all " + (tab === 'listings' ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200')}
            >
              📦 Pending Listings ({listings.length})
            </button>
          </div>

          {tab === 'sellers' ? (
            sellers.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">✨</div>
                <p className="text-xl font-bold text-charcoal">All caught up!</p>
                <p className="text-gray-500 mt-2">No pending sellers to review.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sellers.map(seller => (
                  <div key={seller.id} className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-lg font-bold text-gold-dark mb-3">
                      {seller.full_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <p className="font-bold text-charcoal">{seller.full_name || 'No name'}</p>
                    <p className="text-sm text-gray-500 mb-4">Applied {new Date(seller.created_at).toLocaleDateString()}</p>

                    {seller.whatsapp_number && (
                      <a
                        href={"https://wa.me/" + seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! This is Campus Plug 🔌 verifying your seller application. Reply YES if this is really you.")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center py-3 mb-2 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 transition-colors text-sm"
                      >
                        💬 WhatsApp +{seller.whatsapp_number}
                      </a>
                    )}

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => approveSeller(seller.id)}
                        className="flex-1 py-2.5 bg-charcoal text-white rounded-full font-semibold hover:bg-black transition-colors text-sm"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => rejectSeller(seller.id)}
                        className="py-2.5 px-4 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            listings.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">✨</div>
                <p className="text-xl font-bold text-charcoal">All caught up!</p>
                <p className="text-gray-500 mt-2">No pending listings to review.</p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {listings.map(listing => (
                  <div key={listing.id} className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
                    {listing.image_url ? (
                      <img src={listing.image_url} alt={listing.title} className="w-full h-48 object-cover" />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-charcoal to-gray-800 flex items-center justify-center">
                        <span className="text-5xl opacity-40">{listing.listing_type === 'service' ? '💼' : '📦'}</span>
                      </div>
                    )}

                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={"text-xs font-bold px-2 py-1 rounded-full " + (listing.listing_type === 'service' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                          {listing.listing_type === 'service' ? '💼 Service' : '📦 Product'}
                        </span>
                        <span className="text-xs text-gray-500">{new Date(listing.created_at).toLocaleDateString()}</span>
                      </div>

                      <h3 className="font-bold text-charcoal text-lg mb-1">{listing.title}</h3>
                      <p className="text-2xl font-bold text-gold-dark mb-2">GH₵ {Number(listing.price).toLocaleString()}</p>

                      {listing.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-3">{listing.description}</p>
                      )}

                      {listing.service_duration && (
                        <p className="text-xs text-gray-500">⏱ {listing.service_duration}</p>
                      )}
                      {listing.service_location && (
                        <p className="text-xs text-gray-500">📍 {listing.service_location}</p>
                      )}

                      <p className="text-xs text-gray-400 mt-3 mb-4">
                        by {listing.seller?.full_name || 'Unknown'}
                      </p>

                      <div className="flex gap-2">
                        <button
                          onClick={() => approveListing(listing.id)}
                          className="flex-1 py-2.5 bg-charcoal text-white rounded-full font-semibold hover:bg-black transition-colors text-sm"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => rejectListing(listing.id, listing.title)}
                          className="py-2.5 px-4 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </section>
    </main>
  )
}