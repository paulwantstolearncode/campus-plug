'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import {
  getConversation,
  getMessages,
  sendMessage,
  markMessagesRead,
  touchConversation,
  type Conversation,
  type ChatMessage,
} from '@/lib/chat'

interface MessageBubbleProps {
  message: ChatMessage
  isSender: boolean
}

function MessageBubble({ message, isSender }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  const read = message.read_at ? '✓' : ''
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
          {time} {isSender && read}
        </p>
      </div>
    </div>
  )
}

export default function MessageThread() {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
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
        getConversation(conversationId, user.id),
        getMessages(conversationId),
      ])

      if (!conv) {
        setError('Conversation not found or you are not a participant.')
        return
      }

      setConversation(conv)
      setMessages(msgs)

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

  const otherParty = () => {
    if (!conversation || !userId) return null
    return conversation.buyer_id === userId ? conversation.seller : conversation.buyer
  }

  const otherName = () => {
    const party = otherParty()
    return party?.full_name ? formatName(party.full_name) : 'Unknown'
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !conversationId || !userId) return

    setSending(true)
    const optimisticId = 'opt-' + Date.now()
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: userId,
      content: input.trim(),
      created_at: new Date().toISOString(),
      read_at: null,
      sender: { full_name: 'You' },
    }

    setMessages((prev) => [...prev, optimisticMessage])
    setInput('')
    scrollToBottom()

    try {
      const { error } = await sendMessage({
        conversationId,
        senderId: userId,
        content: input.trim(),
      })
      if (error) throw error
      await touchConversation(conversationId)
    } catch (err) {
      console.error('Send failed:', err)
      setError('Failed to send message. Please try again.')
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } finally {
      setSending(false)
    }
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
      setError(
        'Contact details are revealed after a completed transaction or a verified review between you and this seller.'
      )
      return
    }

    // Fetch the other party's WhatsApp number (profiles is publicly readable).
    const { data: profile } = await supabase
      .from('profiles')
      .select('whatsapp_number')
      .eq('id', party.id)
      .single()

    // Mark the conversation as revealed.
    await supabase
      .from('conversations')
      .update({ contact_revealed_at: new Date().toISOString() })
      .eq('id', conversationId)

    setRevealed(true)
    setOtherNumber(profile?.whatsapp_number || null)
    setError(null)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" />
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
        <NavBar variant="dark" />
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
      <NavBar variant="dark" back={{ href: '/messages', label: 'Back to messages' }} />

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
          {/* Thread header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-xl font-bold text-gold-dark shrink-0">
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-charcoal">{name}</p>
                <p className="text-xs text-ink-muted">{listingTitle}</p>
              </div>
            </div>
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
            {revealed && otherNumber && (
              <div className="mt-4 p-3 rounded-xl border border-green-200 bg-green-50 text-green-800 text-sm">
                {name}&apos;s WhatsApp: <span className="font-mono font-bold">{otherNumber}</span>
              </div>
            )}
          </div>

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
                    <MessageBubble key={m.id} message={m} isSender={isSender} />
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
                className="flex-1 px-5 py-3 rounded-xl border-2 border-rule text-ink focus:outline-none focus:border-gold transition-colors"
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
