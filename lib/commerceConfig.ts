// Shared marketplace economics. Keep SQL commission calculations in sync with
// COMMISSION_RATE when this value changes.
export const COMMISSION_RATE = 0.08
export const DELIVERY_FEE_GHS = 15
export const HIGH_TICKET_THRESHOLD = 1000

/** Platform commission, rounded to two decimals like record_payment() in SQL. */
export function commission(amount: number | string | null | undefined): number {
  const value = Number(amount || 0)
  return Math.round(value * COMMISSION_RATE * 100) / 100
}
