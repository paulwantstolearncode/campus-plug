'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import { Celebrate } from '@/app/components/Celebrate'
import {
  getConversation,
  getMessages,
  sendMessage,
  markMessagesRead,
  touchConversation,
  subscribeToConversationMessages,
  type Conversation,
  type ChatMessage,
} from '@/lib/chat'

/** A thread message; `delivery` marks a local, not-yet-saved send. */
type ThreadMessage = ChatMessage & { delivery?: 'sending' | 'failed' }

interface MessageBubbleProps {
  message: ThreadMessage
  isSender: boolean
  onRetry: () => void
}

/** Fetch a participant's WhatsApp number (profiles is publicly readable). */
async function fetchWhatsappNumber(id: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('whatsapp_number')
    .eq('id', id)
    .maybeSingle()
  return data?.whatsapp_number || null
}

function MessageBubble({ message, isSender, onRetry }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  const read = message.read_at ? ' ✓' : ''
  return (
    <div
      className={`flex ${isSender ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm break-words ${
          isSender
            ? 'bg-ink text-white text-right'
            : 'bg-white/90 text-charcoal border border-rule'
        }`}
      >
        <p className="mb-1">{message.content}</p>
        <p className={`text-[10px] ${isSender ? 'text-white/60' : 'text-ink-muted'} text-right`}>
          {message.delivery === 'sending' && 'Sending… '}
          {time}
          {isSender && !message.delivery && read}
        </p>
        {message.delivery === 'failed' && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[11px] font-semibold text-gold hover:text-gold-dark underline underline-offset-2"
          >
            Not sent — tap to retry
          </button>
        )}
      </div>
    </div>
  )
}

