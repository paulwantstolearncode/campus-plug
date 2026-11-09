'use client'
import { useState } from 'react'
import FeedbackModal from './FeedbackModal'

export default function FeedbackToggle() {
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setFeedbackOpen(true)}
        className="text-white/60 hover:text-gold transition-colors"
      >
        Send feedback
      </button>
      <FeedbackModal
        key={feedbackOpen ? 'open' : 'closed'}
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  )
}
