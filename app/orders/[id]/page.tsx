'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import {
  getOrderWithEvents,
  advanceOrderStatus,
  canAdvance,
  orderStatusLabel,
  type Order,
  type OrderEvent,
} from '@/lib/orders'

interface EventRow extends OrderEvent {
  actor?: { full_name: string | null } | null
}

export default function OrderDetailPage() {
  const [order, setOrder] = useState<Order | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const params = useParams()
  const rawId = params.id
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId

  const loadOrder = useCallback(async () => {
    if (!orderId) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)
      const result = await getOrderWithEvents(orderId, user.id)
      if (!result.order) {
        setError('Order not found or you are not a party to it.')
        return
      }
      setOrder(result.order)
      setEvents(result.events)
      setError('')
    } catch (err) {
      console.error('Failed to load order:', err)
      setError('Could not load the order. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [orderId, router])

  useEffect(() => {
    async function init() {
      await loadOrder()
    }
    init()
  }, [loadOrder])

  const otherParty = () => {
    if (!order || !userId) return null
    return order.buyer_id === userId ? order.seller : order.buyer
  }

  const otherName = () => {
    const party = otherParty()
    return party?.full_name ? formatName(party.full_name) : 'Unknown'
  }

  const isSeller = order ? order.seller_id === userId : false

  const statusSteps: Order['status'][] = [
    'confirmed', 'paid', 'preparing', 'shipped', 'delivered', 'complete',
  ]

  const handleAdvance = async (toStatus: Order['status']) => {
    if (!order || !orderId) return
    if (!canAdvance(order, userId!, toStatus)) return

    setSaving(true)
    try {
      const advanceResult = await advanceOrderStatus(orderId, toStatus, 'Status updated from order page')
      if (advanceResult.error) {
        setError(advanceResult.error)
        return
      }
      // Refresh to reflect the new status + new event row
      await loadOrder()
      setError('')
    } catch (err) {
      console.error('Advance failed:', err)
      setError('Failed to update order status. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const availableTransitions = order ? (
    statusSteps
      .filter((s) => s !== order.status && canAdvance(order, userId!, s))
      .concat(order.status === 'complete' || order.status === 'cancelled' ? [] : ['cancelled'] as Order['status'][])
      .filter((s, i, arr) => arr.indexOf(s) === i)
  ) : ([] as Order['status'][])

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" />
        <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
            <div className="space-y-4">
              <div className="h-4 w-1/3 skeleton-shimmer-light" />
              <div className="h-40 skeleton-shimmer-light rounded-2xl" />
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (error || !order) {
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
            <button
              onClick={() => router.push('/orders')}
              className="bg-ink text-white px-5 py-2 rounded-full font-semibold hover:bg-black transition-colors"
            >
              ← Back to orders
            </button>
          </div>
        </section>
      </main>
    )
  }

  const name = otherName()
  const listingTitle = order.listing?.title || 'General order'

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" back={{ href: '/orders', label: 'Back to orders' }} />

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Order</p>
                <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                  {listingTitle}
                </h1>
                <p className="text-xs text-ink-muted mt-1">
                  With {name} · {formatPrice(order.amount)} · {order.kind === 'product' ? 'Product' : 'Service'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border border-rule text-charcoal">
                Order #{order.id.slice(0, 8)}
              </span>
            </div>

            {/* Status chip */}
            <div className="mt-4 flex items-center gap-3">
              <span className={`inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-bold ${
                order.status === 'complete' ? 'bg-green-100 text-green-700 border border-green-200' :
                order.status === 'cancelled' ? 'bg-red-100 text-red-700 border border-red-200' :
                'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
                {orderStatusLabel(order.status)}
              </span>
              {order.completed_at && (
                <span className="text-xs text-ink-muted">Completed {new Date(order.completed_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          {/* Status timeline */}
          <div className="mb-8">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Status history</p>
            <div className="relative space-y-6">
              {/* Timeline line */}
              <div className="absolute left-3 top-6 bottom-6 w-0.5 border border-rule" />

              {statusSteps.map((step, idx) => {
                const isActive = step === order.status
                const isReached = statusSteps.indexOf(order.status) >= idx
                const event = events.find((e) => e.to_status === step)
                const actorName = event?.actor?.full_name ? formatName(event.actor.full_name) : 'System'
                const isBuyerOrSeller = event ? (event.actor_id === order.buyer_id ? 'Buyer' : event.actor_id === order.seller_id ? 'Seller' : '') : ''
                return (
                  <div key={step} className="relative pl-12">
                    <div className={`w-3 h-3 rounded-full absolute left-[calc(50%-6px)] top-2 border-2 ${
                      isReached ? 'bg-gold border-gold' : 'bg-white/90 border-rule'
                    }`} />
                    <div className="flex items-start gap-3">
                      <div className="mt-1 min-w-0">
                        <p className={`text-sm font-semibold ${isActive ? 'text-charcoal' : 'text-ink-muted'}`}>
                          {orderStatusLabel(step)}
                        </p>
                        {event && (
                          <p className="text-xs text-ink-muted">
                            {isBuyerOrSeller ? isBuyerOrSeller + ' · ' : ''}{actorName}{event.note ? ' — ' + event.note : ''}
                          </p>
                        )}
                        <p className="text-[10px] text-ink-muted">
                          {event ? new Date(event.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
              {order.status === 'cancelled' && (
                <div className="relative pl-12">
                  <div className="w-3 h-3 rounded-full absolute left-[calc(50%-6px)] top-2 bg-red-500 border-2 border-red-500" />
                  <div className="flex items-start gap-3">
                    <div className="mt-1 min-w-0">
                      <p className="text-sm font-semibold text-red-700">Cancelled</p>
                      <p className="text-[10px] text-ink-muted">Order was cancelled.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Order details */}
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-6 md:p-8 shadow-xl border border-rule mb-8">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-4">Order details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Buyer</p>
                <p className="text-sm text-ink">{order.buyer_name || (order.buyer ? formatName(order.buyer.full_name) : 'Offline buyer')}</p>
                {order.buyer_whatsapp && (
                  <p className="text-xs text-ink-muted font-mono mt-1">{order.buyer_whatsapp}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Seller</p>
                <p className="text-sm text-ink">{name}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Type</p>
                <p className="text-sm text-ink">{order.kind === 'product' ? 'Product' : 'Service'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Payment</p>
                <p className="text-sm text-ink">{order.payment_method === 'prepaid' ? 'Prepaid' : 'Pay on delivery / cash'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Amount</p>
                <p className="text-lg font-bold text-gold-dark">{formatPrice(order.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Created</p>
                <p className="text-sm text-ink">{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Advance status actions */}
          {availableTransitions.length > 0 && (
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-4">
                Update status
              </p>
              <p className="text-xs text-ink-muted mb-4">
                {isSeller ? 'As the seller, you can advance the order through fulfillment.' : 'As the buyer, you can confirm delivery or cancel.'}
              </p>
              <div className="flex flex-wrap gap-3">
                {availableTransitions.map((status) => {
                  const variant = status === 'complete' ? 'bg-green-500 text-white hover:bg-green-600' :
                    status === 'cancelled' ? 'bg-white text-red-600 border border-red-200 hover:border-red-400 hover:bg-red-50' :
                    'bg-ink text-white hover:bg-black'
                  return (
                    <button
                      key={status}
                      onClick={() => handleAdvance(status)}
                      disabled={saving}
                      className={`px-5 py-2.5 rounded-full font-semibold text-sm transition-colors disabled:opacity-50 ${variant}`}
                    >
                      {saving ? 'Updating...' : orderStatusLabel(status)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Events log */}
          {events.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">All events</p>
              <div className="space-y-3">
                {events.map((e) => {
                  const actorName = e.actor?.full_name ? formatName(e.actor.full_name) : 'System'
                  return (
                    <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl border border-rule bg-white/80">
                      <div className="mt-1 text-[10px] text-ink-muted font-mono">{new Date(e.created_at).toLocaleDateString()}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">{actorName} moved the order from <span className="font-semibold">{e.from_status || '—'}</span> to <span className="font-semibold">{orderStatusLabel(e.to_status)}</span></p>
                        {e.note && (
                          <p className="text-xs text-ink-muted mt-1">{e.note}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-8">
            <button
              onClick={() => router.push('/orders')}
              className="text-sm text-gold hover:underline font-medium"
            >
              ← Back to orders
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
