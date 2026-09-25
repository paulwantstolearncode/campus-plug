# Handoff — Campus Plug

Last updated: 2026-09-25

## Current state

- **Repo**: github.com/paulwantstolearncode/campus-plug (origin/main)
- **Live**: campuspluggh.com
- **Latest commit**: 116166b — fix: resolve eslint purity and set-state-in-effect warnings
- **Working tree**: 27 routes build clean. Pre-existing uncommitted changes to leave alone: `supabase/add_analytics_and_boosts.sql` + `supabase/fix_profiles_public_read.sql` (modified), untracked `FREEBUFF_BRIEF.md` / `FREEBUFF_BRIEF_NAVBAR_EXTRACTION.md` — stage ONLY your own task files.
- **Design system**: warm paper × obsidian × gold. Tokens in `app/globals.css` (`--color-paper #f6f5f1`, `--color-ink #0a0a0c`, `--color-gold-signal #c9a227`, `--color-gold-vivid #e8b93b`, `--color-rule #e4e1d8`); classes `bg-ink`, `text-gold`, `border-rule`, `bg-paper-deep`, `text-ink-muted`, `font-display` (Space Grotesk), `font-serif-accent` (Instrument Serif italic), `grain-overlay`, `card-lift`. Tailwind v4 (@theme inline tokens, trailing `!` important syntax). Next.js 16.2.12 (Turbopack) + Supabase.

## Recently shipped

### ESLint purity / set-state-in-effect fixes (116166b)
- `app/listing/[id]/ListingDetailClient.tsx`: `outcomeDismissed` reads `cp_outcome_<listingId>` from localStorage in a lazy `useState` initializer (SSR-guarded) instead of a mount effect; `isStale` no longer calls `Date.now()` during render — the clock is snapshotted once via `useState(() => Date.now())` and consumed in a pure `useMemo` keyed `[listing, nowTs]`.
- **react-hooks v6 gotcha**: the purity rule flags `Date.now()` even *inside* `useMemo` (memo callbacks are render-phase code). Lazy `useState` initializers run once at mount — that's the accepted pattern for clock snapshots.
- `app/services/page.tsx`: removed unused `ALL_LOCATIONS` import; `?q=` / `?category=` URL sync defers `setSearchQuery`/`setCategoryFilter` into a `setTimeout(..., 0)` callback instead of synchronous setState in the effect body. Deep-link behavior unchanged.

### Poster generator — themes, story export, QA-verified layout (4fa1d32 → a64879e)
- `/admin/posters`: 4 background themes (`obsidian` / `paper` / `gold` / `legon`) in `THEME_CONFIG` (each with `featureCardClass` / `featureTextClass`); formats a4 794×1123, a5 559×794, mobile story 1080×1920; PNG/JPEG export via `html-to-image@1.11.13`; 3 templates (General Student Poster, Wanted Board Flyer, Seller Recruitment) + QR uploader with auto-generated fallback + location backfill (per-row save or bulk auto-assign, `📍 Location Backfill` link in `/admin` header).
- Story preview: canvas at print resolution 1080×1920 with CSS `zoom: 0.333` (`STORY_PREVIEW_WIDTH=360`) inside `aspect-[9/16] max-h-[650px] w-auto max-w-[360px] mx-auto` shell. Export clones the node off-DOM at 540×960, zoom 1, `pixelRatio: 2` → exact 1080×1920.
- Inner layout `flex flex-col justify-between h-full`: full-bleed top bands / `flex-1 justify-evenly` middle (headline text-4xl on story vs text-2xl on A4, CATEGORY_PILLARS 4 pills, QR 240px story / 200px A4) / bottom stack (location chip, HALL_CHIPS, trust line inside the dark `bg-ink` footer band for contrast on light themes).
- Verified via live visual QA (screenshots of all 4 themes + DOM measurements: zones 45/535/58px, footer gap 1px, 0 overflow); QA caught and fixed story type scale + trust-line contrast.

