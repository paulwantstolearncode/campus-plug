'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import FeedbackModal from './FeedbackModal'

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      setIsLoggedIn(!!user)
    }
    checkAuth()
  }, [])

  if (!isLoggedIn) return null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-20 z-40 bg-gold text-charcoal rounded-full shadow-2xl shadow-gold/40 hover:scale-110 transition-all flex items-center gap-2 pl-4 pr-5 py-3 font-semibold text-sm group"
        aria-label="Send feedback"
      >
        {/* Chat bubble icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-12 transition-transform">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <FeedbackModal key={isOpen ? 'open' : 'closed'} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
