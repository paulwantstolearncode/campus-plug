# Seller Dashboard — Feature Plan (Brainstorm worked example)

> Brainstorm mode: this is a **plan**, not an implementation. No source files are
> changed by this document. Review it, answer the open questions, then approve
> to turn it into work.

## 1. Goal

Give sellers one page to see everything about their Campus Plug presence:

- Their listings and each one's approval status
- Bookings made against their services
- Quick stats (total listings, approved, pending, bookings)

## 2. The brainstorm questions (with working assumptions)

| Question | Working assumption |
|---|---|
| Read-only or editable? | **Read-only** + Edit shortcut. Editing already exists at `/new?edit=<id>` — don't rebuild it. |
| New route or fold into `/`? | New route **`/dashboard`** — `/` is the buyer marketplace. |
| Who can access? | **Sellers only** (`is_seller`). Non-seller → redirect to `/become-seller`; logged-out → `/login`. |
| Show buyer identity on bookings? | **Yes (email)** — this needs **one new RLS policy** (see §5). This is the one real catch the brainstorm found. |
| Booking status (confirmed/completed)? | **No.** `bookings` has no status column. Out of scope (see §7). |
| Design | Match the existing language: charcoal nav, off-white section, white `rounded-3xl shadow-xl` cards, gold accents. |

## 3. Current state (what already exists)

- **Tables:** `listings` (+ `listing_images`, `listing_items`), `profiles` (`is_seller`, `is_admin`, `seller_status`), `bookings` (`listing_id`, `buyer_id`, `seller_id`, `booking_date`, `booking_time`, `notes`).
- **Flows:** `/new?edit=` edits listings; `/admin` approves; `/services/[id]/book` creates `bookings` rows.
- **RLS:** sellers manage their own listings/images/items; buyers can create bookings; `profiles` policies expose **only own rows + admins** — *this is why buyer identity on bookings is currently invisible to sellers.*
- **Fetch pattern:** `app/page.tsx` shows the established pattern — `getUser()` → listings fetch → tolerant `is_seller`/`is_admin` profile lookup, all errors `console.error`'d.

## 4. Proposed changes

### 4a. New route — `app/dashboard/page.tsx` (client component)

Mirror the `app/page.tsx` structure (nav + section layout, `fade-up` animations, `rounded-3xl` cards).

**Guard (in `loadEverything`):**
1. `getUser()` → `!user` → `router.push('/login')`
2. Profile lookup → `!profile.is_seller` → `router.push('/become-seller')`

**Data (all scoped to `auth.uid()` so RLS lets it through):**
```ts
// My listings, all statuses, newest first
const { data: myListings, error } = await supabase
  .from('listings')
  .select('id, title, price, listing_type, image_url, approval_status, created_at')
  .eq('seller_id', user.id)
  .order('created_at', { ascending: false })

// My bookings, newest first
const { data: myBookings, error: bookingsError } = await supabase
  .from('bookings')
  .select('*, listing:listings!listing_id (id, title), buyer:profiles!buyer_id (email)')
  .eq('seller_id', user.id)
  .order('created_at', { ascending: false })
  .limit(50)
```

**UI sections (top → bottom):**
1. **Stats row** — 3 cards: Total listings · Approved · Pending (plus "Bookings received" if desired).
2. **My Listings** — card per listing: thumbnail, title, price, **status chip** (`✅ Approved` / `⏳ Pending` / `❌ Rejected` with the admin-panel color language), Edit link (`/new?edit=<id>`), View link (`/listing/<id>`).
3. **Recent Bookings** — table/cards: date + time, listing title (link), buyer email, notes; empty state ("No bookings yet — share your listing!").

### 4b. Nav entry (small edits)

In `app/page.tsx` and `app/services/page.tsx` (desktop + mobile menus), add a **Dashboard** link rendered only when `isSeller` — next to the existing `+ Post` button, same styling family. Reuses state already fetched on both pages.

### 4c. One new RLS policy — `supabase/seller_dashboard_rls.sql`

To show buyer emails on bookings, sellers must be able to read the profile of users who booked them:

```sql
create policy "Sellers can view buyers of their bookings"
on public.profiles for select
to authenticated
using (
  exists (
    select 1 from public.bookings b
    where b.seller_id = auth.uid()
      and b.buyer_id = profiles.id
  )
);
```

- **Recursion-safe:** the subquery reads `bookings` (whose policies don't query `profiles`); the admin/own-row profiles policies are unchanged. No cycle.
- **Additive:** doesn't drop or weaken any existing policy — a seller can still only see profiles of people who booked *them*.
- If you'd rather not add this, fallback is showing `buyer_id` only (truncated) on booking cards — answer Q1.

## 5. Validation (after approval)

1. `npx tsc --noEmit` and `npx eslint app/dashboard/page.tsx app/page.tsx app/services/page.tsx`
2. Run `supabase/seller_dashboard_rls.sql` (diagnosis + policy + rollback-only verify block, same pattern as `fix_marketplace_visibility.sql`)
3. Manual: login as a seller → `/dashboard` shows listings + bookings; login as non-seller → redirected to `/become-seller`; logged out → `/login`.

## 6. File map (when approved)

| File | Change |
|---|---|
| `app/dashboard/page.tsx` | **New** — the dashboard |
| `app/page.tsx` | + Dashboard nav link (desktop + mobile) |
| `app/services/page.tsx` | + Dashboard nav link (desktop + mobile) |
| `supabase/seller_dashboard_rls.sql` | **New** — seller-can-view-buyers policy + verify block |

## 7. Out of scope (future)

- Booking **status** (confirmed / completed / cancelled) — needs a `bookings.status` migration + seller action buttons
- Editing/deleting from the dashboard (already exists via `/new?edit=`; could add delete later)
- Analytics (views, WhatsApp click counts), messaging, revenue tracking

## 8. Open questions for you

1. **Buyer identity:** OK to add the `seller_dashboard_rls.sql` policy so booking cards show the buyer's email? (Or show truncated `buyer_id`?)
2. **Scope:** keep it read-only + Edit shortcut, or add delete-from-dashboard now?
3. **Bookings pagination:** 50 most recent enough, or need a "load more"?