### Categories & Fresher Kit redesigns (11115a6, fec50ce, c57d2fc)
- `/categories` is a force-dynamic visual directory: native GET search form (`action="/services"` `name="q"`, placeholder "Search laptops, kettles, braiding…"), 4 hero cards (hostel-essentials / electronics-gadgets / tutoring / hair-beauty, `sm:col-span-2`, per-color gradient wash, 🔥 Freshers Choice / ⚡ High Demand badges), 10 standard cards, SamplePills, CountPill, obsidian CTA in a `p-px` metallic gold gradient wrapper with grain.
- `lib/categories.ts`: 14 real DB-persisted slugs — services: `hair-beauty, tutoring, tech-repairs, design-creative, delivery-errands, food-catering, other-services`; products: `clothing-fashion, electronics-gadgets, snacks-food, beauty-products, hostel-essentials, gifts-accessories, other-products`. `Category` requires `sampleItems: string[]`. **Do not invent slugs — only these 14 exist in the DB.**
- `/fresher-kit`: obsidian hero, bento pillars, dark glass FresherChecklist with gold progress bar + localStorage `cp_fresher_checklist`, glassmorphic share bar. Explanatory subtitles stripped from 5 admin pages.
- c57d2fc: mobile thumb-zone action bar on listing detail (WhatsApp one tap away, heart mirrors Save), Ghanaian microcopy, shimmer skeletons, staggered feed animations. a6e10ea: story-format poster aspect/preview bounds (see Poster generator). 45ca5b6: marquee fixed on mobile (hover-pause only under `@media (hover: hover)`).

### WhatsApp viral share loop (1b24d0c)
- `whatsapp_share` analytics event type (migration `supabase/add_whatsapp_share_event_type.sql` already run in Supabase). Share buttons on listing detail + cards, branded wa.me lead messages with attribution, dashboard share-shop toolkit.
- **Feeds convention**: public queries use `.eq('approval_status','approved').is('deleted_at',null).is('sold_at',null)`.

### WhatsApp Funnel Outcome Tracking + Sold Listings (dcfcc15)
- **Post-WhatsApp outcomes**: new `whatsapp_outcome` analytics event type (extended CHECK constraint on `analytics_events`). Buyer follow-up panel on listing detail — "How did it go with the seller?" (sold / got a reply / messaged / no response / skip) — shown only after a WhatsApp click, never to the listing's own seller, persisted in localStorage (`cp_outcome_<listingId>`), zero layout shift (in-flow below the safety strip, ≥44px tap targets).
- **Sold listings**: `listings.sold_at` + `listings.last_activity_at` columns. Seller dashboard "Mark as Sold" / "Mark Available" buttons with optimistic UI; SOLD badge on cards + detail; sold listings excluded from home feed, services feed, shop pages, and sitemap (`.is('sold_at', null)`); favorites/admin/dashboard still show sold items with badge.
- **Staleness**: `listings.last_activity_at` auto-bumped by a trigger on `whatsapp_click` / `whatsapp_outcome` events; amber "hasn't been active in 30+ days" notice on detail page; `public.is_stale()` helper.
- **RPCs (SECURITY DEFINER, owner/admin auth-checked)**: `log_whatsapp_outcome(listing_id, outcome)` (validates outcome whitelist), `mark_listing_sold(listing_id)`, `mark_listing_available(listing_id)`. GRANTs to anon + authenticated. Defensive RLS on listings: "Sellers can update own listings" + "Admins can update all listings".
- **SQL**: `supabase/add_funnel_outcomes_and_staleness.sql` + `supabase/funnel_metrics_queries.sql` (7 read-only reference queries: weekly funnel, supply/demand, outcome mix, per-listing conversion, boosted vs non-boosted, stale listings, recorded sales). **Migration ALREADY APPLIED in Supabase** — repo file restored to the validated version after a prior agent rewrite introduced bugs (unauthenticated SECURITY DEFINER RPCs, IMMUTABLE volatility on `now()`-dependent function, missing CHECK constraint, metrics syntax error). Re-running the repo file is safe (idempotent) but not required.

### PageSpeed & Skeleton Loaders (74373b9)
- **Skeleton loaders** on 3 pages: `/services` (6 card skeletons), `/` homepage (6 card skeletons), `/dashboard` (4 stat + 3 listing skeletons). Replaces blank/spinner loading states with immediate visual layout.
- **Blur placeholders** on listing cards — warm paper-colored SVG placeholder shows instantly while real image loads (no jarring pop-in).
- **Raw `<img>` eliminated** — hero featured listing and banner ads in LandingPage converted to `next/image` with proper sizing and optimization. Zero raw `<img>` tags remain in public pages.
- New `app/components/Skeleton.tsx` reusable component with shimmer animation.
- Files: components/Skeleton.tsx, services/page.tsx, page.tsx, dashboard/page.tsx, LandingPage.tsx, ListingCard.tsx.

