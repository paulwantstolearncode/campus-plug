# Handoff — Campus Plug

Last updated: 2026-08-23

## Current state

- **Repo**: github.com/paulwantstolearncode/campus-plug (origin/main)
- **Live**: campuspluggh.com
- **Latest commit**: pending — Phone + Password auth + WhatsApp seller numbers
- **Working tree**: clean
- **Local preview**: port 56816 via `nohup npm run dev -- -p 56816`

## Recently shipped

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

### Phase A.4 Location Filtering
- Campus location filter chips added to `/services` page, allowing students to narrow listings by campus location.

### Instant Request Empty Search CTA
- Empty search results on `/services` now direct students to post on `/requests` (Wanted Board) instead of showing a dead end.

### Legacy Location Backfill Tool
- Admin page at `/admin/locations` with smart keyword auto-suggestions (`suggestLocation` in `lib/campusLocations.ts`) and bulk auto-assign capability. Fetches approved listings where `campus_location IS NULL` or empty, shows gold suggestion badges when title/description matches campus location keywords, and offers per-row save or one-click bulk auto-assign. Added `📍 Location Backfill` link to `/admin` dashboard header.

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
- AGENTS.md, CLAUDE.md, HANDOFF.md

## Validation before shipping

- `npx tsc --noEmit` — 0 errors
- `npx eslint` on touched files — 0 errors
- `npm run build` — clean
- For SQL files: `node .sqlcheck/check.js <file>`

## Project Strategy & Roadmap

### Strategic Decisions

- **Monetization Pause**: All payment/commission features (Paystack MoMo, paid featured listings, seller subscriptions) are on hold until Campus Plug reaches 100+ active users. Current priority is 100% focused on user growth, seller onboarding, and WhatsApp transaction volume at UG Legon.

## Next steps

1. (Done) Nav extracted to shared `app/components/NavBar.tsx`.