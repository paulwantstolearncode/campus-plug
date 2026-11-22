'use client'

// Admin verification queue (item 16): approve or reject seller student-ID
// submissions. Reads public.seller_verifications (admin-only SELECT policy) and
// writes through verify_seller_identity(), which flips both the submission row
// and the public profiles.student_id_verified badge in one transaction.
//
// Renders nothing when the queue is empty, so it can be dropped into the admin
// dashboard without adding noise.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { verifySellerIdentity } from '@/lib/verification'
import { formatName } from '@/lib/formatName'

interface PendingRow {
  user_id: string
  student_email: string
  student_id_url: string | null
  submitted_at: string
  full_name: string | null
}

export default function AdminVerificationQueue() {
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('seller_verifications')
        .select('user_id, student_email, student_id_url, submitted_at')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true })

      if (fetchError) {
        // Non-admins simply see an empty queue; don't shout on the dashboard.
        setRows([])
        return
      }

      const submissions = data || []
      let nameById: Record<string, string | null> = {}
      if (submissions.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', submissions.map((s) => s.user_id))
        nameById = (profiles || []).reduce<Record<string, string | null>>((acc, p) => {
          acc[p.id] = p.full_name
          return acc
        }, {})
      }

      setRows(
        submissions.map((s) => ({
          user_id: s.user_id,
          student_email: s.student_email,
          student_id_url: s.student_id_url,
          submitted_at: s.submitted_at,
          full_name: nameById[s.user_id] ?? null,
        }))
      )
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

  const decide = async (row: PendingRow, verified: boolean) => {
    setBusyUserId(row.user_id)
    setError('')
    try {
      const result = await verifySellerIdentity({
        sellerId: row.user_id,
        verified,
        note: notes[row.user_id]?.trim() || undefined,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      await load()
    } finally {
      setBusyUserId(null)
    }
  }

  if (loading || rows.length === 0) return null

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-card p-6 md:p-8 border border-gold/40 mb-8">
      <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-1">
        Student verification
      </p>
      <p className="text-lg font-bold text-charcoal mb-1">
        {rows.length} awaiting review
      </p>
      <p className="text-xs text-ink-muted mb-4">
        Open the ID link, confirm the name matches the .edu.gh address, then approve or reject.
      </p>

      {error && (
        <p className="mb-3 text-xs font-medium text-red-600">{error}</p>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.user_id} className="rounded-2xl border border-rule p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-charcoal truncate">
                  {row.full_name ? formatName(row.full_name) : 'Student seller'}
                </p>
                <p className="text-xs text-ink-muted break-all">{row.student_email}</p>
                <p className="text-[11px] text-ink-muted mt-1">
                  Submitted {new Date(row.submitted_at).toLocaleString()}
                </p>
              </div>
              {row.student_id_url ? (
                <a
                  href={row.student_id_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-bold text-gold-dark underline underline-offset-2 hover:text-charcoal"
                >
                  Open student ID →
                </a>
              ) : (
                <span className="shrink-0 text-[11px] text-red-600 font-semibold">No ID link</span>
              )}
            </div>

            <input
              type="text"
              value={notes[row.user_id] || ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [row.user_id]: e.target.value }))}
              placeholder="Reason (shown to the seller if you reject)"
              className="mt-3 w-full px-4 py-2.5 rounded-full border border-rule text-sm text-charcoal placeholder:text-ink-muted focus:outline-none focus:border-gold transition-colors"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => decide(row, true)}
                disabled={busyUserId === row.user_id}
                className="px-5 py-2.5 rounded-full bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                ✅ Approve
              </button>
              <button
                onClick={() => decide(row, false)}
                disabled={busyUserId === row.user_id}
                className="px-5 py-2.5 rounded-full bg-white border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
