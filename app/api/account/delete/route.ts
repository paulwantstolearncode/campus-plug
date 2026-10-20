import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/account/delete
 *
 * Permanently deletes the authenticated caller's account and everything tied
 * to it — listing photos (storage), listings, bookings, sales, favorites,
 * notifications, reviews + responses, seller ratings, feedback, analytics
 * events, the profile row, and finally the Supabase auth user itself.
 *
 * Auth: Authorization: Bearer <own supabase access token>. You can only
 * delete yourself; the route derives the user id from the token and ignores
 * any body.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY on the server (never NEXT_PUBLIC_*).
 * Without it the route answers 503 so a misconfigured deploy fails loudly
 * instead of silently half-deleting.
 *
 * No new SQL: every sweep is an explicit delete with the service-role client
 * (bypasses RLS), ordered children-before-parents so foreign keys hold.
 */

export async function POST(request: Request) {
  // ── 1. Caller identity ───────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) {
    return NextResponse.json({ error: 'Missing auth token.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 503 })
  }
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: 'Account deletion is not configured on this server.' },
      { status: 503 }
    )
  }

  const { data: authData, error: authError } = await createClient(url, anonKey, {
    auth: { persistSession: false },
  }).auth.getUser(token)
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 })
  }
  const uid = authData.user.id

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  // ── 2. Collect listing photo URLs while the rows still exist ─────────
  const { data: listingRows } = await admin
    .from('listings')
    .select('id, image_url, images')
    .eq('seller_id', uid)

  const listingIds = (listingRows || []).map((l: { id: string }) => l.id)

  const { data: imageRows } = listingIds.length
    ? await admin.from('listing_images').select('image_url').in('listing_id', listingIds)
    : { data: null }

  const marker = '/listing-images/'
  const toStoragePath = (raw: unknown): string | null => {
    if (typeof raw !== 'string' || !raw.includes(marker)) return null
    return decodeURIComponent(raw.slice(raw.indexOf(marker) + marker.length))
  }

  const photoPaths = new Set<string>()
  for (const row of listingRows || []) {
    const urls: unknown[] = [row.image_url]
    // `images` is a multi-photo column that may be jsonb or text-wrapped
    // JSON depending on when the bundles migration ran — handle both.
    const raw = (row as { images?: unknown }).images
    if (Array.isArray(raw)) {
      urls.push(...raw)
    } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) urls.push(...parsed)
      } catch { /* not JSON — ignore */ }
    }
    for (const u of urls) {
      const p = toStoragePath(u)
      if (p) photoPaths.add(p)
    }
  }
  for (const row of imageRows || []) {
    const p = toStoragePath((row as { image_url: unknown }).image_url)
    if (p) photoPaths.add(p)
  }

  // ── 3. Best-effort photo cleanup (public bucket) ──────────────────────
  if (photoPaths.size > 0) {
    const { error: storageError } = await admin.storage
      .from('listing-images')
      .remove([...photoPaths])
    if (storageError) {
      // Non-fatal: orphaned storage objects become unreachable once every
      // row referencing them is gone.
      console.error('[Account Delete] ⚠ storage cleanup failed:', storageError.message)
    }
  }

  // ── 4. Data sweep (child tables first) ───────────────────────────────
  const failures: string[] = []
  const attempt = async (
    table: string,
    run: () => PromiseLike<{ error: { message: string } | null }>
  ) => {
    const { error } = await run()
    if (error) {
      // Logged + collected, but non-critical: the privacy-critical pair
      // (profile row + auth user) is enforced strictly below.
      console.error(`[Account Delete] ✗ ${table}: ${error.message}`)
      failures.push(table)
    }
  }

  if (listingIds.length > 0) {
    await attempt('listing_images', () =>
      admin.from('listing_images').delete().in('listing_id', listingIds))
    await attempt('listing_items', () =>
      admin.from('listing_items').delete().in('listing_id', listingIds))
    // bookings/listings FK predates the CASCADE-era migrations — sweep by
    // listing id explicitly instead of trusting cascade.
    await attempt('bookings (own listings)', () =>
      admin.from('bookings').delete().in('listing_id', listingIds))
  }
  await attempt('favorites', () =>
    admin.from('favorites').delete().eq('user_id', uid))
  await attempt('bookings', () =>
    admin.from('bookings').delete().or(`seller_id.eq.${uid},buyer_id.eq.${uid}`))
  await attempt('sales', () =>
    admin.from('sales').delete().or(`seller_id.eq.${uid},buyer_id.eq.${uid}`))
  await attempt('notifications', () =>
    admin.from('notifications').delete().eq('user_id', uid))
  await attempt('review_responses', () =>
    admin.from('review_responses').delete().eq('seller_id', uid))
  await attempt('reviews', () =>
    admin.from('reviews').delete().or(`seller_id.eq.${uid},reviewer_id.eq.${uid}`))
  await attempt('seller_ratings', () =>
    admin.from('seller_ratings').delete().eq('seller_id', uid))
  await attempt('feedback', () =>
    admin.from('feedback').delete().eq('user_id', uid))
  await attempt('analytics_events', () =>
    admin.from('analytics_events').delete().eq('user_id', uid))
  await attempt('listings', () =>
    admin.from('listings').delete().eq('seller_id', uid))

  // ── 5. Privacy-critical pair — strict ────────────────────────────────
  const { error: profileError } = await admin.from('profiles').delete().eq('id', uid)
  if (profileError) {
    console.error('[Account Delete] ✗ profiles:', profileError.message)
    return NextResponse.json(
      { error: 'Could not delete your profile — the account was not removed. Please try again.' },
      { status: 500 }
    )
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(uid)
  if (deleteUserError) {
    console.error('[Account Delete] ✗ auth user:', deleteUserError.message)
    return NextResponse.json(
      { error: 'Your data was deleted but the login could not be removed. Please try again to finish.' },
      { status: 500 }
    )
  }

  if (failures.length > 0) {
    console.warn('[Account Delete] ⚠ completed with non-critical failures in:', failures.join(', '))
  }
  return NextResponse.json({ ok: true })
}
