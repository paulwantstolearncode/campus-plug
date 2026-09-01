'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'

type PosterType = 'general' | 'wanted' | 'seller'
type PosterFormat = 'a4' | 'a5' | 'mobile'

const POSTER_TEMPLATES: Record<PosterType, {
  targetUrl: string
  headline: string
  subheading: string
  stamp: string
}> = {
  general: {
    targetUrl: 'https://campuspluggh.com',
    headline: 'Buy & Sell with Fellow UG Students',
    subheading: 'No agents. No stress. Just WhatsApp.',
    stamp: '01 / LEGON NOTICEBOARD',
  },
  wanted: {
    targetUrl: 'https://campuspluggh.com/requests',
    headline: 'Need Something? Post a Wanted Request',
    subheading: 'Tell the campus what you need — students will reach out directly.',
    stamp: '02 / WANTED BOARD',
  },
  seller: {
    targetUrl: 'https://campuspluggh.com/become-seller',
    headline: 'Start Selling on Campus Plug',
    subheading: 'Join verified student sellers at the University of Ghana.',
    stamp: '03 / SELLER RECRUITMENT',
  },
}

const FORMAT_SIZES: Record<PosterFormat, { width: number; height: number; label: string }> = {
  a4: { width: 794, height: 1123, label: 'A4 Print' },
  a5: { width: 559, height: 794, label: 'A5 Flyer' },
  mobile: { width: 1080, height: 1920, label: 'Mobile Story' },
}

