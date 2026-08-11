-- ============================================================================
-- Reviews System: verified-buyer reviews + seller responses + moderation
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run).
-- Idempotent: safe to re-run.
--
-- ⚠️  COPY FROM THE LOCAL FILE, NOT A RENDERED VIEW
--   Copying this from chat, the GitHub web view, or an email can merge or
--   truncate lines (this bit us twice before). Open the file locally, Ctrl+A,
--   copy, paste into the SQL editor. Before running, confirm each CREATE
--   block appears exactly ONCE.
--
-- Trust model (Decision 1): only users who completed a REAL transaction with
-- the seller can leave a review. Enforced by the verify_review_buyer trigger
-- at the database level, not just the UI (defense in depth).
--   * bookings path (services) : the reviewer must be the buyer_id of a
--     completed booking with this seller. Full identity — the strong path.
--   * sales path (products)    : sales store buyer_name/buyer_whatsapp as free
--     text (no buyer account today), so v1 accepts EITHER a linked account
--     (sales.buyer_id, additive column added below) OR the sale's
--     buyer_whatsapp matching the reviewer's profile whatsapp_number.
--     Documented limitation — see the comments inside verify_review_buyer().
--
-- Dependencies (run first on a fresh database):
--   * public.is_admin()            -> profiles_rls_policies.sql
--   * bookings.status column       -> add_sales_tracking.sql
--
-- Recursion safety: the trigger functions are SECURITY DEFINER with
-- search_path = public, so their internal reads of bookings/sales/profiles
-- bypass RLS entirely and cannot recurse. Every policy is a plain predicate
-- or an EXISTS subquery on a table whose own policies never query reviews.
--
-- No existing policy, table, or trigger is modified or dropped except the
-- ones this file itself creates (DROP IF EXISTS before each CREATE).
-- ============================================================================

-- Rollback (commented, in case things go wrong)
-- DROP TABLE IF EXISTS review_responses;
-- DROP TABLE IF EXISTS reviews;
-- ALTER TABLE sales DROP COLUMN IF EXISTS buyer_id;
-- DROP VIEW IF EXISTS public.seller_ratings;
-- DROP FUNCTION IF EXISTS public.verify_review_buyer();
-- DROP FUNCTION IF EXISTS public.enforce_review_update_rules();
-- DROP FUNCTION IF EXISTS public.enforce_response_edit_window();
-- DROP FUNCTION IF EXISTS public.set_updated_at();

-- ── 1. Additive: link product sales to a buyer account (nullable) ───────────
--    sales.buyer_id is the durable fix for verifying product-sale reviews.
--    v1 records sales with free-text buyer info, so the column stays NULL for
--    now; the trigger falls back to a whatsapp match. Nothing about the
--    existing sales flow changes (additive column + index only).
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_buyer_idx ON sales(buyer_id);

