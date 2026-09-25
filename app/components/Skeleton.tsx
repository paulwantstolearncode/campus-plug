/**
 * Reusable skeleton loading components.
 * Renders animated gray placeholders that match the layout of real content.
 * No JS dependencies — pure CSS shimmer sweep (.skeleton-shimmer* in
 * globals.css), which respects prefers-reduced-motion automatically.
 */

export function ListingCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#e4e1d8] bg-white">
      {/* Image placeholder */}
      <div className="aspect-[4/3] skeleton-shimmer-light" />

      {/* Text placeholders */}
      <div className="p-4 space-y-3">
        <div className="h-5 skeleton-shimmer-light rounded-lg w-3/4" />
        <div className="h-3 skeleton-shimmer-light rounded-lg w-1/2" />
        <div className="h-3 skeleton-shimmer-light rounded-lg w-2/3" />
        <div className="h-3 skeleton-shimmer-light rounded-lg w-1/3" />
        {/* Button placeholder */}
        <div className="h-10 skeleton-shimmer-light rounded-xl" />
      </div>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
      <div className="h-6 w-6 skeleton-shimmer-light rounded-lg mb-2" />
      <div className="h-8 skeleton-shimmer-light rounded-lg w-16 mb-1" />
      <div className="h-3 skeleton-shimmer-light rounded-lg w-24" />
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 skeleton-shimmer rounded-full w-48" />
      <div className="h-4 skeleton-shimmer rounded-full w-32" />
      <div className="h-12 skeleton-shimmer rounded-xl w-3/4" />
      <div className="h-12 skeleton-shimmer rounded-xl w-1/2" />
      <div className="h-5 skeleton-shimmer rounded-lg w-2/3" />
      <div className="h-14 skeleton-shimmer rounded-full w-48" />
    </div>
  )
}

export function DashboardListingSkeleton() {
  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
      <div className="h-40 skeleton-shimmer-light" />
      <div className="p-5 space-y-3">
        <div className="flex justify-between">
          <div className="h-3 skeleton-shimmer-light rounded w-16" />
          <div className="h-5 skeleton-shimmer-light rounded-full w-20" />
        </div>
        <div className="h-5 skeleton-shimmer-light rounded-lg w-3/4" />
        <div className="h-5 skeleton-shimmer-light rounded-lg w-1/3" />
        <div className="flex gap-2">
          <div className="h-10 skeleton-shimmer-light rounded-full flex-1" />
          <div className="h-10 skeleton-shimmer-light rounded-full flex-1" />
        </div>
      </div>
    </div>
  )
}
