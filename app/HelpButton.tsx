'use client'
import { useState, useEffect, useRef } from 'react'

const SUPPORT_WHATSAPP = '233202388411' // ⚠️ REPLACE with YOUR WhatsApp number

const FAQS = [
  {
    icon: '🛒',
    question: 'How do I book a service?',
    answer: 'Click any service, pick your date and time, then confirm. You\'ll be redirected to WhatsApp to chat directly with the seller and arrange payment.',
  },
  {
    icon: '💰',
    question: 'How do payments work?',
    answer: 'For now, buyers and sellers arrange payment directly via WhatsApp (MoMo, cash, bank transfer). We\'re working on secure in-app payments coming soon!',
  },
  {
    icon: '🚀',
    question: 'How do I become a seller?',
    answer: 'Click "Sell" in the top nav, enter your WhatsApp number, and submit. We personally verify every seller within 24 hours to keep Campus Plug premium.',
  },
  {
    icon: '📸',
    question: 'How do I post a listing?',
    answer: 'Once you\'re a verified seller, click "+ Post" in the nav. Add a title, price, photo, and description. We\'ll review and approve within a few hours.',
  },
  {
    icon: '🛡️',
    question: 'Is Campus Plug safe?',
    answer: 'Yes! Every seller is manually verified by us. Every listing is reviewed before going live. If you have any issues, message us on WhatsApp anytime.',
  },
  {
    icon: '💬',
    question: 'How do I contact a seller?',
    answer: 'Click the "💬 Message" button on any listing. It opens WhatsApp with a pre-written message you can customize before sending.',
  },
  {
    icon: '❌',
    question: 'How do I delete my listing?',
    answer: 'Go to the homepage while logged in. Your listings will have a red trash icon next to the Edit button. Click it and confirm to delete.',
  },
  {
    icon: '⏱️',
    question: 'Why isn\'t my listing showing?',
    answer: 'New listings go through a quick review (usually under an hour) to ensure quality. You\'ll see it live as soon as we approve it. Message us if it\'s been over 6 hours.',
  },
]

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on Escape and lock background scroll while the modal is open (it is
  // a bottom sheet on mobile, so without this the page scrolls behind it).
  useEffect(() => {
    if (!isOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog so aria-modal=true is honest (otherwise focus
    // stays on the trigger behind the modal).
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      'Hi Campus Plug! 👋\n\nI need help with...'
    )
    window.open('https://wa.me/' + SUPPORT_WHATSAPP + '?text=' + message, '_blank')
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-br from-gold to-gold-dark text-charcoal rounded-full shadow-2xl shadow-gold/50 hover:scale-110 transition-transform flex items-center justify-center text-2xl font-bold group"
        aria-label="Need help?"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {/* The glyph needs a stacking context (relative z-10) or the
            animate-ping ring below paints over it every cycle. */}
        <span className="relative z-10 group-hover:rotate-12 transition-transform">?</span>

        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-gold/40 animate-ping"></span>
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsOpen(false)}
        >
          {/* Modal Content */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Campus Plug help"
            tabIndex={-1}
            className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative animated-gradient p-6 pb-8 overflow-hidden">
              <div className="blob absolute -top-10 -right-10 w-40 h-40 bg-gold/40 rounded-full blur-3xl"></div>

              <div className="relative flex items-start justify-between">
                <div>
                  <div className="text-3xl mb-2">👋</div>
                  <h2 className="text-2xl font-bold text-white">How can we help?</h2>
                  <p className="text-white/70 text-sm mt-1">Real answers. Real fast.</p>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/70 hover:text-white p-2 -mr-2"
                  aria-label="Close"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* FAQ List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2 mb-3">
                Quick Answers
              </p>

              {FAQS.map((faq, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100"
                >
                  <button
                    onClick={() => setOpenFAQ(openFAQ === idx ? null : idx)}
                    aria-expanded={openFAQ === idx}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{faq.icon}</span>
                      <span className="font-semibold text-charcoal text-sm">{faq.question}</span>
                    </div>
                    <span className={"text-gray-400 transition-transform " + (openFAQ === idx ? 'rotate-180' : '')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </span>
                  </button>

                  {openFAQ === idx && (
                    <div className="px-4 pb-4 pt-1">
                      <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* WhatsApp CTA */}
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 text-center mb-3">
                Still need help? Talk to a real human 👇
              </p>
              <button
                onClick={handleWhatsAppClick}
                className="w-full flex items-center justify-center gap-2 bg-green-500 text-white py-3 rounded-full font-bold hover:bg-green-600 transition-all hover:scale-[1.02] shadow-lg"
              >
                <span>💬</span>
                Message us on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}