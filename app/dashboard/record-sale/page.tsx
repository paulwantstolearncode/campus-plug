'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/format'

interface SaleListing {
  id: string
  title: string
  price: number
  listing_items: { id: string; name: string; price: number }[] | null
}

interface LineSelection {
  listing_item_id: string | null
  item_name: string
  item_price: number
  quantity: number
  selected: boolean
}

export default function RecordSalePage() {
  const [listings, setListings] = useState<SaleListing[]>([])
  const [selectedListingId, setSelectedListingId] = useState('')
  const [lines, setLines] = useState<LineSelection[]>([])
  const [simpleQty, setSimpleQty] = useState('1')
  const [simpleUnitPrice, setSimpleUnitPrice] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [buyerWhatsapp, setBuyerWhatsapp] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
          .select('is_seller')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Record sale profile lookup failed:', profileError)
          setError('Could not verify your seller account: ' + profileError.message)
          return
        }

        if (!profile?.is_seller) {
          router.push('/become-seller')
          return
        }

        // The seller's own product listings, with bundle items so we can tell
        // bundled listings (line-item picker) from simple ones (qty + price).
        const { data, error: listError } = await supabase
          .from('listings')
          .select('id, title, price, listing_items (id, name, price)')
          .eq('seller_id', user.id)
          .eq('listing_type', 'product')
          .order('created_at', { ascending: false })

        if (listError) {
          console.error('Record sale listings fetch failed:', listError)
          setError('Could not load your product listings: ' + listError.message)
        } else if (data) {
          setListings(data as unknown as SaleListing[])
        }
      } catch (err) {
        console.error('Record sale load failed:', err)
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router])

  const selectedListing = listings.find((l) => l.id === selectedListingId) || null
  const isBundle = !!selectedListing && (selectedListing.listing_items?.length ?? 0) > 0

  const handleListingChange = (id: string) => {
    setSelectedListingId(id)
    setLines([])
    setSimpleQty('1')
    setSimpleUnitPrice('')
    const listing = listings.find((l) => l.id === id)
    if (listing && (listing.listing_items?.length ?? 0) > 0) {
      setLines((listing.listing_items || []).map((item) => ({
        listing_item_id: item.id,
        item_name: item.name,
        item_price: Number(item.price),
        quantity: 1,
        selected: false,
      })))
    } else if (listing) {
      setSimpleUnitPrice(String(listing.price))
    }
  }

  const updateLine = (idx: number, patch: Partial<LineSelection>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)))
  }

  const total = isBundle
    ? lines
        .filter((l) => l.selected)
        .reduce((sum, l) => sum + (Number(l.item_price) || 0) * (Number(l.quantity) || 0), 0)
    : (Number(simpleUnitPrice) || 0) * (Number(simpleQty) || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedListing) {
      alert('Please choose which listing the sale came from')
      return
    }

    if (isBundle) {
      if (!lines.some((l) => l.selected)) {
        alert('Select at least one item that was sold')
        return
      }
      for (const line of lines) {
        if (line.selected && (Number(line.quantity) < 1 || !Number.isInteger(Number(line.quantity)))) {
          alert('Quantities must be whole numbers of at least 1')
          return
        }
      }
    } else {
      if (Number(simpleQty) < 1 || !Number.isInteger(Number(simpleQty))) {
        alert('Quantity must be a whole number of at least 1')
        return
      }
      if (simpleUnitPrice.trim() === '' || Number.isNaN(Number(simpleUnitPrice)) || Number(simpleUnitPrice) < 0) {
        alert('Please enter a valid unit price')
        return
      }
    }

    if (total <= 0) {
      alert('The sale total must be more than 0')
      return
    }

    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert('You must be logged in')
        setSaving(false)
        return
      }

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          listing_id: selectedListing.id,
          seller_id: user.id,
          buyer_name: buyerName.trim() || null,
          buyer_whatsapp: buyerWhatsapp.trim() || null,
          total_amount: Math.round(total * 100) / 100,
          seller_notes: notes.trim() || null,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (saleError) {
        console.error('Record sale insert failed:', saleError)
        alert('Could not record the sale. Please try again. (Run add_sales_tracking.sql if this is the first time.)')
        setSaving(false)
        return
      }

      const saleId = sale?.id
      if (saleId) {
        const itemRows = isBundle
          ? lines
              .filter((l) => l.selected)
              .map((l) => ({
                sale_id: saleId,
                listing_item_id: l.listing_item_id,
                item_name: l.item_name.trim() || 'Item',
                item_price: Math.round(Number(l.item_price) * 100) / 100,
                quantity: Number(l.quantity),
                subtotal: Math.round(Number(l.item_price) * Number(l.quantity) * 100) / 100,
              }))
          : [{
              sale_id: saleId,
              listing_item_id: null,
              item_name: selectedListing.title,
              item_price: Math.round(Number(simpleUnitPrice) * 100) / 100,
              quantity: Number(simpleQty),
              subtotal: Math.round(total * 100) / 100,
            }]

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(itemRows)

        if (itemsError) {
          console.error('Record sale items insert failed:', itemsError)
          alert('⚠️ The sale was recorded but its line items could not be saved. Please contact support.')
        }
      }

      router.push('/dashboard?recorded=1')
    } catch (err) {
      console.error('Record sale failed:', err)
      alert('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back to dashboard
          </Link>
        </div>
      </nav>

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Product Sales</div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
            Record a <span className="gradient-text">product sale</span>
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70">Keep your sales history accurate — it&apos;s private to you.</p>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-8">
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {!error && listings.length === 0 && (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4">📦</div>
              <p className="text-xl font-bold text-charcoal">No product listings yet</p>
              <p className="text-gray-500 mt-2 mb-6">You need at least one product listing to record a sale.</p>
              <Link href="/new" className="inline-flex items-center gap-2 bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors">＋ Post a product listing</Link>
            </div>
          )}

          {listings.length > 0 && (
            <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 border border-gray-100 space-y-6">
              {/* Listing picker */}
              <div>
                <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Which listing was the sale from? *</label>
                <select
                  value={selectedListingId}
                  onChange={(e) => handleListingChange(e.target.value)}
                  required
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal bg-white focus:outline-none focus:border-gold transition-colors text-lg"
                >
                  <option value="" disabled>Select a product listing…</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
              </div>

              {selectedListing && isBundle && (
                <div>
                  <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Select items sold *</label>
                  <div className="space-y-3">
                    {lines.map((line, idx) => (
                      <div key={idx} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={line.selected}
                              onChange={(e) => updateLine(idx, { selected: e.target.checked })}
                              className="mt-1 w-4 h-4 accent-charcoal"
                            />
                            <span>
                              <span className="font-semibold text-charcoal text-sm block">{line.item_name}</span>
                              <span className="text-xs text-gray-500">{formatPrice(line.item_price)}</span>
                            </span>
                          </label>
                          {line.selected && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-600 font-semibold">Qty</label>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                                className="w-16 px-2 py-1.5 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-sm font-semibold"
                              />
                            </div>
                          )}
                        </div>
                        {line.selected && (
                          <p className="text-xs font-bold text-gold-dark mt-2 text-right">
                            = {formatPrice((Number(line.item_price) || 0) * (Number(line.quantity) || 0))}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Select every item included in this sale.</p>
                </div>
              )}

              {selectedListing && !isBundle && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Quantity sold *</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={simpleQty}
                      onChange={(e) => setSimpleQty(e.target.value)}
                      required
                      className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">Amount per unit (GH₵) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={simpleUnitPrice}
                      onChange={(e) => setSimpleUnitPrice(e.target.value)}
                      required
                      className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
                    />
                  </div>
                </div>
              )}

              {/* Total */}
              {selectedListing && (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/20 flex items-center justify-between">
                  <span className="text-sm font-bold text-charcoal uppercase tracking-widest">Total</span>
                  <span className="text-2xl font-bold text-gold-dark">{formatPrice(total)}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                  Buyer name <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ama"
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                  Buyer WhatsApp <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 233201234567"
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                  value={buyerWhatsapp}
                  onChange={(e) => setBuyerWhatsapp(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-charcoal mb-3 uppercase tracking-widest">
                  Notes <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Any details worth remembering..."
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-charcoal text-white py-4 rounded-2xl font-bold text-lg hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-charcoal/25"
                >
                  {saving ? 'Recording...' : '📝 Record Sale'}
                </button>
                <Link
                  href="/dashboard"
                  className="flex-1 bg-white text-charcoal py-4 rounded-2xl font-bold text-lg border border-gray-200 hover:border-charcoal transition-colors text-center"
                >
                  Cancel
                </Link>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Sales are private to you and Campus Plug admins. You can edit a sale within 24 hours of recording it.
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
