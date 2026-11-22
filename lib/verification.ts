// Seller student verification — client-side helpers.
//
// Split out of lib/sellers.ts on purpose: that module is server-only (it reads
// cookies via next/headers for the public shop page), so client components
// cannot import anything runtime from it.
//
// Tables: seller_verifications (add_student_verification.sql) — seller + admin
// only, because it holds the student email and ID photo URL. The public badge
// flag lives on profiles.student_id_verified and is written exclusively by the
// verify_seller_identity() RPC.

import { supabase } from './supabase'

export interface VerificationSubmission {
  status: 'pending' | 'verified' | 'rejected'
  student_email: string
  student_id_url: string | null
  review_note: string | null
  submitted_at: string
  reviewed_at: string | null
}

/** Submit (or re-submit) the caller's own student verification.
 *
 *  RLS forces new/updated rows to status = 'pending' and blocks the seller from
 *  touching the review fields, so a seller can never verify themselves.
 */
export async function submitStudentVerification(input: {
  studentEmail: string
  studentIdUrl: string
}): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You need to be signed in to submit verification.' }

  const email = input.studentEmail.trim()
  if (!email || !email.includes('@')) {
    return { error: 'Enter the email address on your student record.' }
  }

  const { error } = await supabase
    .from('seller_verifications')
    .upsert(
      {
        user_id: user.id,
        student_email: email,
        student_id_url: input.studentIdUrl.trim() || null,
        status: 'pending',
        review_note: null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (error) return { error: error.message }
  return {}
}

/** The caller's own verification submission, if any (for the dashboard card). */
export async function getMyVerification(): Promise<VerificationSubmission | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('seller_verifications')
    .select('status, student_email, student_id_url, review_note, submitted_at, reviewed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return (data as VerificationSubmission | null) || null
}

/** Admin: verify (or reject) a seller's student identity.
 *  Goes through the SECURITY DEFINER RPC so the submission row and the public
 *  badge flag move together. */
export async function verifySellerIdentity(input: {
  sellerId: string
  verified: boolean
  note?: string
}): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('verify_seller_identity', {
    p_seller_id: input.sellerId,
    p_verified: input.verified,
    p_note: input.note ?? null,
  })

  if (error) return { error: error.message }
  return {}
}
