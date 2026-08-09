// Shared helpers for the sales tracking system.

// Sellers may edit amounts/items/notes on a sale within this window of
// created_at (Decision 3). Status changes (refund/cancel) stay available
// forever, so this check gates ONLY the editable fields.
export const SALE_EDIT_WINDOW_HOURS = 24

export function isWithinEditWindow(
  createdAt: string | null | undefined,
  hours = SALE_EDIT_WINDOW_HOURS
): boolean {
  if (!createdAt) return false
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return Date.now() - created < hours * 60 * 60 * 1000
}

// en-GB date + time, e.g. "6 Aug 2026, 14:23". Falls back to the raw string
// when the value isn't a parseable date.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
