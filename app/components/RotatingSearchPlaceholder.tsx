'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const SEARCH_PLACEHOLDERS = [
  'Search: past questions, hair braiding, PS5, gas refill, phone repair...',
  'Search: DCIT 201 tutoring, braiding, catering, laundry...',
  'Search: wireless earbuds, laptop stand, generator rental...',
  'Search: manicure, photography, graphic design, typing...',
]

export default function RotatingSearchPlaceholder() {
  const [index, setIndex] = useState(0)
  const router = useRouter()
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % SEARCH_PLACEHOLDERS.length)
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push('/services?q=' + encodeURIComponent(query.trim()))
    } else {
      router.push('/services')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={SEARCH_PLACEHOLDERS[index]}
        className="w-full px-5 py-4 pr-14 rounded-full bg-ink-soft/90 backdrop-blur border border-white/15 text-white text-sm font-medium placeholder:text-white/40 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 transition-all shadow-2xl"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gold-vivid text-ink flex items-center justify-center hover:bg-gold-light transition-colors shadow-md shadow-gold-glow"
        aria-label="Search"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </form>
  )
}