export default function MessageThread() {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Transient, in-thread feedback (failed send, reveal not yet unlocked). Kept
  // separate from `error`, which swaps the whole page for the error state.
  const [notice, setNotice] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [celebrateReveal, setCelebrateReveal] = useState(false)
  const [otherNumber, setOtherNumber] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const params = useParams()
  const rawId = params.id
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadThread = useCallback(async () => {
    if (!conversationId) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)

      const [conv, msgs] = await Promise.all([
        getConversation(conversationId),
        getMessages(conversationId),
      ])

      if (!conv) {
        setError('Conversation not found or you are not a participant.')
        return
      }

      setConversation(conv)
      setMessages(msgs)

      // Restore the contact-reveal state: a thread that already unlocked the
      // other party's number must not ask again on every visit.
      if (conv.contact_revealed_at) {
        const party = conv.buyer_id === user.id ? conv.seller : conv.buyer
        setRevealed(true)
        if (party) {
          setOtherNumber(await fetchWhatsappNumber(party.id))
        }
      }

      // Mark messages as read when the thread is viewed.
      await markMessagesRead({ conversationId, userId: user.id })
    } catch (err) {
      console.error('Failed to load thread:', err)
      setError('Could not load the conversation. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [conversationId, router])

  useEffect(() => {
    async function init() {
      await loadThread()
    }
    init()
  }, [loadThread])

  const refreshMessages = useCallback(async () => {
    if (!conversationId || !userId) return
    const msgs = await getMessages(conversationId)

    // Keep optimistic bubbles: a refresh must never swallow a message the user
    // is still sending or has yet to retry.
    setMessages((prev) => {
      const pending = prev.filter((m) => m.delivery)
      return pending.length ? [...msgs, ...pending] : msgs
    })

    // Only write when something is actually unread — marking read emits UPDATE
    // events that would otherwise bounce straight back into this refresh.
    if (msgs.some((m) => m.sender_id !== userId && !m.read_at)) {
      await markMessagesRead({ conversationId, userId })
    }
  }, [conversationId, userId])

  // Live thread: pick up the other party's replies and read receipts without a
  // reload (needs supabase/enable_chat_realtime.sql; until that runs the focus
  // refresh below still keeps the thread current).
  useEffect(() => {
    if (!conversation || !userId || !conversationId) return

    const unsubscribe = subscribeToConversationMessages(conversationId, () => {
      void refreshMessages()
    })
    const onFocus = () => {
      void refreshMessages()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [conversation, userId, conversationId, refreshMessages])

  const otherParty = () => {
    if (!conversation || !userId) return null
    return conversation.buyer_id === userId ? conversation.seller : conversation.buyer
  }

  const otherName = () => {
    const party = otherParty()
    return party?.full_name ? formatName(party.full_name) : 'Unknown'
  }

  // Save a message and reconcile its bubble: success swaps in the stored row,
  // failure keeps the text on screen with a retry control.
  const deliverMessage = useCallback(
    async (optimisticId: string, content: string) => {
      if (!conversationId || !userId) return
      try {
        const { message, error } = await sendMessage({
          conversationId,
          senderId: userId,
          content,
        })
        if (error) throw new Error(error)
        await touchConversation(conversationId)

        setMessages((prev) =>
          message
            ? prev.map((m) => (m.id === optimisticId ? message : m))
            : prev.filter((m) => m.id !== optimisticId)
        )
      } catch (err) {
        console.error('Send failed:', err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, delivery: 'failed' as const }
              : m
          )
        )
      }
    },
    [conversationId, userId]
  )

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = input.trim()
    if (!content || !conversationId || !userId) return

    const optimisticId = `opt-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: userId,
        content,
        created_at: new Date().toISOString(),
        read_at: null,
        delivery: 'sending',
      },
    ])
    setInput('')
    scrollToBottom()
    setSending(true)

    try {
      await deliverMessage(optimisticId, content)
    } finally {
      setSending(false)
    }
  }

  const retryMessage = (message: ThreadMessage) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id ? { ...m, delivery: 'sending' as const } : m
      )
    )
    void deliverMessage(message.id, message.content)
  }

  const handleRevealContact = async () => {
    if (!conversation || !userId) return
    const party = otherParty()
    if (!party) return

    // Check reveal conditions: a review between the parties, or a completed
    // order (booking/sale) between them.
    const { data: review } = await supabase
      .from('reviews')
      .select('id')
      .or(
        `and(reviewer_id.eq.${userId},seller_id.eq.${party.id}),and(reviewer_id.eq.${party.id},seller_id.eq.${userId})`
      )
      .limit(1)

    const { data: order } = await supabase
      .from('sales')
      .select('id')
      .or(
        `and(buyer_id.eq.${userId},seller_id.eq.${party.id}),and(buyer_id.eq.${party.id},seller_id.eq.${userId})`
      )
      .eq('status', 'completed')
      .limit(1)

    const eligible = (review && review.length > 0) || (order && order.length > 0)
    if (!eligible) {
      setNotice(
        'Contact details are revealed after a completed transaction or a verified review between you and this seller.'
      )
      return
    }

    const number = await fetchWhatsappNumber(party.id)

    // Mark the conversation as revealed.
    await supabase
      .from('conversations')
      .update({ contact_revealed_at: new Date().toISOString() })
      .eq('id', conversationId)

    setRevealed(true)
    setOtherNumber(number)
    setNotice(null)

    // One-time celebration when contact is revealed.
    if (typeof window !== 'undefined') {
      const key = `cp_revealed_celebrated_${conversationId}`
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1')
        setCelebrateReveal(true)
      }
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" back={{ href: '/messages', label: 'Back to messages' }} />
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <div className="space-y-4">
              <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
              <div className="h-8 bg-white/10 rounded-2xl w-3/4 mb-3 animate-pulse" />
            </div>
          </div>
        </section>
        <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
            <div className="h-4 w-1/3 skeleton-shimmer-light" />
            <div className="h-8 skeleton-shimmer-light rounded-2xl w-3/4" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 skeleton-shimmer-light rounded-2xl" />
            ))}
          </div>
        </section>
      </main>
    )
  }

  if (error || !conversation || !userId) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" back={{ href: '/messages', label: 'Back to messages' }} />
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <div className="space-y-4">
              <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
              <div className="h-8 bg-white/10 rounded-2xl w-3/4 mb-3 animate-pulse" />
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
              onClick={() => router.push('/messages')}
              className="bg-ink text-white px-5 py-2 rounded-full font-semibold hover:bg-black transition-colors"
            >
              ← Back to messages
            </button>
          </div>
        </section>
      </main>
    )
  }

  const party = otherParty()
  const name = otherName()
  const listingTitle = conversation.listing?.title || 'General conversation'

  return (
    <main className="min-h-screen bg-ink">
      <Celebrate trigger={celebrateReveal} />
      <NavBar variant="dark" back={{ href: '/messages', label: 'Back to messages' }} />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-xl font-bold text-gold-dark shrink-0">
              {name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Conversation</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                {name}
              </h1>
              <p className="text-xs text-white/70 mt-1">{listingTitle}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
          {/* Thread header */}
          <div className="mb-6">
            {party && !revealed && (
              <button
                onClick={handleRevealContact}
                className="mt-4 flex items-center justify-center gap-2 w-full bg-white border-2 border-rule text-charcoal py-3 rounded-full font-semibold text-sm hover:border-gold hover:bg-gold/5 transition-colors min-h-[44px]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Reveal contact
              </button>
            )}
            {revealed && (
              <div className="mt-4 bg-white/90 backdrop-blur-sm rounded-3xl border border-rule p-6 md:p-8 shadow-sm">
                <div className="flex items-start gap-3 mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold shrink-0">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2H16l-5-5-7 7h3a2 2 0 0 1 2-1.7V13.9a2 2 0 0 1 .3-.87l3-1.5a2 2 0 0 1 1.4-.8h.1l4 2.5c.5.8 1.4 1.2 2.3 1.2h5.1c1.1 0 2.1-.4 2.8-1.2l3-3c.6-.6.9-1.4.9-2.2v-2.8c0-1.1-.4-2.1-1.1-2.8z" />
                  </svg>
                  <div>
                    <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Contact revealed</p>
                    <p className="text-sm text-ink">{name}&apos;s WhatsApp</p>
                  </div>
                </div>
                <p className="text-sm text-ink-muted mb-4">
                  You&apos;ve completed a deal together — here&apos;s their number.
                </p>
                {otherNumber ? (
                  <p className="text-sm font-mono font-bold text-ink mb-4">
                    {otherNumber}
                  </p>
                ) : (
                  <p className="text-sm text-ink-muted mb-4">
                    They haven&apos;t added a WhatsApp number yet.
                  </p>
                )}
                {otherNumber && (
                <a
                  href={`https://wa.me/${otherNumber.replace(/[^+\d]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full bg-gold text-charcoal py-3.5 rounded-full font-semibold hover:bg-gold-dark transition-colors text-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-charcoal shrink-0">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2H16l-5-5-7 7h3a2 2 0 0 1 2-1.7V13.9a2 2 0 0 1 .3-.87l3-1.5a2 2 0 0 1 1.4-.8h.1l4 2.5c.5.8 1.4 1.2 2.3 1.2h5.1c1.1 0 2.1-.4 2.8-1.2l3-3c.6-.6.9-1.4.9-2.2v-2.8c0-1.1-.4-2.1-1.1-2.8z" />
                  </svg>
                  Message them on WhatsApp
                </a>
                )}
                <p className="text-[10px] text-ink-muted mt-3">
                  Your number stays private — they&apos;ll see it only when you message them.
                </p>
              </div>
            )}
          </div>

          {/* Transient feedback stays inline, so a failed send no longer
              replaces the whole conversation with an error page. */}
          {notice && (
            <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start justify-between gap-3">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
                className="text-red-700/60 hover:text-red-700 leading-none text-lg"
              >
                ×
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-rule p-4 mb-6 h-[60vh] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-ink-muted text-sm">
                No messages yet. Start the conversation!
              </div>
            ) : (
              <div className="space-y-1">
                {messages.map((m) => {
                  const isSender = m.sender_id === userId
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      isSender={isSender}
                      onRetry={() => retryMessage(m)}
                    />
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={handleSend} className="mt-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                className="flex-1 px-5 py-3 rounded-full border-2 border-rule text-ink focus:outline-none focus:border-gold transition-colors"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="px-6 py-3 rounded-xl bg-ink text-white font-semibold disabled:opacity-50 hover:bg-black transition-colors disabled:hover:scale-100 min-h-[44px]"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
