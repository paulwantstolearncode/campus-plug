'use client'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'campus-plug-pwa-dismissed'

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showIOS, setShowIOS] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Check if already dismissed
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed) return

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    // Detect iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    if (isIOS && isSafari && !(window.navigator as unknown as Record<string, boolean>).standalone) {
      setShowIOS(true)
      return
    }

    // Chrome/Android: listen for beforeinstallprompt
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }

    function onAppInstalled() {
      setInstalled(true)
      setShowBanner(false)
      setShowIOS(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
    }
    setDeferredPrompt(null)
    setShowBanner(false)
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShowBanner(false)
    setShowIOS(false)
  }

  // Already installed or dismissed — don't render
  if (installed || (!showBanner && !showIOS)) return null

  // Chrome/Android install banner
  if (showBanner) {
    return (
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-40 animate-fade-in">
        <div className="bg-charcoal text-white rounded-2xl p-4 shadow-2xl border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center text-lg shrink-0">
            🔌
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Install Campus Plug</p>
            <p className="text-xs text-white/60">Faster access from your home screen</p>
          </div>
          <button
            onClick={handleInstall}
            className="bg-gold text-charcoal px-4 py-2 rounded-full text-xs font-bold hover:bg-gold/90 transition-colors shrink-0"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            className="text-white/40 hover:text-white/70 transition-colors text-lg shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // iOS Safari helper toast
  if (showIOS) {
    return (
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-40 animate-fade-in">
        <div className="bg-charcoal text-white rounded-2xl p-4 shadow-2xl border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center text-lg shrink-0">
            📱
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Add to Home Screen</p>
            <p className="text-xs text-white/60">Tap <span className="font-bold">Share ⎕</span> then &ldquo;Add to Home Screen&rdquo;</p>
          </div>
          <button
            onClick={dismiss}
            className="text-white/40 hover:text-white/70 transition-colors text-lg shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return null
}
