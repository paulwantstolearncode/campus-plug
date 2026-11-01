# Handoff — Campus Plug

Last updated: 2026-10-21

**What:** Student marketplace for University of Ghana (UG Legon). WhatsApp-based transactions — students discover listings on the site, message sellers on WhatsApp to buy/sell.

- **Repo**: github.com/paulwantstolearncode/campus-plug (origin/main)
- **Live**: campuspluggh.com
- **Latest commit**: d8802cc — fix(posters): bump A6 QR to 140px for reliable handheld scanning
- **Stack**: Next.js 16.2.12 (App Router, Turbopack) + Tailwind v4 (`@theme inline` tokens, trailing `!` important syntax) + Supabase (Auth + DB + Storage) + Vercel. 26 routes build clean.
- **Working tree**: `supabase/add_analytics_and_boosts.sql` + `supabase/fix_profiles_public_read.sql` have pre-existing whitespace-only diffs — leave alone, stage ONLY your own task files.

## Feature status

| Area | Status | Notes |
|---------|--------|-------|
| **Auth** | ✅ | Google OAuth + Phone/Password (Moolre SMS OTP webhook, rate-limited 3/10m IP, 5/10m phone). Switch Account in NavBar → sign out → `/login`. |
| **Listings** | ✅ | CRUD + image upload, approval workflow, campus locations, categories, soft deletes, sold flags, **price ranges** (`max_price`, see below). |
| **Feeds** | ✅ | `/services` (search, category + location chips), home, `/favorites`, `/shop/[id]`. Convention: `.eq('approval_status','approved').is('deleted_at',null).is('sold_at',null)`. |
| **Wanted Board** | ✅ | `/requests`. |
| **Dashboard** | ✅ | `/dashboard` — stats, listing mgmt, analytics, boosts, record-sale + sale editing (24h window). |
| **Admin** | ✅ | `/admin` — approval queue, featured slots, sales analytics, feedback, banners, locations, **poster generator** (see below). |
| **Monetization** | ✅ | Featured listings, 7-day boosts, banner ads, seller analytics (views/clicks/CVR). All attention-based (matches off-platform WhatsApp payment model). |
| **PWA** | ✅ | Manifest + install prompt (Android/iOS). |
| **Feedback / Favourites / Reviews** | ✅ | All live. Top-Rated badges via `seller_ratings` view. |
| **SEO** | ✅ | Sitemap, robots, dynamic OG per listing (vendored WOFF fonts, see gotchas). |

## Design system: "Warm paper × obsidian × gold" ("Legon Noticeboard")

