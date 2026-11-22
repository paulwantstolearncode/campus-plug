'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import { queueRefund, type Disbursement } from '@/lib/wallet'
import { momoProviderForPhone, type MomoProvider } from '@/lib/momo'

interface DisputeDetail {
  id: string
  order_id: string
  opened_by: string
  reason: string
  status: 'open' | 'resolved' | 'closed'
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  order: {
    id: string
    amount: number
    status: string
    listing?: { title: string | null } | null
    buyer_id: string | null
    buyer_whatsapp?: string | null
    seller_id: string
    buyer?: { full_name: string | null; whatsapp_number?: string | null } | null
    seller?: { full_name: string | null } | null
  }
}

interface DisputeMessage {
  id: string
  dispute_id: string
  sender_id: string
  content: string
  created_at: string
  sender?: { full_name: string | null } | null
}

export default function DisputeDetailPage() {
  const [dispute, setDispute] = useState<DisputeDetail | null>(null)
  const [messages, setMessages] = useState<DisputeMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  // Partial refund amount state (item 12): admin can specify how much to refund.
  const [refundAmount, setRefundAmount] = useState('')
  const [showRefundAmountInput, setShowRefundAmountInput] = useState(false)
  // Money movement (item 2): resolving a refund queues a MoMo transfer; the
  // admin then sends it explicitly and sees the provider result.
  const [refundDisbursement, setRefundDisbursement] = useState<Disbursement | null>(null)
  const [refundPhone, setRefundPhone] = useState('')
  const [refundProvider, setRefundProvider] = useState<MomoProvider>('mtn')
  const [sendingRefund, setSendingRefund] = useState(false)
  const [refundNotice, setRefundNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const params = useParams()
  const rawId = params.id
  const disputeId = Array.isArray(rawId) ? rawId[0] : rawId

  const loadDispute = useCallback(async () => {
    if (!disputeId) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)

      // Fetch dispute + verify user is a party or admin
      const { data, error: dbError } = await supabase
        .from('disputes')
        .select(`
          *,
          order:orders (
            id, amount, status, buyer_whatsapp,
            listing:listings!listing_id (title),
            buyer:profiles!buyer_id (full_name, whatsapp_number),
            seller:profiles!seller_id (full_name)
          )
        `)
        .eq('id', disputeId)
        .maybeSingle()

      if (dbError) throw dbError
      if (!data) {
        setError('Dispute not found.')
        setLoading(false)
        return
      }

      const typed = data as DisputeDetail
      const isParty =
        typed.order.buyer_id === user.id || typed.order.seller_id === user.id

      // Check admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      const isAdminUser = !!profile?.is_admin
      setIsAdmin(isAdminUser)

      if (!isParty && !isAdminUser) {
        setError('You are not a party to this dispute.')
        setLoading(false)
        return
      }

      setDispute(typed)

      if (isAdminUser) {
        const { data: refundRow } = await supabase
          .from('disbursements')
          .select('*')
          .eq('dispute_id', disputeId)
          .eq('kind', 'buyer_refund')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        setRefundDisbursement((refundRow as Disbursement | null) ?? null)

        const detected =
          typed.order.buyer_whatsapp || typed.order.buyer?.whatsapp_number || ''
        if (detected) {
          setRefundPhone((prev) => prev || detected)
          setRefundProvider(momoProviderForPhone(detected))
        }
      }

      // Fetch messages
      const { data: msgData, error: msgError } = await supabase
        .from('dispute_messages')
        .select('*, sender:profiles!sender_id (full_name)')
        .eq('dispute_id', disputeId)
        .order('created_at', { ascending: true })

      if (msgError) throw msgError
      setMessages((msgData as DisputeMessage[]) || [])

      setError(null)
    } catch (err) {
      console.error('Failed to load dispute:', err)
      setError('Could not load dispute. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [disputeId, router])

  useEffect(() => {
    let cancelled = false
    if (!cancelled) {
      ;(async () => {
        await loadDispute()
      })()
    }
    return () => { cancelled = true }
  }, [loadDispute])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!disputeId || !userId || !newMessage.trim()) return

    setSending(true)
    try {
      const { error: msgError } = await supabase
        .from('dispute_messages')
        .insert({
          dispute_id: disputeId,
          sender_id: userId,
          content: newMessage.trim(),
        })

      if (msgError) throw msgError
      setNewMessage('')

      // Refresh messages
      const { data: msgData } = await supabase
        .from('dispute_messages')
        .select('*, sender:profiles!sender_id (full_name)')
        .eq('dispute_id', disputeId)
        .order('created_at', { ascending: true })
      setMessages((msgData as DisputeMessage[]) || [])
    } catch (err) {
      console.error('Failed to send message:', err)
      setError('Failed to send message. Try again.')
    } finally {
      setSending(false)
    }
  }

  const handleResolve = async (resolution: string, refundAmount?: string) => {
    if (!disputeId || !userId) return
    if (!confirm('Resolve this dispute as "' + resolution + '"? This cannot be undone.')) return

    try {
      // One SECURITY DEFINER call resolves the dispute, settles the order and
      // moves the money. advance_order() cannot be used here: admins are not a
      // party to the order, so its role check rejects the transition.
      const { error: rpcError } = await supabase.rpc('resolve_dispute', {
        p_dispute_id: disputeId,
        p_resolution: resolution,
        p_refund_amount: refundAmount ? Number(refundAmount) : null,
      })

      if (rpcError) throw rpcError

      await loadDispute()
      setRefundAmount('')
      setShowRefundAmountInput(false)
    } catch (err) {
      console.error('Failed to resolve dispute:', err)
      setError('Failed to resolve dispute. Try again.')
    }
  }

  const handleSendRefund = async () => {
    if (!disputeId || !dispute) return
    if (refundPhone.replace(/[^0-9]/g, '').length < 9) {
      setRefundNotice({ kind: 'error', text: 'Enter a valid buyer MoMo number.' })
      return
    }
    if (!confirm('Send the refund to ' + refundPhone + ' now? This moves real money.')) return

    setSendingRefund(true)
    setRefundNotice(null)

    try {
      let disbursementId = refundDisbursement?.id

      if (!disbursementId) {
        const queued = await queueRefund({
          disputeId,
          phone: refundPhone,
          provider: refundProvider,
        })
        if (queued.error || !queued.id) {
          setRefundNotice({ kind: 'error', text: queued.error || 'Could not queue the refund.' })
          return
        }
        disbursementId = queued.id
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setRefundNotice({ kind: 'error', text: 'Your session expired. Please sign in again.' })
        return
      }

      const res = await fetch('/api/momo/disburse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ disbursementId }),
      })
      const data = (await res.json()) as { status?: string; error?: string }

      if (!res.ok) {
        setRefundNotice({ kind: 'error', text: data.error || 'Could not send the refund.' })
        return
      }

      setRefundNotice({
        kind: 'ok',
        text:
          data.status === 'paid'
            ? 'Refund sent. The payment record is now marked refunded.'
            : 'Refund accepted by the provider. Press Re-check shortly to confirm.',
      })
      await loadDispute()
    } catch (err) {
      console.error('Refund send failed:', err)
      setRefundNotice({ kind: 'error', text: 'Could not send the refund. Please try again.' })
    } finally {
      setSendingRefund(false)
    }
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

  if (error || !dispute) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" back={{ href: '/disputes', label: 'Back to disputes' }} />
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
              onClick={() => router.push('/disputes')}
              className="bg-ink text-white px-5 py-2 rounded-full font-semibold hover:bg-black transition-colors"
            >
              ← Back to disputes
            </button>
          </div>
        </section>
      </main>
    )
  }

  const order = dispute.order
  // Admins resolve open disputes; parties only read and reply.
  const canResolve = isAdmin && dispute.status === 'open'
  const refundOrdered =
    dispute.resolution === 'refund_full' || dispute.resolution === 'refund_partial'
  const canSendRefund =
    isAdmin &&
    dispute.status === 'resolved' &&
    refundOrdered &&
    refundDisbursement?.status !== 'paid'
  const otherParty = order.buyer_id === userId ? order.seller : order.buyer

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" back={{ href: '/disputes', label: 'Back to disputes' }} />

      <section className="relative pt-28 pb-10 md:pt-36 md:pb-14 overflow-hidden animated-gradient">
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Dispute</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Order #{order.id.slice(-4).toUpperCase()}
              </h1>
              <p className="text-xs text-white/70 mt-1">
                {formatPrice(order.amount)} · {order.status}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border border-white/20 text-white ${
              dispute.status === 'open' ? 'border-red-500 text-red-400' : 'border-green-500 text-green-400'
            }`}>
              {dispute.status === 'open' ? 'Open' : 'Resolved'}
            </span>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-8">

          {/* Dispute reason */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule mb-8">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Why this dispute was opened</p>
            <p className="text-ink leading-relaxed">{dispute.reason}</p>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span className="w-8 h-8 rounded-full bg-gold-soft flex items-center justify-center shrink-0 text-gold-dark">⚖️</span>
              <span className="text-ink-muted">
                Opened by{' '}
                {order.buyer_id === userId ? 'you (buyer)' : order.seller_id === userId ? 'you (seller)' : 'the other party'}
                on {new Date(dispute.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule mb-8">
            <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Order details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Item</p>
                <p className="text-sm text-ink">{order.listing?.title || 'Order item'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Amount</p>
                <p className="text-lg font-bold text-gold-dark">{formatPrice(order.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Status</p>
                <p className="text-sm text-ink">{order.status}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-ink uppercase tracking-widest mb-1">Other party</p>
                <p className="text-sm text-ink">{formatName(otherParty?.full_name || 'Unknown')}</p>
              </div>
            </div>
          </div>

          {/* Resolution (admin only) */}
          {canResolve && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-gold/50 mb-8">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Admin resolution</p>
              <p className="text-sm text-ink-muted mb-4">Choose how to resolve this dispute:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {order.status === 'delivered' && (
                  <button
                    onClick={() => handleResolve('release_to_seller')}
                    className="flex items-center justify-center gap-2 bg-white border-2 border-gold text-gold-dark py-3 rounded-full font-semibold hover:bg-gold/10 hover:border-gold-dark transition-colors"
                  >
                    Release funds to seller
                  </button>
                )}
                <button
                  onClick={() => handleResolve('refund_full')}
                  className="flex items-center justify-center gap-2 bg-white border-2 border-red-200 text-red-700 py-3 rounded-full font-semibold hover:bg-red-50 hover:border-red-400 transition-colors"
                >
                  Full refund to buyer
                </button>
                {showRefundAmountInput ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-charcoal uppercase tracking-widest">
                      Refund amount (GH₵)
                    </label>
                    <input
                      type="number"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="e.g. 150.00"
                      className="px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!refundAmount || Number(refundAmount) <= 0) {
                            setError('Please enter a valid refund amount.')
                            return
                          }
                          if (!dispute?.order?.amount || Number(refundAmount) > Number(dispute.order.amount)) {
                            setError('Refund amount cannot exceed the order amount.')
                            return
                          }
                          handleResolve('refund_partial', refundAmount)
                        }}
                        className="flex-1 bg-amber-800 text-white py-3 rounded-full font-bold hover:bg-amber-700 transition-colors disabled:opacity-50"
                      >
                        Confirm refund
                      </button>
                      <button
                        onClick={() => {
                          setShowRefundAmountInput(false)
                          setRefundAmount('')
                          setError('')
                        }}
                        className="px-6 py-3 rounded-full font-semibold text-ink-muted border border-rule hover:bg-white/60 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRefundAmountInput(true)}
                    className="flex items-center justify-center gap-2 bg-white border-2 border-amber-200 text-amber-800 py-3 rounded-full font-semibold hover:bg-amber-50 hover:border-amber-400 transition-colors"
                  >
                    Partial refund
                  </button>
                )}
                <button
                  onClick={() => handleResolve('no_action')}
                  className="flex items-center justify-center gap-2 bg-white border-2 border-rule text-ink-muted py-3 rounded-full font-semibold hover:bg-white/50 hover:border-gold transition-colors"
                >
                  No action
                </button>
              </div>
            </div>
          )}

          {/* Refund payout (admin only, item 2) */}
          {isAdmin && refundOrdered && (
            <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-gold/50 mb-8">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">
                Refund transfer
              </p>

              {refundDisbursement?.status === 'paid' ? (
                <p className="text-sm text-green-700 font-medium">
                  Refund paid to the buyer
                  {refundDisbursement.provider_reference
                    ? ` · ref ${refundDisbursement.provider_reference.slice(-8)}`
                    : ''}
                  .
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-muted mb-4">
                    Resolution is recorded. The money has not moved yet — send it to the buyer’s
                    MoMo wallet now.
                  </p>

                  {refundNotice && (
                    <div
                      className={`mb-4 p-3 rounded-xl text-sm font-medium border ${
                        refundNotice.kind === 'ok'
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      {refundNotice.text}
                    </div>
                  )}

                  {refundDisbursement?.status === 'failed' && (
                    <div className="mb-4 p-3 rounded-xl text-sm border border-red-200 bg-red-50 text-red-700">
                      Last attempt failed: {refundDisbursement.failure_reason || 'provider error'}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                        Buyer MoMo number
                      </label>
                      <input
                        type="tel"
                        value={refundPhone}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^0-9+]/g, '')
                          setRefundPhone(next)
                          if (next.replace(/[^0-9]/g, '').length >= 9) {
                            setRefundProvider(momoProviderForPhone(next))
                          }
                        }}
                        placeholder="024xxxxxxx"
                        className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
                        Network
                      </label>
                      <select
                        value={refundProvider}
                        onChange={(e) => setRefundProvider(e.target.value as MomoProvider)}
                        className="w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all font-semibold"
                      >
                        <option value="mtn">MTN</option>
                        <option value="vodafone">Telecel</option>
                        <option value="airteltigo">AT Money</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleSendRefund}
                    disabled={sendingRefund || !canSendRefund}
                    className="mt-4 w-full sm:w-auto bg-gold text-charcoal px-6 py-3 rounded-full font-bold text-sm hover:bg-gold-dark transition-colors disabled:opacity-50"
                  >
                    {sendingRefund
                      ? 'Sending…'
                      : refundDisbursement?.status === 'processing'
                        ? 'Re-check refund'
                        : 'Send refund via MoMo'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 shadow-xl border border-rule">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Dispute messages</p>
              {dispute.status === 'resolved' && dispute.resolution && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                  Resolved: {dispute.resolution.replace('_', ' ')}
                </span>
              )}
            </div>

            <div className="h-[400px] overflow-y-auto space-y-3 mb-6">
              {messages.length === 0 ? (
                <p className="text-ink-muted text-center">No messages yet. Start the conversation.</p>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === userId
                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        isMine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-2xl ${
                          isMine
                            ? 'bg-gold text-charcoal'
                            : 'bg-white border border-rule text-ink'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{m.content}</p>
                        <p className={`text-[10px] mt-1 text-ink-muted ${
                          isMine ? 'text-right' : 'text-left'
                        }`}>
                          {formatName(m.sender?.full_name || 'Unknown')} ·{' '}
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <form onSubmit={handleSendMessage} className="mt-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Write a message…"
                  className="flex-1 px-4 py-3 rounded-full border-2 border-rule text-charcoal focus:outline-none focus:border-gold transition-all text-sm"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="px-5 py-3 rounded-full font-semibold text-sm transition-all disabled:opacity-50 bg-charcoal text-white hover:bg-black"
                >
                  Send
                </button>
              </div>
            </form>
          </div>

        </div>
      </section>
    </main>
  )
}