### Visual Redesign (3f8fb21)
- **"Warm paper × obsidian × gold signal" design system** — new font stack (Space Grotesk display headings, Plus Jakarta Sans body, Instrument Serif italic gold accents, IBM Plex Mono prices/meta), gold shifted from #d4af37 to #c9a227 (metallic signal), card-lift hover effect with 3-tier shadow system (lift/card/glow), glass-dark/hairline/paper-deep surface treatments, editorial eyebrow labels, gradient gold text, and refined scrollbar/selection styles.
- Files: globals.css, layout.tsx, LandingPage.tsx, ListingCard.tsx, requests/page.tsx, shop/[id]/ShopClient.tsx, listing/[id]/ListingDetailClient.tsx.
- Branch: `feature/ui-redesign` merged to main.

### Monetization Infrastructure (a00717d)
- **Analytics system**: `analytics_events` table with RLS (public INSERT, admin read, seller read own). Denormalized `view_count` and `whatsapp_click_count` on listings, updated via `increment_listing_counter()` SECURITY DEFINER function. View tracking on listing detail page, click tracking on WhatsApp buttons in ListingCard and ListingDetail.
- **Seller analytics dashboard**: New section on `/dashboard` showing total views, WhatsApp clicks, conversion rate (clicks/views %), and per-listing breakdown with views, clicks, and CVR.
- **Boost system**: `boosted_until` column on listings. "Boost this listing (7 days)" button on each approved listing in seller dashboard. Boosted listings sorted first in all feed queries (services, landing page fill, homepage).
- **Banner ads**: `banner_ads` table with RLS (public read active, admin CRUD). Admin management page at `/admin/banners` with create/edit/delete, color picker, slot ordering, expiry, and live preview. Landing page renders banner slots between hero and content sections.
- **SQL migration**: `supabase/add_analytics_and_boosts.sql` — idempotent, safe to re-run. Creates analytics_events, banner_ads tables, listing counters, boosted_until column, and increment_listing_counter function.

### Backend Hardening (6b2147d)
- **Soft deletes** for `listings` and `plug_requests` tables — new `deleted_at` timestamptz column with partial indexes on `deleted_at IS NULL`. Seller delete action in `app/page.tsx` now sets `deleted_at = now()` instead of hard-deleting, preserving historical sales, reviews, and orders. All 10 feed query paths (landing, services, favorites, shop, admin, requests, categories) filter out soft-deleted rows with `.is('deleted_at', null)`.
- **SMS rate limiting** on `/api/sms/send-otp` — DB-persisted via `sms_rate_limits` table and `check_sms_rate_limit()` SECURITY DEFINER function. Limits: 3 requests / 10 minutes per IP, 5 requests / 10 minutes per phone number. Returns HTTP 429 on rate limit. Fail-closed design: if rate-limit DB is unavailable, returns 503 to prevent wallet drain.
- **SQL migrations**: `supabase/add_soft_deletes.sql` (7 statements) + `supabase/add_sms_rate_limits.sql` (12 statements) — both executed in Supabase.

### Phone Auth System — Moolre SMS OTP (be4c714 → cb0ab96)
- **Moolre SMS proxy**: `app/api/sms/send-otp/route.ts` — Next.js webhook API at `/api/sms/send-otp` using `X-API-VASKEY` header (from `MOOLRE_SECRET_KEY`) and confirmed body shape: `{ senderid, type: 1, messages: [{ recipient, message }] }`. Flat format `{ recipient }` at top level fails ASMS08 — only the `messages[]` array with `recipient` inside each item succeeds (SMS01). Phone formatted to Ghana local `0XXXXXXXXX`.
- **Hardened profiles trigger**: `supabase/harden_profiles_trigger_for_phone.sql` — adds `phone` column to profiles, gracefully handles phone-only users (null email/metadata), copies `auth.users.phone` → `profiles.phone`, sets `full_name` to `Student_[last4]` fallback. Idempotent (DROP + CREATE).
- **Phone tab UI on /login**: Email/Phone toggle in both Sign In and Sign Up modes. Phone Auth upgraded to Phone + Password: sign-up flow collects Name + Phone + Password via `signUp({phone, password})` → OTP verify; sign-in flow uses `signInWithPassword({phone, password})` for **0 SMS cost on returning logins**. Fallback "Forgot password? Log in with 1-time SMS code" link toggles OTP flow. Name input binds to Supabase auth metadata (`full_name`). Back-button loop fixed with `router.replace()` + session check on mount.
- **Login page phone format**: `formatPhoneForSupabase()` returns `+233XXXXXXXXX` (E.164) for Supabase Auth. SMS proxy formats to `0XXXXXXXXX` (Ghana local) for Moolre.
- **WhatsApp seller numbers**: `/become-seller` page has editable "WhatsApp Number for Buyers" field with helper text "Buyers will message this number on WhatsApp to book your services" — pre-filled from profile, saved to `profiles.whatsapp_number`.
- **Required Vercel env vars**: `MOOLRE_SECRET_KEY` (VASKEY), `MOOLRE_ACCOUNT_NO`, `MOOLRE_SENDER_ID`, `SUPABASE_SMS_WEBHOOK_SECRET`.
- **Supabase config**: Enable Phone provider in Auth → Providers → Phone. Set SMS webhook URL to `https://campuspluggh.com/api/sms/send-otp`.

