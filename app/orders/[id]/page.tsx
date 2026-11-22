'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { COMMISSION_RATE, commission } from '@/lib/commerceConfig'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import {
  getOrderWithEvents,
  advanceOrderStatus,
  canAdvance,
  hasOpenDispute,
  orderActionLabel,
  orderStatusLabel,
  type Order,
  type OrderEvent,
  type OrderStatus,
} from '@/lib/orders'
import { OrderStatusChip } from '@/app/components/OrderStatusChip'
import { Celebrate } from '@/app/components/Celebrate'
import { openDispute } from '@/lib/disputes'

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
  const [celebrateComplete, setCelebrateComplete] = useState(false)
  // Dispute form state (item 9): open a dispute inline instead of navigating
  // to the list without creating one.
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeError, setDisputeError] = useState('')
  const [openingDispute, setOpeningDispute] = useState(false)
  // Dispute lock: when true, all status transitions are frozen until the
  // dispute is resolved.
  const [disputeLocked, setDisputeLocked] = useState(false)
  const [lockError, setLockError] = useState('')
  // Delivery proof (item 15): buyer records where they met before completing.
  const [showDeliveryProof, setShowDeliveryProof] = useState(false)
  const [deliveryProofNote, setDeliveryProofNote] = useState('')
  const [deliveryProofError, setDeliveryProofError] = useState('')
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

      // Check for an open dispute — if one exists, status transitions are frozen.
      try {
        const locked = await hasOpenDispute(orderId)
        setDisputeLocked(locked)
        if (locked) {
          setLockError(
            'This order has an open dispute. Status changes are frozen until an admin resolves the dispute.'
          )
        }
      } catch {
        // Non-fatal: if we can't check, don't block the page.
        setDisputeLocked(false)
      }
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
  const isBuyer = order ? order.buyer_id === userId && order.buyer_id !== null : false

  const statusSteps: OrderStatus[] = [
    'awaiting_payment',
    'paid',
    'collecting',
    'out_for_delivery',
    'delivered',
    'confirmed',
  ]

  const handleAdvance = async (toStatus: OrderStatus, deliveryNote?: string) => {
    if (!order || !orderId) return
    if (!canAdvance(order, userId!, toStatus, disputeLocked)) return

    // Delivery proof (item 15): buyer must record where they met before
    // confirming delivery. Skip for other transitions or non-buyers.
    if (toStatus === 'confirmed' && isBuyer && !deliveryNote) {
      setShowDeliveryProof(true)
      return
    }

    setSaving(true)
    try {
      const note = deliveryNote || `Status updated from order page${deliveryNote ? ' — ' + deliveryNote : ''}`
      const advanceResult = await advanceOrderStatus(orderId, toStatus, note)
      if (advanceResult.error) {
        setError(advanceResult.error)
        return
      }
      // Refresh to reflect the new status + new event row
      await loadOrder()
      setError('')

      // One-time celebration when the order reaches confirmation.
      if (toStatus === 'confirmed') {
        const key = `cp_celebrated_${orderId}`
        if (typeof window !== 'undefined' && !localStorage.getItem(key)) {
          localStorage.setItem(key, '1')
          setCelebrateComplete(true)
        }
      }
    } catch (err) {
      console.error('Advance failed:', err)
      setError('Failed to update order status. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitDeliveryProof = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId) return
    const note = deliveryProofNote.trim() || (order?.kind === 'service'
      ? 'Service confirmed as provided'
      : 'Delivery confirmed at campus meeting point')
    setShowDeliveryProof(false)
    setDeliveryProofError('')
    try {
      await handleAdvance('confirmed', note)
    } catch {
      setShowDeliveryProof(true)
    }
  }

  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId) return
    setOpeningDispute(true)
    setDisputeError('')
    try {
      const { id, error } = await openDispute({ orderId, reason: disputeReason })
      if (error) {
        // If a dispute already exists, still route to it rather than dead-end.
        if (id) {
          router.push('/disputes/' + id)
          return
        }
        setDisputeError(error)
        return
      }
      if (id) router.push('/disputes/' + id)
    } catch (err) {
      console.error('Failed to open dispute:', err)
      setDisputeError('Could not open the dispute. Please try again.')
    } finally {
      setOpeningDispute(false)
    }
  }

  const availableTransitions = order ? (
    statusSteps
      .filter((s) => s !== order.status && canAdvance(order, userId!, s, disputeLocked))
      .concat(canAdvance(order, userId!, 'cancelled', disputeLocked) ? ['cancelled'] as OrderStatus[] : [])
      .filter((s, i, arr) => arr.indexOf(s) === i)
  ) : ([] as OrderStatus[])

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" back={{ href: '/orders', label: 'Back to orders' }} />
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <div className="space-y-4">
              <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
              <div className="h-12 bg-white/10 rounded-xl w-3/4 mb-3 animate-pulse" />
              <div className="h-5 bg-white/10 rounded-lg w-1/2 animate-pulse" />
            </div>
          </div>
        </section>
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
        <NavBar variant="dark" back={{ href: '/orders', label: 'Back to orders' }} />
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
      <Celebrate trigger={celebrateComplete} />
      <NavBar variant="dark" back={{ href: '/orders', label: 'Back to orders' }} />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Order</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                {listingTitle}
              </h1>
              <p className="text-xs text-white/70 mt-1">
                With {name} · {formatPrice(order.amount)} · {order.kind === 'product' ? 'Product' : 'Service'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border border-white/20 text-white">
              Order #{order.id.slice(-4).toUpperCase()}
            </span>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

            {/* Status chip */}
            <div className="mt-4 flex items-center gap-3">
              <OrderStatusChip status={order.status} kind={order.kind} />
              {order.completed_at && (
                <span className="text-xs text-ink-muted">Completed {new Date(order.completed_at).toLocaleDateString()}</span>
              )}
            </div>

          {/* Status timeline */}
          <div className="mb-8">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Status history</p>
            <div className="relative space-y-6">
              {/* Timeline line */}
              <div className="absolute left-3 top-6 bottom-6 w-0.5 border border-rule" />

              {statusSteps.map((step, idx) => {
                const isActive = step === order.status
                const isReached = statusSteps.indexOf(order.status as OrderStatus) >= idx
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
                          {orderStatusLabel(step, order.kind)}
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
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule mb-8">
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
                <p className="text-sm text-ink">{order.seller?.full_name ? formatName(order.seller.full_name) : 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Type</p>
                <p className="text-sm text-ink">{order.kind === 'product' ? 'Product' : 'Service'}</p>
              </div>
              {order.kind === 'service' && (
                <div>
                  <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Appointment</p>
                  <p className="text-sm font-semibold text-ink">
                    {order.scheduled_for
                      ? new Date(order.scheduled_for).toLocaleString('en-GB', {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        })
                      : 'Not specified (legacy order)'}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Payment</p>
                <p className="text-sm text-ink">{order.payment_method === 'prepaid' ? 'Prepaid' : 'Pay on delivery / cash'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Amount</p>
                <p className="text-lg font-bold text-gold-dark">{formatPrice(order.amount)}</p>
              </div>
              {order.payment_method === 'prepaid' && order.status !== 'awaiting_payment' && order.status !== 'confirmed' && order.status !== 'cancelled' && (
                <div>
                  <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">
                    Funds held in escrow
                  </p>
                  <p className="text-sm text-ink">
                    {formatPrice(order.amount)}{' '}
                    {isBuyer
                       ? order.kind === 'service'
                         ? '(yours — released after you confirm the service)'
                         : '(yours — released on delivery confirmation)'
                       : '(seller gets paid on completion)'}
                  </p>
                </div>
              )}
              {isSeller && order.payment_method === 'prepaid' && (
                <div>
                  <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">
                    You&apos;ll receive
                  </p>
                  <p className="text-sm font-semibold text-gold-dark">
                    {formatPrice(Number(order.amount) - commission(order.amount))}
                  </p>
                  <p className="text-[10px] text-ink-muted mt-1">
                    Net of {Math.round(COMMISSION_RATE * 100)}% platform fee ({formatPrice(commission(order.amount))})
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Created</p>
                <p className="text-sm text-ink">{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Dispute lock banner */}
          {disputeLocked && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">
              <p className="text-xs font-bold text-red-800 uppercase tracking-widest mb-1">
                ⚠️ Order locked — open dispute
              </p>
              <p className="text-sm text-red-700">{lockError}</p>
              <p className="text-xs text-red-600 mt-2">
                An admin must resolve the dispute before the order status can change.
              </p>
            </div>
          )}

          {/* Delivery proof form (item 15): buyer records where they met */}
          {showDeliveryProof && availableTransitions.includes('confirmed') && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-gold/50 mb-8">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">
                {order.kind === 'service'
                  ? 'Service confirmation — confirm the service was provided'
                  : 'Delivery proof — confirm you received the item'}
              </p>
              <p className="text-sm text-ink-muted mb-4">
                {order.kind === 'service'
                  ? 'Add a short confirmation note (optional). Only confirm after the service has been provided.'
                  : <>Where did you meet? (e.g. &quot;{order.listing?.title}&quot; at {order.listing?.title ? 'campus meeting point' : 'campus'})</>}
              </p>
              <form onSubmit={handleSubmitDeliveryProof} className="space-y-3">
                <textarea
                  value={deliveryProofNote}
                  onChange={(e) => setDeliveryProofNote(e.target.value)}
                  rows={3}
                  placeholder={order.kind === 'service'
                    ? 'e.g. The service was completed as agreed at the scheduled appointment.'
                    : 'e.g. Met at the main gate near the library. Item matches the photos.'}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-rule text-ink placeholder:text-ink-muted focus:outline-none focus:border-gold transition-colors resize-none"
                />
                {deliveryProofError && (
                  <p className="text-xs text-red-600 font-medium">{deliveryProofError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-green-500 text-white py-3 rounded-full font-bold hover:bg-green-600 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {saving
                      ? 'Confirming…'
                      : order.kind === 'service'
                        ? 'Confirm service & release funds'
                        : 'Confirm delivery & release funds'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeliveryProof(false); setDeliveryProofNote(''); setDeliveryProofError('') }}
                    className="px-6 py-3 rounded-full font-semibold text-ink-muted border border-rule hover:bg-white/60 transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Buyers can return to an unpaid booking/order and finish checkout. */}
          {isBuyer && order.status === 'awaiting_payment' && order.payment_method === 'prepaid' && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-gold/50 mb-8">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-2">Payment required</p>
              <p className="text-sm text-ink-muted mb-4">
                {order.kind === 'service'
                  ? 'Pay with MoMo to confirm this booking. The seller will see the confirmed appointment after payment.'
                  : 'Complete MoMo checkout to hold your payment in escrow.'}
              </p>
              <Link
                href={'/checkout/' + order.id}
                className="inline-flex items-center justify-center w-full bg-gold text-charcoal px-6 py-3.5 rounded-full font-bold hover:bg-gold-dark transition-colors min-h-[44px]"
              >
                Pay {formatPrice(order.amount)} with MoMo
              </Link>
            </div>
          )}

          {/* Advance status actions */}
          {availableTransitions.length > 0 && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-4">
                Update status
              </p>
              <p className="text-xs text-ink-muted mb-4">
                {isSeller
                  ? order.kind === 'service'
                    ? 'Once the service has been provided, mark it delivered. The buyer then confirms completion to release escrow.'
                    : 'As the seller, you can advance the order through fulfillment.'
                  : order.kind === 'service'
                    ? 'Confirm the service only after it has been provided, or cancel the booking.'
                    : 'As the buyer, you can confirm delivery or cancel.'}
              </p>
              <div className="flex flex-wrap gap-3">
                {availableTransitions.map((status) => {
                  const variant = status === 'confirmed' ? 'bg-green-500 text-white hover:bg-green-600' :
                    status === 'cancelled' ? 'bg-white text-red-600 border border-red-200 hover:border-red-400 hover:bg-red-50' :
                    'bg-ink text-white hover:bg-black'
                  return (
                    <button
                      key={status}
                      onClick={() => handleAdvance(status)}
                      disabled={saving}
                      className={`px-5 py-2.5 rounded-full font-semibold text-sm transition-colors disabled:opacity-50 ${variant}`}
                    >
                      {saving
                        ? 'Updating...'
                        : status === 'cancelled' && order.status === 'paid'
                          ? 'Cancel order & start refund'
                          : orderActionLabel(status, order.kind)}
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
                        <p className="text-sm text-ink">{actorName} moved the order from <span className="font-semibold">{e.from_status || '—'}</span> to <span className="font-semibold">{orderStatusLabel(e.to_status, order.kind)}</span></p>
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

          {/* Delivered and cancelled orders both retain a recovery path. */}
          {(order.status === 'delivered' || order.status === 'cancelled') && (
            <div className="mt-8">
              {!showDisputeForm ? (
                <>
                  <button
                    onClick={() => setShowDisputeForm(true)}
                    className="flex items-center justify-center gap-2 w-full bg-white border-2 border-red-200 text-red-700 py-3.5 rounded-full font-semibold hover:bg-red-50 hover:border-red-400 transition-colors min-h-[44px]"
                  >
                    {order.status === 'cancelled' ? '⚠️ Open a recovery dispute' : '⚠️ Open a dispute'}
                  </button>
                  <p className="text-[11px] text-ink-muted text-center mt-2">
                    {order.status === 'cancelled'
                      ? 'A paid cancellation starts the refund process. Open a recovery dispute if you need an admin to review or complete that refund.'
                      : 'Something wrong with this order? Tell us what happened — an admin will review the refund or recovery options.'}
                  </p>
                </>
              ) : (
                <form
                  onSubmit={handleOpenDispute}
                  className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-red-200 space-y-4"
                >
                  <p className="text-xs font-bold text-charcoal uppercase tracking-widest">
                    Open a dispute
                  </p>
                  <p className="text-sm text-ink-muted">
                    Describe what went wrong. Both you and the seller, plus an admin, will see this and can discuss it before a decision is made.
                  </p>
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    rows={4}
                    maxLength={500}
                    placeholder="e.g. The laptop isn't what was shown in the photos…"
                    className="w-full px-4 py-3 rounded-2xl border-2 border-rule text-ink placeholder:text-ink-muted focus:outline-none focus:border-red-400 transition-colors resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-ink-muted">{disputeReason.length}/500</span>
                  </div>
                  {disputeError && (
                    <p className="text-xs text-red-600 font-medium">{disputeError}</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={openingDispute || disputeReason.trim().length < 5}
                      className="flex-1 bg-red-600 text-white py-3 rounded-full font-bold hover:bg-red-700 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      {openingDispute ? 'Opening…' : 'Submit dispute'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDisputeForm(false)
                        setDisputeReason('')
                        setDisputeError('')
                      }}
                      className="px-6 py-3 rounded-full font-semibold text-ink-muted border border-rule hover:bg-white/60 transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Leave a review */}
          {order.status === 'confirmed' && isBuyer && (
            <div className="mt-8">
              <Link
                href={'/reviews/new?orderId=' + order.id + '&sellerId=' + order.seller_id}
                className="flex items-center justify-center gap-2 w-full bg-gold text-charcoal px-6 py-3.5 rounded-full font-bold hover:bg-gold-dark transition-colors shadow-lg shadow-gold/30 min-h-[44px]"
              >
                ⭐ Leave a review for {order.seller?.full_name ? formatName(order.seller.full_name) : 'this seller'}
              </Link>
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