- **Fonts**: Space Grotesk (display, `font-display`), Plus Jakarta Sans (body), Instrument Serif (`font-serif-accent` italic gold accents), system mono stack (IBM Plex Mono was dropped for PageSpeed).
- **Tokens** in `app/globals.css`: `--color-paper #f6f5f1`, `--color-ink #0a0a0c`, `--color-ink-soft #17171c`, `--color-ink-muted`, `--color-rule #e4e1d8`, `--color-gold-signal #c9a227`, `--color-gold-vivid #e8b93b`, `--color-whatsapp #128c4a` / `-bright #25d366`. Tailwind classes: `bg-ink`, `bg-paper`, `bg-paper-deep`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-rule`, `bg-whatsapp`, `shadow-lift/card/glow`, `hairline`, `card-lift`, `grain-overlay`.
- **Conventions (post UI overhaul, 4593765 → 43dd08c)**: NO emojis as UI chrome — monoline inline SVGs (lucide-style, `strokeWidth 2`); `lib/brandMark.tsx` is the single source of truth for the CP Monogram + Plug mark (nav logo, favicons, apple-icon, 192/512 maskables); primary CTAs are `rounded-full` pills; accent headlines are `font-serif-accent italic text-gold` (`gradient-text` class was deleted — do not reintroduce); cards on paper are `bg-white/90 backdrop-blur-sm border border-rule`; skeleton loaders (`app/components/Skeleton.tsx`, `skeleton-shimmer`/`-light`) everywhere — no pulsing-emoji loaders; semantic status pills keep their green/amber/red, WhatsApp buttons use `bg-whatsapp` tokens; empty states use the local voice ("No wahala, chale…") with a Wanted Board CTA.
- **Legacy grays** (`text-gray-*`, `bg-charcoal`) were migrated off dashboard/admin/seller/user pages; `admin/locations`, `admin/banners`, `admin/feedback` still hold some — finish when convenient.

## Price ranges (`max_price`) — 011c92f

- `listings.max_price` (nullable numeric). `price` = base/starting, required. Bundle listings derive their range from `listing_items` instead.
- `formatListingPrice(price, maxPrice)` in `lib/format.ts` → `GH₵ 2,500 – 4,500` (spaces around the dash); bundle helper `formatPriceRange` uses the compact `GH₵ 30–100` form.
- Wired into: `/new` form (optional dashed Max Price input, validated max > base, hidden for bundles), ListingCard pill, listing detail + share texts, services feed + wa.me links, booking page, dashboard, og metadata. `LandingPage` strips the column via its legacy-select fallback if the migration hasn't run.
- Types carrying it: `ListingCardData`, `ListingData`, `MyListing`, `Service`, book-page service, `SellerWithListings.listings`.

## Poster generator (`/admin/posters`)

- 4 templates: General / Wanted Board / Seller Recruitment / **Featured Listing** (listing picker: approved + not deleted/sold, newest first; auto-fills title/price-range/location/photo, QR retargets to `campuspluggh.com/listing/{id}`, editable badge tag e.g. "Level 100 Special").
- 4 formats: A4 794×1123, A5 559×794, **A6 mini 397×559** (scaled editorial layout: 2-up pillar grid, hall chips dropped, QR 140px w/ p-2.5 shell), Mobile Story 1080×1920 (preview = print-resolution canvas zoomed ~0.333 in a 9:16 shell; export clones at 540×960 + `pixelRatio: 2`).
- 4 themes (obsidian/paper/gold/legon) × 3 patterns; PNG/JPEG via `html-to-image`; posters must use plain `<img>` (NOT next/image) — html-to-image can't rasterize next/image. `sm:` variants inside the canvas resolve against the *viewport*, not canvas width — use `isMini`/`isStory` conditionals for per-format sizing (existing pattern).

## Durable gotchas

- **Route handlers**: `app/*/route.tsx` MUST export a real `GET` or typed-routes validation fails the build (metadata icons like `icon.tsx` use default exports instead).
- **OG pipeline**: satori rejects `wOF2` and crashes on `inline-flex`/`zIndex`; fonts are vendored WOFF in `public/fonts/og/` (Manrope 700 + DM Serif Display 400), fetched same-origin, failures never cached.
- **react-hooks v6 purity**: `Date.now()` is flagged even inside `useMemo` (render-phase code). Snapshot clocks once via lazy `useState(() => Date.now())`.
- **RLS recursion incident (42P17)**: never use `SELECT 1 FROM profiles WHERE id = auth.uid()` subqueries inside profiles policies — use `public.is_admin()` (SECURITY DEFINER) instead. See `docs/postmortem-profiles-rls-recursion.md`.
- **SQL-first**: run migrations in Supabase BEFORE pushing code that selects/inserts new columns.
- **14 category slugs only** (`lib/categories.ts`) — do not invent slugs; they're DB-persisted.
- **Vercel**: only one project remains (`campus-plug-oukb`, serves campuspluggh.com). Duplicate was removed.
- **`zoom` CSS**: used for story preview (not `transform`) so the export clone keeps layout.

## SQL migrations — all applied in production

Key files (all idempotent, safe to re-run): `add_categories.sql`, `add_campus_location.sql`, `add_favorites.sql`, `add_reviews_system.sql`, `add_sales_tracking.sql`, `add_bundles_and_multiphotos.sql`, `add_analytics_and_boosts.sql`, `add_soft_deletes.sql`, `add_sms_rate_limits.sql`, `harden_profiles_trigger_for_phone.sql`, `handle_new_user_trigger.sql`, `add_feedback.sql`, `add_notifications.sql`, `add_whatsapp_share_event_type.sql`, `add_funnel_outcomes_and_staleness.sql`, `fix_profiles_public_read.sql`, `add_max_price.sql`. Reference: `funnel_metrics_queries.sql` (7 read-only queries).

## Ground rules (DO NOT touch without permission)

- Auth (Supabase Auth config, session handling, RLS on `profiles`), Sentry, Vercel Analytics, Resend email, existing seller reviews system
- AGENTS.md, CLAUDE.md, HANDOFF.md, docs/
- SQL migrations (any migration file or DB change)
- No new npm packages unless asked
- RLS: `DROP POLICY IF EXISTS` + `CREATE POLICY`; order CREATE TABLE → ENABLE RLS → policies → indexes

## Validation before every ship

1. `npx tsc --noEmit` — 0 errors
2. `npx eslint` on touched files — 0 errors
3. `npm run build` — clean
4. For SQL: `node .sqlcheck/check.js <file>`

## Visual QA methodology

1. Temp dev-only QA page (e.g. `app/dev-poster-qa/page.tsx`).
2. `npm run dev > /tmp/campusplug-dev.log 2>&1 &` — read log for the port.
3. PID via `netstat -ano | grep :PORT | grep LISTEN`, then drive snapshot/screenshot/evaluate/resize.
4. Cleanup: delete QA page, kill PID; if tsc errors on stale `.next/dev/types`, `rm -rf .next/dev/types .next/types` and re-run.

## Recently shipped (2026-10 session)

- `43dd08c` batch 4: unified skeleton loaders, localized empty states, accent headline normalization
- `7c2d010` batch 3 + `8107b9f` batch 2: design-token migration off legacy grays (dashboard, admin, login, home, listing, forms)
- `4593765` batch 1: emoji→SVG icon sweep, BrandMark nav logo, pill-CTA enforcement
- `011c92f` price ranges (`max_price`) end-to-end
- `ee7ec63` poster listing picker + price ranges; `c189dac` A6 mini flyer; `d8802cc` A6 QR 140px
- `8127f5b` Switch Account; `465bdd8` NavBar shows `user_metadata.full_name` (phone sign-ups see their name, not blank)
- Supabase hygiene: FK cascades added (`profiles`/`listings`/`plug_requests`/`favorites` → `auth.users`) so dashboard user-deletion works; test accounts removed

## Next steps

1. **Owner action — replace the expired anon key in `.env.local`** (current `sb_publishable_…` 401s; local dev data-fetch broken until swapped).
2. **Owner action — run queries 1, 3, 7 from `supabase/funnel_metrics_queries.sql`** and fold real conversion numbers into `outreach/campus-outreach.md`.
3. Execute outreach Part 1: seller-recruitment posters (Featured Listing + Seller Recruitment templates at `/admin/posters`) + hall WhatsApp blasts — supply first, businesses second.
4. Finish legacy-gray cleanup on `admin/locations`, `admin/banners`, `admin/feedback`.
5. Consider full-repo `npx eslint .` audit (react-hooks v6 purity) — other components may call `Date.now()` during render.
6. Payment gate on boosts (MoMo) once sellers show demand — Paystack recommended.
7. Test scaffold (vitest on `lib/format`, `lib/categories`, phone formatting) still needs owner go-ahead — new dev dependency.
8. Mobile QA pass (360px) on follow-up panel + sold badges before the January semester push.
