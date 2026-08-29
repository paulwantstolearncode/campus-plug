'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlugRequests, createPlugRequest, closePlugRequest, type PlugRequest } from '@/lib/plugRequests'
import { CATEGORIES } from '@/lib/categories'
import { CAMPUS_LOCATIONS } from '@/lib/campusLocations'

export default function RequestsPage() {
  const [requests, setRequests] = useState<PlugRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [userWhatsapp, setUserWhatsapp] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const router = useRouter()

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formBudget, setFormBudget] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formWhatsapp, setFormWhatsapp] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('whatsapp_number')
          .eq('id', user.id)
          .single()
        if (profile?.whatsapp_number) {
          setUserWhatsapp(profile.whatsapp_number)
          setFormWhatsapp(profile.whatsapp_number)
        }
      }

      const data = await getPlugRequests()
      setRequests(data)
      setLoading(false)
    }

    init()

    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) {
      setFormError('What do you need?')
      return
    }

    setSubmitting(true)
    setFormError(null)

    const result = await createPlugRequest({
      title: formTitle.trim(),
      description: formDesc.trim() || undefined,
      budget: formBudget ? Number(formBudget) : undefined,
      category: formCategory || undefined,
      campus_location: formLocation || undefined,
      whatsapp_number: formWhatsapp.trim() || undefined,
    })

    if (result.error) {
      setFormError(result.error)
      setSubmitting(false)
      return
    }

    // Refresh the list
    const updated = await getPlugRequests()
    setRequests(updated)
    setShowModal(false)
    setFormTitle('')
    setFormDesc('')
    setFormBudget('')
    setFormCategory('')
    setFormLocation('')
    setFormError(null)
    setSubmitting(false)
  }

  const handlePitch = (req: PlugRequest) => {
    const message = encodeURIComponent(
      `Hi! I saw your request for "${req.title}" on Campus Plug (GH₵ ${req.budget || 'negotiable'}). I can help you with this!`
    )
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer')
  }

  const handleClose = async (id: string) => {
    if (!confirm('Mark this request as fulfilled?')) return
    const result = await closePlugRequest(id)
    if (result.error) {
      alert('Failed: ' + result.error)
      return
    }
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffH = Math.floor(diffMs / 3600000)
    if (diffH < 1) return 'Just now'
    if (diffH < 24) return diffH + 'h ago'
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return diffD + 'd ago'
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <main className="min-h-screen bg-white overflow-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/80 backdrop-blur-xl shadow-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-charcoal tracking-tight">Campus Plug</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gold transition-colors">
              ← Back to marketplace
            </Link>
            {user && (
              <button
                onClick={() => setShowModal(true)}
                className="bg-gold text-charcoal px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-gold-dark transition-all hover:scale-105 shadow-lg shadow-gold/20"
              >
                Post a Request
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="relative pt-28 pb-12 md:pt-36 md:pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 text-gold text-sm font-semibold mb-4">
            04 <span className="text-charcoal/25">/</span> WANTED BOARD
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-charcoal leading-tight tracking-tight mb-4">
            Request a <em className="font-serif-accent italic text-gold">Plug</em>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-8">
            Need something specific on campus? Put it on the board and sellers will pitch you directly on WhatsApp.
          </p>
          {!user && (
            <Link
              href="/login?next=/requests"
              className="inline-flex items-center gap-2 bg-charcoal text-white px-8 py-4 rounded-full font-semibold hover:bg-black transition-all hover:scale-105 shadow-xl"
            >
              Sign in to post a request
              <span>→</span>
            </Link>
          )}
        </div>
      </section>

      {/* Request Feed */}
      <section className="relative pb-24 md:pb-32">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-2 animate-pulse">🔌</div>
              <p className="text-gray-500">Loading requests...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-20 bg-off-white rounded-3xl border border-gray-100">
              <div className="text-6xl mb-4 opacity-50">📋</div>
              <h3 className="text-2xl font-bold text-charcoal mb-2">No requests yet</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Be the first to put something on the board. Sellers are waiting to help.
              </p>
              {user && (
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-gold text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold-dark transition-all hover:scale-105 shadow-lg shadow-gold/25"
                >
                  Post a Request →
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {requests.map((req) => {
                const cat = req.category ? CATEGORIES.find(c => c.slug === req.category) : null
                const isOwner = user?.id === req.user_id

                return (
                  <div key={req.id} className="card-lift bg-surface rounded-2xl p-6 hairline flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-bold text-ink text-lg leading-snug">{req.title}</h3>
                      {req.budget && (
                        <span className="shrink-0 bg-gold-soft text-gold-dark px-3 py-1 rounded-lg font-mono text-sm font-bold">
                          GH₵ {req.budget.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {req.description && (
                      <p className="text-sm text-ink-muted leading-relaxed mb-4 line-clamp-3">{req.description}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mb-4 mt-auto">
                      {cat && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-paper-deep text-ink-muted">
                          {cat.emoji} {cat.label}
                        </span>
                      )}
                      {req.campus_location && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-paper-deep text-ink-muted">
                          📍 {req.campus_location}
                        </span>
                      )}
                      <span className="text-xs text-ink-muted/70 font-mono">{formatDate(req.created_at)}</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePitch(req)}
                        className="flex-1 bg-whatsapp text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-whatsapp-bright transition-colors flex items-center justify-center gap-1.5"
                      >
                        💬 Pitch on WhatsApp
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => handleClose(req.id)}
                          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-rule text-ink-muted hover:border-gold hover:text-gold-dark transition-colors"
                          title="Mark as fulfilled"
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Post Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-charcoal transition-colors text-xl"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold text-charcoal mb-1">Post a Request</h2>
            <p className="text-sm text-gray-500 mb-6">Tell sellers what you need — they&apos;ll reach out on WhatsApp.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">What do you need? *</label>
                <input
                  type="text"
                  placeholder="e.g., iPhone 13 screen repair"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Details</label>
                <textarea
                  placeholder="Describe what you need, preferred timing, etc."
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors resize-none"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-2">Budget (GH₵)</label>
                  <input
                    type="number"
                    placeholder="e.g., 150"
                    className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                    value={formBudget}
                    onChange={(e) => setFormBudget(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-charcoal mb-2">Category</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    <option value="">Any</option>
                    {CATEGORIES.map(c => (
                      <option key={c.slug} value={c.slug}>{c.emoji} {c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Campus Location</label>
                <select
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                >
                  <option value="">Anywhere</option>
                  <optgroup label="Halls">
                    {CAMPUS_LOCATIONS.halls.map(l => <option key={l} value={l}>{l}</option>)}
                  </optgroup>
                  <optgroup label="Hostels">
                    {CAMPUS_LOCATIONS.hostels.map(l => <option key={l} value={l}>{l}</option>)}
                  </optgroup>
                  <optgroup label="Off-Campus">
                    {CAMPUS_LOCATIONS.offCampus.map(l => <option key={l} value={l}>{l}</option>)}
                  </optgroup>
                  <optgroup label="Flexible">
                    {CAMPUS_LOCATIONS.flexible.map(l => <option key={l} value={l}>{l}</option>)}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Your WhatsApp Number</label>
                <input
                  type="tel"
                  placeholder="024 123 4567"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors"
                  value={formWhatsapp}
                  onChange={(e) => setFormWhatsapp(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Sellers will message you here. Optional if you prefer to reach out first.</p>
              </div>

              {formError && (
                <p className="text-sm text-red-500 flex items-center gap-1">⚠️ {formError}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !formTitle.trim()}
                className="w-full bg-gold text-charcoal py-4 rounded-2xl font-bold text-lg hover:bg-gold-dark transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-gold/20"
              >
                {submitting ? 'Posting...' : 'Put it on the board →'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