### Shared NavBar component
- Extracted `app/components/NavBar.tsx` — shared navigation component with user profile dropdown, dark/light variants, and mobile drawer. Replaces duplicated nav markup across LandingPage.tsx, page.tsx, and services/page.tsx.
- **Full extraction (857b8e7)**: all 19 remaining pages migrated onto the shared NavBar — added `admin` / `dashboard` variants, `back` prop (visible on ALL viewports), `rightSlot` prop (privacy/terms login buttons, requests "Post a Request" button). Mobile preserved: no hamburger/drawer on migrated pages (`showHamburger = !back && !rightSlot`).
- **Dead-code cleanup (4b25ae3)**: removed unused `isLight`, dead scroll state/effects (privacy, terms, requests), unused `useRouter`/`Link` imports, unused `userWhatsapp` state; fixed `/admin/banners` back link → `/admin` "Review Queue".
- **IBM Plex Mono dropped (4bee45e)**: removed from next/font (PageSpeed win, ~40KB); `--font-mono` now uses the system monospace stack (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) — also fixes a self-referencing CSS variable bug in the old declaration.

### Phase A.4 Location Filtering
- Campus location filter chips added to `/services` page, allowing students to narrow listings by campus location.

### Instant Request Empty Search CTA
- Empty search results on `/services` now direct students to post on `/requests` (Wanted Board) instead of showing a dead end.

### PageSpeed & Image Optimization
- Converted 100% of raw `<img>` tags across 9 files to Next.js `<Image />` with `remotePatterns` configured for Supabase Storage, Google Avatars, and Unsplash. Implemented responsive `sizes`, `fill` containers, WebP auto-formatting, and `priority` loading for above-the-fold cards. Zero `<img>` tags remain in the codebase.

### ⭐ Top-Rated Badges
- Added gold "Top Rated" pill badge to ListingCards and a prominent "Top Rated Seller" badge with gold border in the seller proof section on the listing detail page. Badge eligibility is computed by the existing `seller_ratings` PostgreSQL view (`is_top_rated` = review count >= 10 AND average rating >= 4.8).

### 📱 PWA & Add to Home Screen
- Added `app/manifest.ts` web manifest (name: "Campus Plug — Student Marketplace at UG", standalone display, theme `#0f0f0f`, background `#f8f8f8`).
- Added `app/components/PWAInstallPrompt.tsx` — catches `beforeinstallprompt` on Chrome/Android for a floating install banner, detects iOS Safari for a "Tap Share → Add to Home Screen" helper toast. Dismissal persisted in localStorage to avoid spam.
- Integrated in `app/layout.tsx` alongside HelpButton and FeedbackButton.

### 📊 Admin Sales Analytics Polish
- Added status filter tabs (`All` / `Completed` / `Pending` / `Cancelled`) with live transaction counts to `/admin/sales`.
- Added transaction status breakdown cards (green/amber/red) at the top of the metrics section.
- CSV export now respects both time and status filters (filtered results, not all transactions).

### Feedback system (a81a3cc)
- `supabase/add_feedback.sql` — feedback table + RLS (public INSERT for anon+authenticated; admin-only SELECT/UPDATE/DELETE via `public.is_admin()`). Migration ran successfully in production; 4 policies verified; anonymous insert smoke test passed.
- `lib/feedback.ts` — Supabase client helper for inserting feedback.
- `app/components/FeedbackModal.tsx` / `app/components/FeedbackButton.tsx` — floating button (logged-in) + footer link (logged-out).
- `app/admin/feedback/page.tsx` — admin view at `/admin/feedback` with category/unread filters and mark-as-read. Returns 200 on production (redirects non-admins, does not 404).

### Favourites system (fc9d903 / a35e00a / 0de4660)
- Favourites table with RLS (user-scoped SELECT/INSERT/DELETE).
- Heart icon on ListingCard, save button on listing detail page with optimistic UI, `/favorites` page with empty state.
- Favorites nav links added to landing, services, and logged-in homepage nav.

