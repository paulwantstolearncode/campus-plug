'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatName } from '@/lib/formatName'
import NavBar from '@/app/components/NavBar'
import { getConversations, subscribeToInbox } from '@/lib/chat'

interface ConversationRow {
  id: string
  listing_id: string | null
  buyer_id: string
  seller_id: string
  last_message_at: string
  contact_revealed_at: string | null
  unread_count: number
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

  const loadConversations = useCallback(async (silent = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      if (!silent) setLoading(true)
      const data = await getConversations(user.id)
      setConversations(data as ConversationRow[])
      setError(null)
    } catch (err) {
      console.error('Failed to load conversations:', err)
      // Only a foreground load may replace the inbox with the error state; a
      // failed background refresh leaves what's on screen alone.
      if (!silent) setError('Could not load your messages. Please try again.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [router])

  useEffect(() => {
    async function init() {
      await loadConversations()
    }
    init()
  }, [loadConversations])

  // Live inbox: refresh quietly when a message arrives, and whenever the tab
  // regains focus (the silent path keeps the skeleton from flashing).
  useEffect(() => {
    if (!userId) return

    const refresh = () => {
      void loadConversations(true)
    }
    const unsubscribe = subscribeToInbox(userId, refresh)
    window.addEventListener('focus', refresh)

    return () => {
      unsubscribe()
      window.removeEventListener('focus', refresh)
    }
  }, [userId, loadConversations])

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
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <div className="h-4 w-1/3 bg-white/10 rounded-full mb-4 animate-pulse" />
            <div className="h-12 bg-white/10 rounded-xl w-3/4 mb-3 animate-pulse" />
            <div className="h-5 bg-white/10 rounded-lg w-1/2 animate-pulse" />
          </div>
        </section>
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
            <p className="text-ink text-center">Not signed in.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink">
      <NavBar variant="dark" />

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">Messages</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                Your <span className="font-serif-accent italic text-gold">conversations</span>
              </h1>
            </div>
          </div>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8">

          {conversations.length === 0 ? (
            <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-12 text-center border border-rule">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0 mb-4 text-ink-muted opacity-50"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p className="text-xl font-bold text-ink">No wahala, chale — nothing here yet</p>
              <p className="text-ink-muted mt-2 mb-6">
                Open a listing and tap &quot;Message&quot; to start a conversation with the seller.
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
                        <div className="flex items-center gap-1.5">
                          <p className={`font-semibold text-charcoal truncate ${c.unread_count > 0 ? 'font-bold' : ''}`}>
                            {name}
                          </p>
                          {c.unread_count > 0 && (
                            <span className="w-2 h-2 rounded-full bg-gold shadow-sm" />
                          )}
                        </div>
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
