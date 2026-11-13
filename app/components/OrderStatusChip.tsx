'use client'

import { orderStatusLabel } from '@/lib/orders'

interface OrderStatusChipProps {
  status: string
  className?: string
}

/**
 * Single source of truth for order status pill styling.
 * Keeps the color map in one place so "paid" can't drift amber here and
 * blue there across the dashboard, orders list, and order detail.
 *
 * Semantic language (consistent with bookingStatusChip / saleStatusChip):
 *   green  = done (complete)
 *   amber  = in progress (confirmed, paid, preparing)
 *   indigo = in transit (shipped, delivered)
 *   red    = terminal negative (cancelled)
 */
const variants: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-700 border border-blue-200',
  paid: 'bg-amber-100 text-amber-700 border border-amber-200',
  preparing: 'bg-amber-100 text-amber-700 border border-amber-200',
  shipped: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  delivered: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  complete: 'bg-green-100 text-green-700 border border-green-200',
  cancelled: 'bg-red-100 text-red-700 border border-red-200',
}

export function OrderStatusChip({ status, className }: OrderStatusChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
        variants[status] || 'bg-ink-muted/10 text-ink-muted border-rule'
      } ${className || ''}`}
    >
      {orderStatusLabel(status)}
    </span>
  )
}
