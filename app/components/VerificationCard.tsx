'use client'

// Seller-facing identity verification card (item 16).
//
// The trust claim: only a student with a .edu.gh address + a student ID can
// carry the "✅ Verified Student" badge on their shop. Submissions land in
// public.seller_verifications (seller + admin only — never public, because the
// ID photo URL is PII); admins flip the public profiles.student_id_verified
// flag through the verify_seller_identity() RPC.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getMyVerification, submitStudentVerification } from '@/lib/verification'

interface VerificationRow {
  status: 'pending' | 'verified' | 'rejected'
  student_email: string
  student_id_url: string | null
  review_note: string | null
  submitted_at: string
  reviewed_at: string | null
}

export default function VerificationCard() {
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<VerificationRow | null>(null)
  const [verified, setVerified] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [idUrl, setIdUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const mine = await getMyVerification()
      setRow(mine)
      if (mine) {
        setEmail(mine.student_email)
        setIdUrl(mine.student_id_url || '')
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('student_id_verified')
          .eq('id', user.id)
          .maybeSingle()
        setVerified(!!data?.student_id_verified)
      }
    } catch {
      // Never block the dashboard on this card.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    async function init() {
      await load()
    }
    init()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')

    if (!/\.edu\.gh$/i.test(email.trim())) {
      setError('Use the .edu.gh email on your student record (e.g. you@st.ug.edu.gh).')
      return
    }

    setSaving(true)
    try {
      const result = await submitStudentVerification({
        studentEmail: email,
        studentIdUrl: idUrl,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setNotice('Submitted. An admin reviews verifications within 24 hours.')
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-24 skeleton-shimmer-light rounded-card mb-8" />
  }

  // ── Verified ──────────────────────────────────────────────────────────────
  if (verified) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-card p-6 mb-8">
        <p className="text-xs font-bold text-green-800 uppercase tracking-widest mb-1">
          Student verification
        </p>
        <p className="text-lg font-bold text-green-800 flex items-center gap-2">
          ✅ Verified Student
        </p>
        <p className="text-sm text-green-700 mt-1">
          Your student identity is confirmed — buyers see the verified badge on your shop.
        </p>
      </div>
    )
  }

  // ── Under review ──────────────────────────────────────────────────────────
  if (row && row.status === 'pending' && !showForm) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-card p-6 mb-8">
        <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-1">
          Student verification
        </p>
        <p className="text-lg font-bold text-amber-800">⏳ Under review</p>
        <p className="text-sm text-amber-700 mt-1 break-all">
          Submitted {new Date(row.submitted_at).toLocaleDateString()} · {row.student_email}
        </p>
        <p className="text-xs text-amber-700 mt-2">
          An admin checks your student ID and confirms the .edu.gh address. You&apos;ll get the
          badge as soon as it&apos;s approved.
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="mt-3 text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900"
        >
          Update my submission
        </button>
      </div>
    )
  }

  const rejected = row?.status === 'rejected'

  // ── Not submitted / rejected / editing ────────────────────────────────────
  return (
    <div className={`rounded-card p-6 md:p-7 mb-8 border ${rejected ? 'bg-red-50 border-red-200' : 'bg-white/90 border-gold/50'}`}>
      <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
        Student verification
      </p>
      <p className="text-lg font-bold text-charcoal">
        {rejected ? '❌ Verification not approved' : 'Get the ✅ Verified Student badge'}
      </p>
      <p className={`text-sm mt-1 ${rejected ? 'text-red-700' : 'text-ink-muted'}`}>
        {rejected
          ? row?.review_note || 'Your submission did not pass review. Fix the details below and try again.'
          : 'Verified sellers get more replies and close more deals. Confirm your .edu.gh email and student ID once.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-bold text-charcoal uppercase tracking-widest">
            Student email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@st.ug.edu.gh"
            required
            className="mt-1 w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal placeholder:text-ink-muted focus:outline-none focus:border-gold transition-colors text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-charcoal uppercase tracking-widest">
            Student ID link
          </label>
          <input
            type="url"
            value={idUrl}
            onChange={(e) => setIdUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="mt-1 w-full px-4 py-3 rounded-full border-2 border-rule text-charcoal placeholder:text-ink-muted focus:outline-none focus:border-gold transition-colors text-sm"
          />
          <p className="text-[11px] text-ink-muted mt-1">
            Upload a photo of your student ID to Google Drive and paste the shareable link. Only
            admins can open it.
          </p>
        </div>

        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {notice && <p className="text-xs font-medium text-green-700">{notice}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-full bg-gold text-charcoal font-bold text-sm hover:bg-gold-dark transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Submitting…' : rejected ? 'Resubmit' : 'Submit for verification'}
          </button>
          {(showForm || row) && (
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setError('')
                if (row) {
                  setEmail(row.student_email)
                  setIdUrl(row.student_id_url || '')
                }
              }}
              className="px-6 py-3 rounded-full border border-rule text-ink-muted font-semibold text-sm hover:bg-white/60 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
