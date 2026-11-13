'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import { getConversations } from '@/lib/chat'

interface ConversationRow {
  id: string
  listing_id: string | null
  buyer_id: string
  seller_id: string
  last_message_at: string
  contact_revealed_at: string | null
  buyer?: { id: string; full_name: string | null } | null
  seller?: { id: string; full_name: string | null } | null
  listing?: { id: string; title: string | null } | null
}

export default function MessagesInbox() {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const loadConversations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setLoading(true)
      const data = await getConversations(user.id)
      setConversations(data as ConversationRow[])
      setError(null)
    } catch (err) {
      console.error('Failed to load conversations:', err)
      setError('Could not load your messages. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    async function init() {
      await loadConversations()
    }
    init()
  }, [loadConversations])

  const otherParty = (c: ConversationRow) => {
    if (userId && c.buyer_id === userId) return c.seller
    if (userId && c.seller_id === userId) return c.buyer
    return null
  }

  const otherName = (c: ConversationRow) => {
    const party = otherParty(c)
    return party?.full_name ? formatName(party.full_name) : 'Unknown'
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink">
        <NavBar variant="dark" />
        <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
            <div className="space-y-4">
              <div className="h-4 w-1/3 skeleton-shimmer-light" />
              <div className="h-4 w-1/2 skeleton-shimmer-light" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 skeleton-shimmer-light rounded-2xl" />
              ))}
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (error || !userId) {
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
            <p className="text-ink text-center">Not signed in.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" />

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Messages</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Your conversations
              </h1>
            </div>
          </div>

          {conversations.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-12 text-center border border-rule">
              <div className="text-4xl mb-4 opacity-50">💬</div>
              <p className="text-xl font-bold text-ink">No conversations yet</p>
              <p className="text-ink-muted mt-2 mb-6">
                Start a conversation from a listing page — tap &quot;Message&quot; on any
                listing to open a thread with the seller.
              </p>
              <Link
                href="/services"
                className="inline-flex items-center gap-2 bg-ink text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors"
              >
                Browse listings
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((c) => {
                const name = otherName(c)
                const listingTitle = c.listing?.title || 'General conversation'
                return (
                  <Link
                    key={c.id}
                    href={'/messages/' + c.id}
                    className="flex items-center justify-between p-4 rounded-2xl border border-rule bg-white/90 backdrop-blur-sm hover:border-gold transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-lg font-bold text-gold-dark shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-charcoal truncate">{name}</p>
                        <p className="text-xs text-ink-muted truncate">{listingTitle}</p>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-ink">
                        {c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
