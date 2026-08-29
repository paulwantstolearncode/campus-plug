/**
 * Reusable skeleton loading components.
 * Renders animated gray placeholders that match the layout of real content.
 * No JS dependencies — pure CSS animation via Tailwind's `animate-pulse`.
 */

export function ListingCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#e4e1d8] bg-white">
      {/* Image placeholder */}
      <div className="aspect-[4/3] bg-[#efece4] animate-pulse" />

      {/* Text placeholders */}
      <div className="p-4 space-y-3">
        <div className="h-5 bg-[#efece4] rounded-lg w-3/4 animate-pulse" />
        <div className="h-3 bg-[#efece4] rounded-lg w-1/2 animate-pulse" />
        <div className="h-3 bg-[#efece4] rounded-lg w-2/3 animate-pulse" />
        <div className="h-3 bg-[#efece4] rounded-lg w-1/3 animate-pulse" />
        {/* Button placeholder */}
        <div className="h-10 bg-[#efece4] rounded-xl animate-pulse" />
      </div>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
      <div className="h-6 w-6 bg-[#efece4] rounded-lg mb-2 animate-pulse" />
      <div className="h-8 bg-[#efece4] rounded-lg w-16 mb-1 animate-pulse" />
      <div className="h-3 bg-[#efece4] rounded-lg w-24 animate-pulse" />
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-white/10 rounded-full w-48" />
      <div className="h-4 bg-white/10 rounded-full w-32" />
      <div className="h-12 bg-white/10 rounded-xl w-3/4" />
      <div className="h-12 bg-white/10 rounded-xl w-1/2" />
      <div className="h-5 bg-white/10 rounded-lg w-2/3" />
      <div className="h-14 bg-white/10 rounded-full w-48" />
    </div>
  )
}

export function DashboardListingSkeleton() {
  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
      <div className="h-40 bg-[#efece4] animate-pulse" />
      <div className="p-5 space-y-3">
        <div className="flex justify-between">
          <div className="h-3 bg-[#efece4] rounded w-16 animate-pulse" />
          <div className="h-5 bg-[#efece4] rounded-full w-20 animate-pulse" />
        </div>
        <div className="h-5 bg-[#efece4] rounded-lg w-3/4 animate-pulse" />
        <div className="h-5 bg-[#efece4] rounded-lg w-1/3 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 bg-[#efece4] rounded-full flex-1 animate-pulse" />
          <div className="h-10 bg-[#efece4] rounded-full flex-1 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
