# Order/payment migration run order

This is the authoritative run order for the Campus Plug order, payment, escrow,
dispute, service-booking, and order-review migration chain. It is not a complete
fresh-database bootstrap for unrelated features.

## Prerequisites

The base marketplace schema must already exist, including listings,
profiles/`public.is_admin()`, notification preferences and push delivery,
bookings, sales, and reviews. In particular, the review/order-notification
portion of this chain assumes the existing `add_reviews_system.sql`,
`add_sales_tracking.sql`, `add_booking_notifications.sql`,
`add_notification_preferences.sql`, and `add_push_user_id.sql` work has already
been applied in its own dependency order.

## Safety rules

1. **SQL first:** apply the required SQL before deploying application code that
   depends on it.
2. Use a maintenance window. Do not allow application writes or the
   `order-auto-release` cron job to run between steps.
3. The timer migration schedules its hourly job in section 2. If the job cannot
   be paused for the whole chain, omit that scheduling section during step 7
   and run only that section after step 17.
4. Apply only missing migrations on an existing database. When replaying this
   compatibility chain, preserve the relative order below.
5. Never run an older order-transition, payment, dispute-resolution, escrow,
   timer, or service-booking migration after step 17.
6. **`lockdown_order_payment_state.sql` MUST RUN LAST.** It is the final
   authority for order statuses, `create_product_order()`,
   `create_service_order()`, `advance_order()`, `record_payment()`,
   `open_order_dispute()`, `resolve_dispute()`, payment privileges, and linked
   booking synchronization.

## Exact sequence

| Step | Apply this file | Purpose / supersession rule |
| ---: | --- | --- |
| 1 | `supabase/add_orders.sql` | Creates the base orders and order-event schema. Its legacy transition definition is superseded below. |
| 2 | `supabase/add_order_notification.sql` | Installs order notification triggers. |
| 3 | `supabase/add_marketplace_disputes.sql` | Creates disputes and dispute messages. |
| 4 | `supabase/add_dispute_lock.sql` | Adds the early open-dispute transition guard; later superseded. |
| 5 | `supabase/add_marketplace_payments.sql` | Creates payment records and the base payment RPCs. |
| 6 | `supabase/add_escrow_release_on_complete.sql` | Installs the canonical `confirmed` escrow trigger. The historical filename/function name is retained for compatibility. |
| 7 | `supabase/add_auto_release_timer.sql` | Installs the base stale-order auto-release function and optional cron schedule. |
| 8 | `supabase/add_seller_wallets.sql` | Adds wallet/disbursement ledgers and supersedes the escrow functions with canonical `confirmed` ledger writes. |
| 9 | `supabase/add_resolve_dispute.sql` | Installs the base dispute-resolution RPC. |
| 10 | `supabase/add_refund_audit.sql` | Creates the refund audit table. |
| 11 | `supabase/add_partial_refund_amount.sql` | Adds partial-refund amounts; do not run after step 12. |
| 12 | `supabase/add_refund_audit_to_resolve_dispute.sql` | Combines partial refunds with refund auditing; later superseded. |
| 13 | `supabase/add_momo_payment_intents.sql` | Adds MoMo intent metadata and the refund-settlement lifecycle; later superseded by the lockdown. |
| 14 | `supabase/add_review_order_anchor.sql` | Adds the order anchor used by verified reviews. |
| 15 | `supabase/add_order_completion_notification.sql` | Installs booking/sale completion notification dependencies. |
| 16 | `supabase/add_service_booking_orders.sql` | Adds service scheduling, canonical booking projection, appointment-aware auto-release, and canonical order-review verification. |
| 17 | `supabase/lockdown_order_payment_state.sql` | **MUST RUN LAST.** Rewrites legacy statuses and installs the final canonical, locked-down order/payment functions. |

## Post-migration verification — not a migration

After step 17, run:

```text
supabase/verify/order_write_lockdown.sql
```

Expected notice:

```text
PASS: all 9 authenticated direct writes were rejected
```

The verification block rolls back its fixtures. It is a post-migration test and
does not change the rule that step 17 is the last schema migration.

Only after the live regression passes should application writes and the
`order-auto-release` cron job be resumed.

18. post_lockdown_privilege_hardening.sql (LAST — already applied to production manually; do not re-run)