### Privacy/terms + SEO (196b886, 89c6045)
- sitemap.xml + robots.txt for SEO.
- Privacy policy and terms of service pages.

### Google OAuth (d615b2e, 78cd3a1)
- Signup simplified to Google-only (email login preserved).
- OAuth callback hardened: network errors handled, open redirects prevented.

### Project rules restored
- `CLAUDE.md` starts with `@AGENTS.md` + `@HANDOFF.md` imports + priority note + no-modify guard (CLAUDE.md, AGENTS.md, HANDOFF.md are protected).
- `AGENTS.md` expanded with full non-negotiable ground rules (SQL-first deploys, RLS conventions, no-touch list, code conventions, validation, design system, repo facts, testing limits).

## Visual QA methodology (works well)
1. Create a temp dev-only QA page (e.g. `app/dev-poster-qa/page.tsx`).
2. `npm run dev > /tmp/campusplug-dev.log 2>&1 &` — picks a random port (e.g. 54201); read the log for `Local: http://localhost:PORT`.
3. Find PID via `netstat -ano | grep :PORT | grep LISTEN`, then `register_preview` with `{url, pid}` and drive snapshot / screenshot / evaluate / resize.
4. Cleanup: delete the QA page, `taskkill //F //PID <pid>`, and if tsc errors on a stale `.next/dev/types/validator.ts`, `rm -rf .next/dev/types .next/types` then re-run.

## Vercel duplicate project — RESOLVED

There were two Vercel projects both named "campus-plug". The broken duplicate (`prj_JIdq7kavttXMXRzhXWJW59zmJUkM`, zero env vars, every build failing with `BUILD_UTILS_SPAWN_1`) has been removed. **Only one Vercel project remains:**

- **Project**: `prj_fmg0XciGaPCZkUTcmsFSgT3njU2y` (`campus-plug-oukb`)
- Serves **campuspluggh.com** via production alias
- Git push deployments → **READY** (green)
- Lesson: verify which project the domain is aliased to before assuming a failed `vercel ls` build affects production.

## Ground rules that must not be touched without permission

- Auth (Supabase Auth config, session handling, RLS on `profiles`)
- Sentry setup
- Vercel Analytics
- Resend email setup
- Existing seller reviews system
- AGENTS.md, CLAUDE.md, HANDOFF.md, docs/
- SQL migrations (any migration file or DB change)
- No new npm packages unless asked

## Validation before shipping

- `npx tsc --noEmit` — 0 errors
- `npx eslint` on touched files — 0 errors
- `rm -f .next/build.lock && npm run build` — clean
- Stage ONLY task files (working tree has pre-existing untouchables — see Current state)
- For SQL files: `node .sqlcheck/check.js <file>`

## Project Strategy & Roadmap

### Strategic Decisions

- **Monetization Active**: Revenue streams now in place:
  1. **Featured listings** (admin-curated slots on landing page) — already working via `/admin` featured tab.
  2. **Boosted search placement** — sellers can boost listings for 7 days from `/dashboard`. Boosted listings sort first in all feeds.
  3. **Banner ads** — local businesses can advertise on the landing page via `/admin/banners`. Admin CRUD with expiry and color customization.
  4. **Seller analytics** — view/click/conversion data visible on `/dashboard`. Foundation for paid analytics tier.
  - All monetization is attention-based (not transaction-based), matching the WhatsApp-off-platform payment model.
  - Next: outreach to 3-5 local businesses near campus for banner ad trials.

## Next steps

1. (Done) Nav extraction, WhatsApp funnel outcomes, IBM Plex Mono drop, share loop + categories/fresher-kit redesigns + poster generator upgrades (through c57d2fc).
2. (Done) ESLint purity / set-state-in-effect cleanup in listing detail + services (116166b).
3. Consider a full-repo `npx eslint .` audit — react-hooks v6 purity rules are strict; other components may call `Date.now()` during render.
4. Candidate refactor: extract a shared `useNow()` hook (timestamp snapshot once at mount) for all relative-time/staleness calculations.
5. Outreach to 3-5 local businesses near campus for banner ad trials (kit prepared: `outreach/` one-pager, WhatsApp scripts, playbook).
6. Add payment gate to boost button (MoMo) once sellers show demand — needs payment-provider decision (Paystack recommended).
7. Run `funnel_metrics_queries.sql` weekly to build the funnel ritual (views → clicks → outcomes → sold).
8. Mobile QA pass on the follow-up panel + sold badges (360px viewport) before the January semester push.