-- ── 2. Reviews table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Verification anchor: exactly one is set at insert time (enforced by the
  -- verify_review_buyer trigger; the CHECK below only guarantees at most one).
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,

  -- Content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT CHECK (char_length(review_text) <= 500),

  -- Moderation
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flagged_reason TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One review per booking / per sale (prevents duplicates). If the anchor is
  -- later deleted the FK becomes NULL and uniqueness stops binding — the
  -- review is historical, that is acceptable.
  CONSTRAINT one_review_per_booking UNIQUE (booking_id, reviewer_id),
  CONSTRAINT one_review_per_sale UNIQUE (sale_id, reviewer_id),

  -- At most ONE transaction reference. NOTE: deliberately NOT "exactly one"
  -- (the draft's strict OR check) — ON DELETE SET NULL would then violate the
  -- CHECK and make booking/sale deletion fail with 23514. The trigger enforces
  -- "exactly one" on insert; this CHECK only forbids referencing both.
  CONSTRAINT review_has_transaction CHECK (
    NOT (booking_id IS NOT NULL AND sale_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS reviews_seller_idx ON reviews(seller_id);
CREATE INDEX IF NOT EXISTS reviews_reviewer_idx ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS reviews_created_idx ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_flagged_idx ON reviews(is_flagged)
  WHERE is_flagged = true;

-- ── 3. Seller responses table (one public reply per review) ─────────────────
CREATE TABLE IF NOT EXISTS review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE NOT NULL UNIQUE,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  response_text TEXT NOT NULL CHECK (char_length(response_text) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- (review_id UNIQUE already creates the backing index; no extra one needed.)

-- ── 4. updated_at maintenance ───────────────────────────────────────────────
--    Creates public.set_updated_at() if absent; CREATE OR REPLACE keeps the
--    file idempotent. (Body is trivial; safe even if prod somehow already
--    had one with the same semantics.)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_reviews_updated_at ON reviews;
CREATE TRIGGER set_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_review_responses_updated_at ON review_responses;
CREATE TRIGGER set_review_responses_updated_at
BEFORE UPDATE ON review_responses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. Trigger: verified-buyer rule at the DB level (INSERT) ────────────────
CREATE OR REPLACE FUNCTION public.verify_review_buyer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_verified_buyer BOOLEAN := false;
BEGIN
  -- Trusted contexts: admins, and non-JWT sessions (SQL editor / migrations).
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Sellers cannot review themselves.
  IF NEW.reviewer_id = NEW.seller_id THEN
    RAISE EXCEPTION 'Sellers cannot review themselves';
  END IF;

  -- New reviews always start visible and un-flagged; moderation happens later.
  NEW.is_flagged := false;
  NEW.is_hidden := false;
  NEW.flagged_reason := NULL;

  -- Exactly one transaction anchor is required.
  IF (NEW.booking_id IS NOT NULL) = (NEW.sale_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A review must reference exactly one booking or sale';
  END IF;

  -- Booking path (services): reviewer must be the buyer of a completed
  -- booking with this seller. Full identity — the strong path.
  IF NEW.booking_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = NEW.booking_id
        AND buyer_id = NEW.reviewer_id
        AND seller_id = NEW.seller_id
        AND status = 'completed'
    ) INTO is_verified_buyer;

    IF NOT is_verified_buyer THEN
      RAISE EXCEPTION 'Only the buyer of a completed booking can review this seller';
    END IF;

    RETURN NEW;
  END IF;

  -- Sale path (products): sales record the buyer as free text, so accept
  -- EITHER a linked buyer account (sales.buyer_id, column added above) OR
  -- the sale's buyer_whatsapp matching the reviewer's profile
  -- whatsapp_number. Limitation: a sale with neither is unverifiable and the
  -- review is rejected — sellers should capture the buyer's WhatsApp when
  -- recording the sale. The app layer additionally only surfaces sales that
  -- plausibly belong to the logged-in user.
  SELECT EXISTS (
    SELECT 1 FROM public.sales s
    LEFT JOIN public.profiles p ON p.id = NEW.reviewer_id
    WHERE s.id = NEW.sale_id
      AND s.seller_id = NEW.seller_id
      AND s.status = 'completed'
      AND (
        s.buyer_id = NEW.reviewer_id
        OR (
          s.buyer_whatsapp IS NOT NULL
          AND p.whatsapp_number IS NOT NULL
          AND s.buyer_whatsapp = p.whatsapp_number
        )
      )
  ) INTO is_verified_buyer;

  IF NOT is_verified_buyer THEN
    RAISE EXCEPTION 'Only the buyer of a completed sale can review this seller';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verify_review_buyer ON reviews;
CREATE TRIGGER verify_review_buyer
BEFORE INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION public.verify_review_buyer();

-- ── 6. Trigger: role-scoped UPDATE rules (edit windows + column locks) ──────
--    One trigger for everything an UPDATE may do:
--      * reviewer : may change rating / review_text, only within 7 days
--      * seller   : may ONLY flag (is_flagged false->true + flagged_reason);
--                   cannot edit content, cannot hide, cannot un-flag
--      * admins   : anything (hide / delete / dismiss flag from admin panel)
--    Without the column locks, the "Sellers can flag" UPDATE policy would let
--    a seller rewrite any review about them OR set is_hidden = true on their
--    1-star reviews (removing them from public view). This closes that hole
--    the same way prevent_profile_escalation closes the profiles one.
CREATE OR REPLACE FUNCTION public.enforce_review_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted contexts: admins / SQL editor can do anything.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Reviewer editing their own review.
  IF auth.uid() = NEW.reviewer_id THEN
    -- Content edits are gated by the 7-day window (Decision 5).
    IF (NEW.rating IS DISTINCT FROM OLD.rating
        OR NEW.review_text IS DISTINCT FROM OLD.review_text)
       AND OLD.created_at < NOW() - INTERVAL '7 days' THEN
      RAISE EXCEPTION 'Review edit window (7 days) has expired';
    END IF;

    -- Everything except rating / review_text is locked for reviewers.
    IF NEW.is_flagged IS DISTINCT FROM OLD.is_flagged
       OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden
       OR NEW.flagged_reason IS DISTINCT FROM OLD.flagged_reason
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
       OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
      RAISE EXCEPTION 'Only the rating and review text can be edited';
    END IF;

    RETURN NEW;
  END IF;

  -- Seller flagging a review about them.
  IF auth.uid() = NEW.seller_id THEN
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.review_text IS DISTINCT FROM OLD.review_text
       OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
       OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
      RAISE EXCEPTION 'Sellers can only flag reviews, not edit them';
    END IF;

    IF NEW.is_flagged AND OLD.is_flagged THEN
      RAISE EXCEPTION 'This review is already flagged';
    END IF;

    IF NOT NEW.is_flagged AND OLD.is_flagged THEN
      RAISE EXCEPTION 'Only admins can dismiss a flag';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You do not have permission to update this review';
END;
$$;

DROP TRIGGER IF EXISTS enforce_review_update_rules ON reviews;
CREATE TRIGGER enforce_review_update_rules
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION public.enforce_review_update_rules();

-- ── 7. Trigger: seller response 24h edit window (Decision 5) ────────────────
CREATE OR REPLACE FUNCTION public.enforce_response_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.seller_id THEN
    IF NEW.response_text IS DISTINCT FROM OLD.response_text
       AND OLD.created_at < NOW() - INTERVAL '24 hours' THEN
      RAISE EXCEPTION 'Response edit window (24 hours) has expired';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the seller who owns this response can edit it';
END;
$$;

DROP TRIGGER IF EXISTS enforce_response_edit_window ON review_responses;
CREATE TRIGGER enforce_response_edit_window
BEFORE UPDATE ON review_responses
FOR EACH ROW EXECUTE FUNCTION public.enforce_response_edit_window();

-- ── 8. RLS: reviews ─────────────────────────────────────────────────────────
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: public sees visible reviews; reviewer + admins see everything.
DROP POLICY IF EXISTS "Anyone can view visible reviews" ON public.reviews;
CREATE POLICY "Anyone can view visible reviews"
ON public.reviews FOR SELECT
TO authenticated, anon
USING (is_hidden = false OR reviewer_id = auth.uid() OR public.is_admin());

-- INSERT: must be the reviewer themself; real verification happens in the
-- verify_review_buyer trigger above.
DROP POLICY IF EXISTS "Users insert own reviews" ON public.reviews;
CREATE POLICY "Users insert own reviews"
ON public.reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reviewer_id);

-- UPDATE: reviewer edits own, sellers flag reviews about them, admins all.
-- Column-level restrictions live in enforce_review_update_rules (see section
-- 6) so these policies stay simple own-row predicates.
DROP POLICY IF EXISTS "Reviewers update own reviews" ON public.reviews;
CREATE POLICY "Reviewers update own reviews"
ON public.reviews FOR UPDATE
TO authenticated
USING (auth.uid() = reviewer_id)
WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Sellers can flag reviews about them" ON public.reviews;
CREATE POLICY "Sellers can flag reviews about them"
ON public.reviews FOR UPDATE
TO authenticated
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins can update all reviews" ON public.reviews;
CREATE POLICY "Admins can update all reviews"
ON public.reviews FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- DELETE: reviewer deletes own (anytime, per Decision 5); admin deletes any.
DROP POLICY IF EXISTS "Reviewers delete own reviews" ON public.reviews;
CREATE POLICY "Reviewers delete own reviews"
ON public.reviews FOR DELETE
TO authenticated
USING (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Admins delete any review" ON public.reviews;
CREATE POLICY "Admins delete any review"
ON public.reviews FOR DELETE
TO authenticated
USING (public.is_admin());

-- ── 9. RLS: review_responses ────────────────────────────────────────────────
ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view responses" ON public.review_responses;
CREATE POLICY "Anyone can view responses"
ON public.review_responses FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Sellers respond to own reviews" ON public.review_responses;
CREATE POLICY "Sellers respond to own reviews"
ON public.review_responses FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = seller_id
  AND EXISTS (
    SELECT 1 FROM public.reviews
    WHERE reviews.id = review_responses.review_id
      AND reviews.seller_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Sellers update own responses" ON public.review_responses;
CREATE POLICY "Sellers update own responses"
ON public.review_responses FOR UPDATE
TO authenticated
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Sellers delete own responses" ON public.review_responses;
CREATE POLICY "Sellers delete own responses"
ON public.review_responses FOR DELETE
TO authenticated
USING (auth.uid() = seller_id);

-- ── 10. View: aggregated seller ratings (badges + public display) ───────────
CREATE OR REPLACE VIEW public.seller_ratings AS
SELECT
  seller_id,
  COUNT(*) AS review_count,
  ROUND(AVG(rating)::numeric, 2) AS average_rating,
  COUNT(*) FILTER (WHERE rating = 5) AS five_star,
  COUNT(*) FILTER (WHERE rating = 4) AS four_star,
  COUNT(*) FILTER (WHERE rating = 3) AS three_star,
  COUNT(*) FILTER (WHERE rating = 2) AS two_star,
  COUNT(*) FILTER (WHERE rating = 1) AS one_star,
  (COUNT(*) >= 10 AND AVG(rating) >= 4.8) AS is_top_rated
FROM public.reviews
WHERE is_hidden = false
GROUP BY seller_id;

GRANT SELECT ON public.seller_ratings TO anon, authenticated;

-- ── 11. Verify ──────────────────────────────────────────────────────────────
-- Policies (expect 6 on reviews, 4 on review_responses):
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reviews', 'review_responses')
ORDER BY tablename, cmd, policyname;

-- Triggers (expect 3 on reviews, 2 on review_responses):
SELECT tgname, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgrelid IN ('public.reviews'::regclass, 'public.review_responses'::regclass)
  AND NOT tgisinternal
ORDER BY tgrelid::regclass::text, tgname;

-- Sanity: sales.buyer_id column present (expect buyer_id in the list):
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales'
ORDER BY ordinal_position;
