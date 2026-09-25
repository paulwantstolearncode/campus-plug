import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-charcoal flex items-center justify-center animated-gradient px-4">
      <div className="text-center max-w-lg">
        <div className="text-7xl mb-6">🔌</div>
        <p className="eyebrow text-gold mb-4">404</p>
        <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
          Page not found
        </h1>
        <p className="font-serif-accent text-lg md:text-xl text-gold mb-8">
          Lost on campus? This page doesn&apos;t exist, chale.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-gold text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold-dark transition-all hover:scale-105 shadow-xl group"
        >
          Back to the marketplace
          <span className="group-hover:translate-x-1 transition-transform">→</span>
        </Link>
      </div>
    </main>
  )
}
