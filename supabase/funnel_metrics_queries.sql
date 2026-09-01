-- ============================================================================
-- Funnel & outcome metrics (READ-ONLY — run any time in the SQL editor)
-- ----------------------------------------------------------------------------
-- Run as admin/postgres in the Supabase SQL editor. No writes, no DDL — safe
-- to run repeatedly. These answer:
--   1. Weekly funnel: listing views -> WhatsApp clicks -> outcomes -> sold
--   2. Weekly signups / listings created / approved (supply vs demand)
--   3. What actually happens AFTER a WhatsApp click (outcome mix by source)
--   4. Conversion by listing (clicks vs sold outcomes) — boost pricing input
--   5. Boosted vs non-boosted performance — boost pricing input
--   6. Stale listings (candidates for the "still available?" nudge)
--   7. Recorded sales (bottom of the funnel, from the sales table)
-- ============================================================================

-- 1) Weekly funnel (last 12 weeks) -------------------------------------------
select
  date_trunc('week', created_at)::date as week,
  count(*) filter (where event_type = 'listing_view')     as listing_views,
  count(*) filter (where event_type = 'whatsapp_click')   as whatsapp_clicks,
  count(*) filter (where event_type = 'whatsapp_outcome') as outcomes,
  count(*) filter (
    where event_type = 'whatsapp_outcome' and metadata->>'outcome' = 'sold'
  ) as sold
from public.analytics_events
group by 1
order by 1 desc
limit 12;

-- 2) Weekly supply + demand (last 12 weeks) ----------------------------------
with signups as (
  select date_trunc('week', created_at)::date as week, count(*) as n
  from auth.users
  group by 1
),
listings_created as (
  select date_trunc('week', created_at)::date as week, count(*) as n
  from public.listings
  group by 1
),
listings_approved as (
  select date_trunc('week', created_at)::date as week, count(*) as n
  from public.listings
  where approval_status = 'approved'
  group by 1
)
select
  coalesce(s.week, l.week, a.week) as week,
  coalesce(s.n, 0) as signups,
  coalesce(l.n, 0) as listings_created,
  coalesce(a.n, 0) as listings_approved
from signups s
full join listings_created l  on l.week = s.week
full join listings_approved a on a.week = l.week
order by 1 desc
limit 12;

-- 3) Outcome mix after WhatsApp clicks (last 30 days) -------------------------
select
  metadata->>'outcome' as outcome,
  metadata->>'source'  as source,
  count(*) as events
from public.analytics_events
where event_type = 'whatsapp_outcome'
  and created_at > now() - interval '30 days'
group by 1, 2
order by 3 desc;

-- 4) Conversion by listing: clicks vs sold outcomes (last 30 days) ------------
select
  l.id,
  l.title,
  l.category,
  count(e.*) filter (where e.event_type = 'whatsapp_click') as clicks,
  count(e.*) filter (
    where e.event_type = 'whatsapp_outcome' and e.metadata->>'outcome' = 'sold'
  ) as sold
from public.listings l
left join public.analytics_events e on e.listing_id = l.id
where l.deleted_at is null
group by l.id
having count(e.*) filter (where e.event_type = 'whatsapp_click') > 0
order by sold desc, clicks desc
limit 25;

-- 5) Boosted vs non-boosted (last 30 days of events) --------------------------
-- Where boosted_until is NULL (legacy rows), treat as not boosted.
select
  case when l.boosted_until > now() then 'boosted' else 'not_boosted' end as boost_status,
  count(distinct l.id) as listings,
  count(e.*) filter (where e.event_type = 'listing_view')     as listing_views,
  count(e.*) filter (where e.event_type = 'whatsapp_click')   as whatsapp_clicks,
  count(e.*) filter (
    where e.event_type = 'whatsapp_outcome' and e.metadata->>'outcome' = 'sold'
  ) as sold
from public.listings l
left join public.analytics_events e
  on e.listing_id = l.id and e.created_at > now() - interval '30 days'
where l.deleted_at is null
group by 1;

-- 6) Stale listings (idle 30+ days, still live) -------------------------------
select
  id, title, category, created_at, last_activity_at,
  view_count, whatsapp_click_count
from public.listings
where deleted_at is null
  and sold_at is null
  and last_activity_at < now() - interval '30 days'
order by last_activity_at
limit 50;

-- 7) Recorded sales (closed deals, last 12 weeks) -----------------------------
select
  date_trunc('week', created_at)::date as week,
  count(*) as sales,
  sum(total_amount) as ghs_total
from public.sales
group by 1
order by 1 desc
limit 12;
