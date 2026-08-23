'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatName } from '@/lib/formatName'
import {
  CAMPUS_LOCATIONS,
  ALL_LOCATIONS,
  suggestLocation,
  getUnassignedListings,
  updateListingLocation,
  type UnassignedListing,
} from '@/lib/campusLocations'

export default function AdminLocationsPage() {
  const [listings, setListings] = useState<UnassignedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const router = useRouter()

  // Check admin access
  useEffect(() => {
    async function checkAdmin() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (profileError) {
          setError('Could not verify admin access: ' + profileError.message)
          return
        }
        if (!profile?.is_admin) {
          alert('Admin access only')
          router.push('/')
          return
        }

        setIsAdmin(true)
        const data = await getUnassignedListings()
        setListings(data)

        // Pre-populate suggestions
        const initial: Record<string, string> = {}
        for (const listing of data) {
          const suggestion = suggestLocation(listing.title, listing.description)
          if (suggestion) initial[listing.id] = suggestion
        }
        setAssignments(initial)
      } catch (err) {
        console.error('Could not load location backfill:', err)
        setError('Could not load data. Check your connection and try again.')
      } finally {
        setLoading(false)
      }
    }
    checkAdmin()
  }, [router])

  // Smart suggestions for each listing
  const suggestions = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const listing of listings) {
      map[listing.id] = suggestLocation(listing.title, listing.description)
    }
    return map
  }, [listings])

  const suggestionCount = useMemo(
    () => Object.values(suggestions).filter(Boolean).length,
    [suggestions]
  )

  async function saveLocation(id: string) {
    const location = assignments[id]
    if (!location) return
    setSaving(id)
    const { error: saveError } = await updateListingLocation(id, location)
    if (saveError) {
      alert('Failed: ' + saveError)
    } else {
      setListings(prev => prev.filter(l => l.id !== id))
      setAssignments(prev => { const next = { ...prev }; delete next[id]; return next })
      setSuccessMessage('Location saved!')
      setTimeout(() => setSuccessMessage(null), 3000)
    }
    setSaving(null)
  }

  async function bulkAutoAssign() {
    setBulkSaving(true)
    let assigned = 0
    let failed = 0

    for (const listing of listings) {
      const suggestion = suggestions[listing.id]
      const location = assignments[listing.id] || suggestion
      if (!location) continue

      const { error: saveError } = await updateListingLocation(listing.id, location)
      if (saveError) {
        failed++
      } else {
        assigned++
      }
    }

    setSuccessMessage(`Bulk assign complete: ${assigned} updated${failed ? `, ${failed} failed` : ''}`)
    setTimeout(() => setSuccessMessage(null), 5000)

    // Refresh list
    const data = await getUnassignedListings()
    setListings(data)
    const initial: Record<string, string> = {}
    for (const l of data) {
      const s = suggestLocation(l.title, l.description)
      if (s) initial[l.id] = s
    }
    setAssignments(initial)
    setBulkSaving(false)
  }

  function applySuggestion(id: string) {
    const suggestion = suggestions[id]
    if (suggestion) {
      setAssignments(prev => ({ ...prev, [id]: suggestion }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading location backfill...</p>
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
          <Link href="/admin" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Review Queue
          </Link>
        </div>
      </nav>

      <section className="pt-32 pb-12 animated-gradient">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Admin Dashboard</div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">📍 Location Backfill</h1>
            <p className="text-white/70">Assign campus locations to legacy listings so they appear in location-filtered search.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/admin/sales" className="inline-flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-white/20 transition-colors">
              💰 Sales
            </Link>
            <Link href="/admin/feedback" className="inline-flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-white/20 transition-colors">
              💬 Feedback
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-off-white -mt-4 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              ✅ {successMessage}
            </div>
          )}

          {/* Counter & bulk actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-charcoal">
                <span className="text-lg font-bold">{listings.length}</span> listings need location backfill
              </span>
              {suggestionCount > 0 && (
                <span className="text-xs font-semibold text-gold-dark bg-gold/10 px-3 py-1 rounded-full">
                  ✨ {suggestionCount} auto-suggested
                </span>
              )}
            </div>
            {suggestionCount > 0 && (
              <button
                onClick={bulkAutoAssign}
                disabled={bulkSaving}
                className="bg-gold text-charcoal px-6 py-3 rounded-full font-bold hover:bg-gold/90 transition-colors disabled:opacity-50 shadow-lg shadow-gold/25 text-sm"
              >
                {bulkSaving ? 'Saving...' : `⚡ Bulk Auto-Assign All Suggestions (${suggestionCount})`}
              </button>
            )}
          </div>

          {listings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4">✨</div>
              <p className="text-xl font-bold text-charcoal">All caught up!</p>
              <p className="text-gray-500 mt-2">Every listing has a campus location assigned.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {listings.map((listing) => {
                const sellerName = listing.seller?.full_name ? formatName(listing.seller.full_name) : 'Unknown'
                const suggestion = suggestions[listing.id]
                const currentAssignment = assignments[listing.id] || ''
                const hasSuggestion = !!suggestion
                const hasAssignment = !!currentAssignment

                return (
                  <div key={listing.id} className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
                    <div className="flex flex-col md:flex-row gap-4">
                      {/* Thumbnail */}
                      <div className="w-full md:w-24 h-24 rounded-2xl overflow-hidden bg-gray-100 shrink-0">
                        {listing.image_url ? (
                          <img src={listing.image_url} alt={listing.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-off-white">
                            <span className="text-3xl opacity-40">{listing.listing_type === 'service' ? '💼' : '📦'}</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + (listing.listing_type === 'service' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                            {listing.listing_type === 'service' ? 'SERVICE' : 'PRODUCT'}
                          </span>
                          {listing.category && (
                            <span className="text-xs text-gray-500">{listing.category}</span>
                          )}
                        </div>
                        <h3 className="font-bold text-charcoal text-base line-clamp-1">{listing.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">by {sellerName}</p>

                        {/* Smart suggestion badge */}
                        {hasSuggestion && !hasAssignment && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-dark bg-gold/10 border border-gold/30 px-3 py-1 rounded-full">
                              ✨ Suggested: {suggestion}
                            </span>
                            <button
                              onClick={() => applySuggestion(listing.id)}
                              className="text-xs font-bold text-white bg-gold px-3 py-1 rounded-full hover:bg-gold/90 transition-colors"
                            >
                              Apply
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Location selector + save */}
                      <div className="flex flex-col gap-2 md:w-64 shrink-0">
                        <select
                          value={currentAssignment}
                          onChange={(e) => setAssignments(prev => ({ ...prev, [listing.id]: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-2xl border-2 border-gray-200 text-sm font-semibold text-charcoal bg-white focus:outline-none focus:border-gold transition-colors"
                        >
                          <option value="">— Select location —</option>
                          <optgroup label="🏠 Halls">
                            {CAMPUS_LOCATIONS.halls.map(loc => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </optgroup>
                          <optgroup label="🏢 Hostels">
                            {CAMPUS_LOCATIONS.hostels.map(loc => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </optgroup>
                          <optgroup label="🌆 Off-Campus">
                            {CAMPUS_LOCATIONS.offCampus.map(loc => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </optgroup>
                          <optgroup label="🔀 Flexible">
                            {CAMPUS_LOCATIONS.flexible.map(loc => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                          </optgroup>
                        </select>
                        <button
                          onClick={() => saveLocation(listing.id)}
                          disabled={!hasAssignment || saving === listing.id}
                          className="w-full py-2.5 bg-charcoal text-white rounded-full font-semibold hover:bg-black transition-colors disabled:opacity-40 text-sm"
                        >
                          {saving === listing.id ? 'Saving...' : '💾 Save Location'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
