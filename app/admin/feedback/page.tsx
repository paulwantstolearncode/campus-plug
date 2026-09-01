'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import { formatName } from '@/lib/formatName'
import {
  getAllFeedback,
  markFeedbackAsRead,
  deleteFeedback,
  type FeedbackWithProfile,
} from '@/lib/feedback'

type CategoryFilter = 'all' | 'bug' | 'feature' | 'general' | 'complaint'

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  feature: 'Feature',
  general: 'General',
  complaint: 'Complaint',
}

const CATEGORY_COLORS: Record<string, string> = {
  bug: 'bg-red-100 text-red-700',
  feature: 'bg-blue-100 text-blue-700',
  general: 'bg-gray-100 text-gray-600',
  complaint: 'bg-amber-100 text-amber-700',
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<CategoryFilter>('all')
  const [filterUnread, setFilterUnread] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function checkAdmin() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Admin profile lookup failed:', profileError)
          setError('Could not verify admin access: ' + profileError.message)
          return
        }

        if (!profile?.is_admin) {
          alert('Admin access only')
          router.push('/')
          return
        }

        setIsAdmin(true)
      } catch (err) {
        console.error('Could not load admin feedback:', err)
        setError('Could not load feedback. Check your connection and try again.')
      } finally {
        setLoading(false)
      }
    }

    checkAdmin()
  }, [router])

  // Load feedback when admin is confirmed and filters change.
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    ;(async () => {
      const data = await getAllFeedback({ filterCategory, filterUnreadOnly: filterUnread })
      if (!cancelled) setFeedback(data)
    })()
    return () => { cancelled = true }
  }, [isAdmin, filterCategory, filterUnread])

  async function handleMarkAsRead(id: string) {
    const result = await markFeedbackAsRead(id)
    if (result.error) {
      alert('Could not mark as read: ' + result.error)
    } else {
      setFeedback((prev) =>
        prev.map((f) => (f.id === id ? { ...f, is_read: true } : f))
      )
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this feedback? This cannot be undone.')) return
    const result = await deleteFeedback(id)
    if (result.error) {
      alert('Could not delete: ' + result.error)
    } else {
      setFeedback((prev) => prev.filter((f) => f.id !== id))
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })

  const total = feedback.length
  const unread = feedback.filter((f) => !f.is_read).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading feedback...</p>
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

  const categoryFilters: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'general', label: 'General' },
    { value: 'complaint', label: 'Complaint' },
  ]

  return (
    <main className="min-h-screen bg-charcoal">
<NavBar variant="admin" back={{ href: '/admin', label: 'Review Queue' }} />

      <section className="pt-32 pb-12 animated-gradient">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Admin Dashboard</div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Feedback</h1>
            <p className="text-white/70">What users think about Campus Plug.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/sales"
              className="inline-flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-white/20 transition-colors"
            >
              💰 Sales
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-white/20 transition-colors"
            >
              📦 Review Queue
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

          {/* Top controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
              {categoryFilters.map((cf) => (
                <button
                  key={cf.value}
                  onClick={() => setFilterCategory(cf.value)}
                  className={'px-5 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-all ' + (filterCategory === cf.value ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200')}
                >
                  {cf.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterUnread}
                onChange={(e) => setFilterUnread(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-gold focus:ring-gold accent-gold"
              />
              <span className="text-sm font-semibold text-charcoal">Unread only</span>
            </label>
          </div>

          {/* Count badges */}
          <div className="flex items-center gap-3 mb-6 text-sm text-gray-500 font-semibold">
            <span>{total} total</span>
            <span className="text-gray-300">·</span>
            <span>{unread} unread</span>
          </div>

          {/* List */}
          {feedback.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-xl font-bold text-charcoal">No feedback yet</p>
              <p className="text-gray-500 mt-2">Submissions from users will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {feedback.map((item) => {
                const name = item.profiles?.full_name
                  ? formatName(item.profiles.full_name)
                  : 'Anonymous'
                return (
                  <div
                    key={item.id}
                    className={'bg-white rounded-3xl p-6 shadow-lg border transition-colors ' + (item.is_read ? 'border-gray-100' : 'border-gold/40')}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ' + (CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-600')}>
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                        {item.rating ? (
                          <span className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <svg key={n} viewBox="0 0 24 24" className={'w-3.5 h-3.5 fill-current ' + (n <= item.rating! ? 'text-gold' : 'text-gray-300')}>
                                <path d="M12 2l2.92 6.26 6.88.6-5.2 4.56 1.53 6.72L12 16.4l-6.13 3.74 1.53-6.72L2.2 8.86l6.88-.6L12 2z" />
                              </svg>
                            ))}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">No rating</span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        {formatDate(item.created_at)} at {formatTime(item.created_at)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-charcoal mb-1">{name}</p>
                    {item.email && (
                      <a
                        href={'mailto:' + item.email}
                        className="text-xs text-gold hover:text-gold-dark transition-colors mb-2 inline-block"
                      >
                        {item.email}
                      </a>
                    )}

                    <p className="text-sm text-gray-700 leading-relaxed mt-2 whitespace-pre-wrap">{item.message}</p>

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                      {!item.is_read ? (
                        <button
                          onClick={() => handleMarkAsRead(item.id)}
                          className="px-4 py-2 bg-charcoal text-white rounded-full text-xs font-semibold hover:bg-black transition-colors"
                        >
                          Mark as read
                        </button>
                      ) : (
                        <span className="px-4 py-2 bg-gray-100 text-gray-400 rounded-full text-xs font-semibold">
                          Read
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-4 py-2 text-red-500 hover:text-red-700 text-xs font-semibold transition-colors"
                      >
                        Delete
                      </button>
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
