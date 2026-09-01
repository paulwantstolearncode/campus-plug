'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import { formatPrice } from '@/lib/format'
import { isWithinEditWindow, formatDateTime } from '@/lib/sales'

interface SaleLine {
  id: string
  item_name: string
  item_price: number
  quantity: number
  subtotal: number
}

interface SaleData {
  id: string
  buyer_name: string | null
  buyer_whatsapp: string | null
  total_amount: number
  seller_notes: string | null
  status: string
  created_at: string
  listing: { id: string; title: string } | null
  sale_items: SaleLine[] | null
}

export default function SaleDetailPage() {
  const [sale, setSale] = useState<SaleData | null>(null)
  const [buyerName, setBuyerName] = useState('')
  const [buyerWhatsapp, setBuyerWhatsapp] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<SaleLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const rawId = params.id
  const saleId = Array.isArray(rawId) ? rawId[0] : rawId

  useEffect(() => {
    async function loadSale() {
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
          console.error('Sale detail profile lookup failed:', profileError)
          setError('Could not verify your seller account: ' + profileError.message)
          return
        }

        if (!profile?.is_seller) {
          router.push('/become-seller')
          return
        }

        if (!saleId) {
          router.push('/dashboard')
          return
        }

        // RLS only exposes the caller's own sales, so someone else's sale
        // simply returns no row.
        const { data } = await supabase
          .from('sales')
          .select('*, listing:listings!listing_id (id, title), sale_items (id, item_name, item_price, quantity, subtotal)')
          .eq('id', saleId)
          .single()

        if (!data) {
          alert('Sale not found')
          router.push('/dashboard')
          return
        }

        const typed = data as unknown as SaleData
        typed.sale_items = (typed.sale_items || []).sort((a, b) => a.id.localeCompare(b.id))

        setSale(typed)
        setBuyerName(typed.buyer_name || '')
        setBuyerWhatsapp(typed.buyer_whatsapp || '')
        setNotes(typed.seller_notes || '')
        setLines(typed.sale_items || [])
      } catch (err) {
        console.error('Sale detail load failed:', err)
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadSale()
  }, [saleId, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading sale...</p>
        </div>
      </div>
    )
  }

  if (error || !sale) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md text-center shadow-xl">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-600 font-semibold">{error || 'Sale not found'}</p>
          <Link href="/dashboard" className="inline-block mt-5 text-sm text-white bg-charcoal rounded-full px-5 py-2.5 hover:bg-black transition-colors">← Back to dashboard</Link>
        </div>
      </div>
    )
  }

  const editable = isWithinEditWindow(sale.created_at)
  const editedTotal = lines.reduce((sum, l) => sum + (Number(l.item_price) || 0) * (Number(l.quantity) || 0), 0)

  const updateLine = (idx: number, patch: Partial<SaleLine>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)))
  }

  const saveEdits = async () => {
    if (editedTotal < 0) {
      alert('The total can&apos;t be negative')
      return
    }
    for (const line of lines) {
      if (Number(line.quantity) < 1 || !Number.isInteger(Number(line.quantity))) {
        alert('Quantities must be whole numbers of at least 1')
        return
      }
    }

    setSaving(true)
    try {
      const { error: saleError } = await supabase
        .from('sales')
        .update({
          buyer_name: buyerName.trim() || null,
          buyer_whatsapp: buyerWhatsapp.trim() || null,
          seller_notes: notes.trim() || null,
          total_amount: Math.round(editedTotal * 100) / 100,
        })
        .eq('id', sale.id)

      if (saleError) {
        alert('Could not save the sale: ' + saleError.message)
        setSaving(false)
        return
      }

      for (const line of lines) {
        const { error: lineError } = await supabase
          .from('sale_items')
          .update({
            item_name: line.item_name.trim() || 'Item',
            item_price: Math.round(Number(line.item_price) * 100) / 100,
            quantity: Number(line.quantity),
            subtotal: Math.round(Number(line.item_price) * Number(line.quantity) * 100) / 100,
          })
          .eq('id', line.id)

        if (lineError) {
          console.error('Sale line update failed:', lineError)
          alert('⚠️ The sale was saved but some line items could not be updated.')
          break
        }
      }

      setSale((prev) => prev ? {
        ...prev,
        buyer_name: buyerName.trim() || null,
        buyer_whatsapp: buyerWhatsapp.trim() || null,
        seller_notes: notes.trim() || null,
        total_amount: Math.round(editedTotal * 100) / 100,
      } : prev)

      alert('✅ Sale updated')
    } catch (err) {
      console.error('Save sale edits failed:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (status: string) => {
    const label = status === 'completed' ? 'completed' : status === 'refunded' ? 'refunded' : 'cancelled'
    if (!confirm('Mark this sale as ' + label + '?')) return

    const { error } = await supabase
      .from('sales')
      .update({ status })
      .eq('id', sale.id)

    if (error) {
      alert('Could not update status: ' + error.message)
      return
    }

    setSale((prev) => prev ? { ...prev, status } : prev)
  }

  const statusOptions: { status: string; label: string }[] =
    sale.status === 'completed'
      ? [{ status: 'refunded', label: '↩️ Mark Refunded' }, { status: 'cancelled', label: '❌ Mark Cancelled' }]
      : sale.status === 'refunded'
        ? [{ status: 'completed', label: '✅ Mark Completed' }, { status: 'cancelled', label: '❌ Mark Cancelled' }]
        : [{ status: 'completed', label: '✅ Mark Completed' }, { status: 'refunded', label: '↩️ Mark Refunded' }]

  const statusChip = (status: string) => {
    if (status === 'completed') {
      return <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">✅ Completed</span>
    }
    if (status === 'refunded') {
      return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold">↩️ Refunded</span>
    }
    return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">❌ Cancelled</span>
  }

  return (
    <main className="min-h-screen bg-charcoal">
<NavBar variant="dashboard" back={{ href: '/dashboard', label: 'Back to dashboard' }} />

      <section className="relative pt-32 pb-12 md:pt-36 md:pb-14 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-purple-100 text-purple-700">📦 Product Sale</span>
            {statusChip(sale.status)}
            {!editable && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 text-white/70 border border-white/20">🔒 Edit window closed</span>
            )}
          </div>
          <h1 className="fade-up fade-up-delay-1 text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-3">
            {sale.listing?.title || 'Unknown listing'}
          </h1>
          <div className="fade-up fade-up-delay-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <span className="text-3xl md:text-4xl font-bold gradient-text">{formatPrice(sale.total_amount)}</span>
            <span className="text-sm text-white/60 mb-1.5">Recorded {formatDateTime(sale.created_at)}</span>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

          {editable && (
            <div className="mb-6 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium">
              ✏️ You can edit this sale until {formatDateTime(new Date(new Date(sale.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString())}.
            </div>
          )}

          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 space-y-6">
            {/* Line items */}
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Items Sold</p>
              {lines.length === 0 ? (
                <p className="text-sm text-gray-500">No line items recorded.</p>
              ) : (
                <div className="space-y-3">
                  {lines.map((line, idx) => (
                    <div key={line.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      {editable ? (
                        <>
                          <input
                            type="text"
                            value={line.item_name}
                            onChange={(e) => updateLine(idx, { item_name: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-sm font-semibold"
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-600 font-semibold">GH₵</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.item_price}
                              onChange={(e) => updateLine(idx, { item_price: Number(e.target.value) })}
                              className="w-28 px-3 py-1.5 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-sm font-semibold"
                            />
                            <span className="text-xs text-gray-600 font-semibold">× Qty</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.quantity}
                              onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                              className="w-16 px-3 py-1.5 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-sm font-semibold"
                            />
                            <span className="ml-auto text-sm font-bold text-gold-dark">
                              {formatPrice((Number(line.item_price) || 0) * (Number(line.quantity) || 0))}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-charcoal text-sm">{line.item_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatPrice(line.item_price)} × {line.quantity}
                            </p>
                          </div>
                          <span className="font-bold text-gold-dark text-sm">{formatPrice(line.subtotal)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <span className="text-sm font-bold text-charcoal uppercase tracking-widest">Total</span>
                <span className="text-2xl font-bold text-gold-dark">{formatPrice(editable ? editedTotal : sale.total_amount)}</span>
              </div>
            </div>

            {/* Buyer + notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2 uppercase tracking-widest">Buyer name</label>
                {editable ? (
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-gray-700">{buyerName || '—'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-charcoal mb-2 uppercase tracking-widest">Buyer WhatsApp</label>
                {editable ? (
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                    value={buyerWhatsapp}
                    onChange={(e) => setBuyerWhatsapp(e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-gray-700 font-mono">{buyerWhatsapp || '—'}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-charcoal mb-2 uppercase tracking-widest">Notes</label>
              {editable ? (
                <textarea
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-line">{notes || '—'}</p>
              )}
            </div>

            {editable && (
              <button
                onClick={saveEdits}
                disabled={saving}
                className="w-full bg-charcoal text-white py-4 rounded-2xl font-bold text-lg hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-charcoal/25"
              >
                {saving ? 'Saving...' : '💾 Save Changes'}
              </button>
            )}

            {/* Status controls — always available */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Sale Status</p>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.status}
                    onClick={() => changeStatus(opt.status)}
                    className={"inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full font-semibold text-sm transition-colors " + (opt.status === 'completed' ? 'bg-green-500 text-white hover:bg-green-600' : opt.status === 'refunded' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white text-red-600 border border-red-200 hover:border-red-400 hover:bg-red-50')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Status changes are always allowed — only the sale details (items, amount, notes) are locked after 24 hours.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