export default function PosterGeneratorPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [posterType, setPosterType] = useState<PosterType>('general')
  const [format, setFormat] = useState<PosterFormat>('a4')
  const [headline, setHeadline] = useState(POSTER_TEMPLATES.general.headline)
  const [subheading, setSubheading] = useState(POSTER_TEMPLATES.general.subheading)
  const [locationTag, setLocationTag] = useState('University of Ghana · Legon Campus')
  const [customQrImage, setCustomQrImage] = useState<string | null>(null)

  const posterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function checkAdmin() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (profileError) { setError('Could not verify admin access: ' + profileError.message); return }
        if (!profile?.is_admin) { alert('Admin access only'); router.push('/'); return }

        setIsAdmin(true)
      } catch (err) {
        console.error('Admin check failed:', err)
        setError('Could not load admin data.')
      } finally {
        setLoading(false)
      }
    }
    checkAdmin()
  }, [router])

  function handlePosterTypeChange(type: PosterType) {
    setPosterType(type)
    const t = POSTER_TEMPLATES[type]
    setHeadline(t.headline)
    setSubheading(t.subheading)
    setCustomQrImage(null)
  }

  function handleQrFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCustomQrImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const targetUrl = POSTER_TEMPLATES[posterType].targetUrl
  const qrSrc = customQrImage || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}`
  const size = FORMAT_SIZES[format]

  function handlePrint() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🎨</div>
          <p className="text-white/70">Loading poster generator...</p>
        </div>
      </div>
    )
  }

  if (error && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md text-center shadow-xl">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-600 font-semibold">{error}</p>
          <Link href="/" className="inline-block mt-5 text-sm text-white bg-charcoal rounded-full px-5 py-2.5 hover:bg-black transition-colors">← Back to app</Link>
        </div>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <main className="min-h-screen bg-charcoal">
      {/* ── Admin Nav (hidden on print) ── */}
<NavBar variant="admin" back={{ href: '/admin', label: 'Admin Dashboard' }} className="no-print" />

      {/* ── Controls Bar (hidden on print) ── */}
      <section className="no-print pt-28 pb-8 bg-charcoal/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
          <div>
            <div className="inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-2">Poster Generator</div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">🎨 Print Posters</h1>
            <p className="text-white/60">Design and print promotional posters for Campus Plug.</p>
          </div>

          {/* Poster Type Selector */}
          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Poster Type</label>
            <div className="flex flex-wrap gap-2">
              {([
                ['general', '🏠 General Student Poster'],
                ['wanted', '📋 Wanted Board Flyer'],
                ['seller', '💰 Seller Recruitment'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handlePosterTypeChange(key)}
                  className={
                    'px-5 py-2.5 rounded-full font-semibold text-sm transition-all ' +
                    (posterType === key
                      ? 'bg-gold text-charcoal shadow-lg shadow-gold/25'
                      : 'bg-white/10 text-white hover:bg-white/20')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Format Selector */}
          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Format</label>
            <div className="flex flex-wrap gap-2">
              {([
                ['a4', '📄 A4 Print'],
                ['a5', '📑 A5 Flyer'],
                ['mobile', '📱 Mobile Story (1080×1920)'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFormat(key)}
                  className={
                    'px-5 py-2.5 rounded-full font-semibold text-sm transition-all ' +
                    (format === key
                      ? 'bg-white text-charcoal shadow-lg'
                      : 'bg-white/10 text-white hover:bg-white/20')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Editable Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1">Headline</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1">Subheading</label>
              <input
                type="text"
                value={subheading}
                onChange={(e) => setSubheading(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1">📍 Location Tag</label>
              <input
                type="text"
                value={locationTag}
                onChange={(e) => setLocationTag(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1">📸 Custom QR Code (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleQrFileUpload}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-gold file:text-charcoal"
              />
              {customQrImage && (
                <button onClick={() => setCustomQrImage(null)} className="text-xs text-white/50 hover:text-white mt-1">
                  ✕ Remove custom QR — use auto-generated
                </button>
              )}
            </div>
          </div>

          {/* Print Button */}
          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              className="bg-gold text-charcoal px-8 py-3 rounded-full font-bold hover:bg-gold/90 transition-colors shadow-lg shadow-gold/25 text-sm"
            >
              🖨️ Print Poster ({FORMAT_SIZES[format].label})
            </button>
          </div>
        </div>
      </section>

      {/* ── Poster Canvas ── */}
      <section className="bg-off-white no-print pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
          <div className="bg-white/50 rounded-2xl p-6 border border-white/10 flex justify-center">
            <div
              ref={posterRef}
              className="poster-canvas bg-paper border border-rule overflow-hidden shadow-2xl"
              style={{ width: size.width, height: size.height }}
            >
              {/* Masthead */}
              <div className="bg-ink px-8 py-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-3xl">⚡</span>
                  <span className="text-white font-bold text-xl md:text-2xl tracking-[0.15em] uppercase">Campus Plug</span>
                  <span className="text-3xl">⚡</span>
                </div>
                <p className="text-gold text-xs font-bold tracking-[0.3em] uppercase">University of Ghana · Legon</p>
              </div>

              {/* Gold rule */}
              <div className="h-1 bg-gold" />

              {/* Section stamp */}
              <div className="px-8 pt-6 pb-2">
                <span className="text-[10px] font-bold text-ink-muted tracking-[0.25em] uppercase">{POSTER_TEMPLATES[posterType].stamp}</span>
              </div>

              {/* Headline */}
              <div className="px-8 pt-2 pb-4">
                <h2 className="text-2xl md:text-3xl font-bold text-ink leading-tight font-serif-accent" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                  {headline.split(' ').map((word, i) => {
                    const lower = word.toLowerCase()
                    if (['sell', 'free', 'students', 'sell?', 'campus', 'plug', 'start'].includes(lower)) {
                      return <span key={i} className="italic text-gold">{word} </span>
                    }
                    return <span key={i}>{word} </span>
                  })}
                </h2>
              </div>

              {/* Hairline rule */}
              <div className="mx-8 border-t border-rule" />

              {/* Subheading */}
              <div className="px-8 py-4">
                <p className="text-ink-muted text-base leading-relaxed">{subheading}</p>
              </div>

              {/* QR Code */}
              <div className="px-8 py-4 flex flex-col items-center">
                <div className="bg-white p-4 rounded-2xl border-2 border-gold shadow-md">
                  <img
                    src={qrSrc}
                    alt="QR Code — scan to visit Campus Plug"
                    width={200}
                    height={200}
                    className="w-[200px] h-[200px]"
                  />
                </div>
                <p className="text-ink-muted text-[11px] font-semibold mt-3 tracking-wide">
                  📸 Point your phone camera here to scan
                </p>
              </div>

              {/* Location tag */}
              <div className="px-8 py-2 text-center">
                <span className="inline-block bg-gold-soft text-ink font-mono text-xs font-bold px-4 py-2 rounded-full">
                  📍 {locationTag}
                </span>
              </div>

              {/* Trust bar */}
              <div className="mx-8 border-t border-rule mt-4" />
              <div className="px-8 py-4 text-center">
                <p className="text-ink-muted text-[11px] font-semibold tracking-wide">
                  100% Free for Students · Direct WhatsApp · Legon Campus
                </p>
              </div>

              {/* Footer */}
              <div className="bg-ink px-8 py-4 text-center">
                <p className="text-white text-xs font-bold tracking-[0.15em] uppercase">campuspluggh.com</p>
                <p className="text-gold text-[10px] mt-1 tracking-widest">⚡ THE LEGON NOTICEBOARD ⚡</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
