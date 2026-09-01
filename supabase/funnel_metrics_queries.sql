-- ============================================================
-- Funnel Metrics Queries
-- Campus Plug — Sep 2026
--
-- Reference queries for funnel analytics. Run in Supabase SQL Editor.
-- ============================================================

-- WhatsApp click → outcome conversion funnel
SELECT
  outcome,
  COUNT(*) as count
FROM public.analytics_events
WHERE event_type = 'whatsapp_outcome'
  AND created_at > now() - interval '30 days'
GROUP BY outcome
ORDER BY count DESC;

-- Listings by sold status
SELECT
  CASE
    WHEN sold_at IS NOT NULL THEN 'sold'
    WHEN public.is_stale(last_activity_at OR created_at) THEN 'stale'
    ELSE 'active'
  END as status,
  COUNT(*) as count
FROM public.listings
WHERE approval_status = 'approved'
  AND deleted_at IS NULL
GROUP BY status;

-- Seller funnel: views → clicks → outcomes
SELECT
  l.id,
  l.title,
  l.view_count,
  l.whatsapp_click_count,
  l.sold_at,
  l.last_activity_at,
  CASE
    WHEN l.view_count > 0
    THEN ROUND((l.whatsapp_click_count::numeric / l.view_count) * 100, 1)
    ELSE 0
  END as click_rate_pct,
  (SELECT COUNT(*)
   FROM public.analytics_events ae
   WHERE ae.listing_id = l.id
     AND ae.event_type = 'whatsapp_outcome'
     AND ae.metadata->>'outcome' = 'sold'
  ) as sold_outcomes
FROM public.listings l
WHERE l.approval_status = 'approved'
  AND l.deleted_at IS NULL
  AND l.whatsapp_click_count > 0
ORDER BY l.whatsapp_click_count DESC
LIMIT 50;
