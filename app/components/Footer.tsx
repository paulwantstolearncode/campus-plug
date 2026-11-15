'use client'

import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'

/**
 * Shared site footer — used by the landing page, privacy and terms pages so
 * the bottom of the site is maintained in one place. Category links double
 * as SEO crawl paths and quick navigation for logged-out visitors.
 */
export default function Footer() {
  const serviceCategories = CATEGORIES.filter((c) => c.type === 'service')
  const productCategories = CATEGORIES.filter((c) => c.type === 'product')

  return (
    <footer className="bg-charcoal text-white py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
              <span className="text-xl font-bold">Campus Plug</span>
            </Link>
            <p className="text-sm text-white/60 text-center md:text-left">
              Made with <span className="text-gold">💛</span> in Ghana for UG students
            </p>
          </div>

          {/* Category quick links — two columns, grouped by type */}
          <div className="grid grid-cols-2 gap-6 md:gap-10 text-sm text-white/60">
            <div>
              <p className="font-semibold text-white mb-3 uppercase tracking-wider text-[10px]">Services</p>
              <ul className="space-y-2">
                {serviceCategories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/services?category=${c.slug}`}
                      className="hover:text-gold transition-colors"
                    >
                      {c.emoji} {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-3 uppercase tracking-wider text-[10px]">Products</p>
              <ul className="space-y-2">
                {productCategories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/services?category=${c.slug}`}
                      className="hover:text-gold transition-colors"
                    >
                      {c.emoji} {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Link
              href="/become-seller"
              className="bg-gold text-charcoal px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-gold-dark transition-all hover:scale-105 shadow-lg shadow-gold/30"
            >
              Sell on Campus Plug
            </Link>
            <div className="flex gap-6 text-sm">
              <Link href="/requests" className="text-white/60 hover:text-gold transition-colors">
                Wanted Board
              </Link>
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Login
              </Link>
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Sign up
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-white/10 text-center text-xs text-white/40">
          © 2026 Campus Plug. All rights reserved.
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-gold transition-colors">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-gold transition-colors">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  )
}
