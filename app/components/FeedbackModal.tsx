'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { submitFeedback } from '@/lib/feedback'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
}

const CATEGORIES = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'general', label: 'General feedback' },
  { value: 'complaint', label: 'Complaint' },
] as const

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Prefill email from logged-in user + capture user ID for the insert.
  useEffect(() => {
    if (!isOpen) return
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        setEmail(user.email || '')
      }
    }
    loadUser()
  }, [isOpen])

  // Close on Escape, lock background scroll, focus dialog.
  useEffect(() => {
    if (!isOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  const canSubmit = category && message.trim().length >= 10 && message.length <= 2000 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const result = await submitFeedback({
      userId,
      email: email || null,
      rating: rating || null,
      category,
      message: message.trim(),
    })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
    setTimeout(onClose, 3000)
  }

  if (!isOpen) return null

  const activeRating = hoverRating || rating

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        tabIndex={-1}
        className="bg-off-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          /* ── Success state ────────────────────────────────────────── */
          <div className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-charcoal mb-2">
              Thanks! We read every message.
            </h3>
            <p className="text-gray-500 text-sm">This modal will close automatically.</p>
          </div>
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="relative animated-gradient p-6 pb-8 overflow-hidden">
              <div className="blob absolute -top-10 -right-10 w-40 h-40 bg-gold/40 rounded-full blur-3xl" />
              <div className="relative flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Help us build this{' '}
                    <em className="font-serif-accent italic text-gold">better</em>
                  </h2>
                  <p className="text-white/70 text-sm mt-1">
                    Tell us what&apos;s working, what&apos;s broken, or what you wish existed.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="text-white/70 hover:text-white p-2 -mr-2"
                  aria-label="Close"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Form ──────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Rating */}
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">
                  How&apos;s your experience? <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={activeRating === n}
                      aria-label={n + ' star' + (n > 1 ? 's' : '')}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(rating === n ? 0 : n)}
                      className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={'w-7 h-7 fill-current ' + (n <= activeRating ? 'text-gold' : 'text-gray-300')}
                      >
                        <path d="M12 2l2.92 6.26 6.88.6-5.2 4.56 1.53 6.72L12 16.4l-6.13 3.74 1.53-6.72L2.2 8.86l6.88-.6L12 2z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label htmlFor="feedback-category" className="block text-sm font-semibold text-charcoal mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="feedback-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-sm font-semibold text-charcoal bg-white focus:outline-none focus:border-gold transition-colors"
                >
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <label htmlFor="feedback-message" className="block text-sm font-semibold text-charcoal mb-2">
                  Message <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <textarea
                    id="feedback-message"
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-sm text-charcoal bg-white focus:outline-none focus:border-gold transition-colors resize-none"
                  />
                  <span className={'absolute bottom-3 right-3 text-[11px] font-semibold ' + (message.length > 2000 ? 'text-red-500' : 'text-gray-400')}>
                    {message.length} / 2000
                  </span>
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="feedback-email" className="block text-sm font-semibold text-charcoal mb-2">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email (optional, so we can reply)"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-sm text-charcoal bg-white focus:outline-none focus:border-gold transition-colors"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                  {error}
                </div>
              )}
            </div>

            {/* ── Footer ────────────────────────────────────────────── */}
            <div className="p-6 pt-2 border-t border-gray-100">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full bg-gold text-charcoal py-3.5 rounded-full font-bold text-sm hover:bg-gold-dark transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-gold/25"
              >
                {submitting ? 'Sending...' : 'Send feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
