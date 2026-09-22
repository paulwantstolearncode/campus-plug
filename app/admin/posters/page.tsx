'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import { toPng, toJpeg } from 'html-to-image'

type PosterType = 'general' | 'wanted' | 'seller'
type PosterFormat = 'a4' | 'a5' | 'mobile'
type BgTheme = 'obsidian' | 'paper' | 'gold' | 'legon'
type BgPattern = 'glow' | 'grid' | 'clean'

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

const THEME_CONFIG: Record<BgTheme, {
  label: string
  swatchClass: string
  canvasClass: string
  topTagClass: string
  mastheadClass: string
  ruleClass: string
  stampClass: string
  headlineClass: string
  subheadingClass: string
  contentCardClass: string
  qrShellClass: string
  locationChipClass: string
  bracketClass: string
}> = {
  obsidian: {
    label: '🖤 Obsidian',
    swatchClass: 'bg-[#0f0f0f] border border-white/20',
    canvasClass: 'bg-[#0f0f0f] text-white border border-white/10',
    topTagClass: 'text-gold/90 bg-white/5 border-b border-white/10',
    mastheadClass: 'bg-black/40 border-b border-gold/30',
    ruleClass: 'bg-gold',
    stampClass: 'text-gold',
    headlineClass: 'text-white',
    subheadingClass: 'text-white/70',
    contentCardClass: 'bg-transparent',
    qrShellClass: 'bg-white p-4 rounded-2xl border-2 border-gold shadow-lg shadow-gold/20',
    locationChipClass: 'bg-gold-soft text-ink',
    bracketClass: 'border-gold',
  },
  paper: {
    label: '📄 Paper',
    swatchClass: 'bg-[#f8f8f8] border border-rule',
    canvasClass: 'bg-[#f8f8f8] text-white border border-rule',
    topTagClass: 'text-ink-muted bg-white border-b border-rule',
    mastheadClass: 'bg-ink',
    ruleClass: 'bg-gold',
    stampClass: 'text-gold',
    headlineClass: 'text-white',
    subheadingClass: 'text-white/70',
    contentCardClass: 'bg-ink mx-6 my-4 rounded-2xl px-4 pt-2 pb-4',
    qrShellClass: 'bg-white p-4 rounded-2xl border-2 border-gold shadow-md',
    locationChipClass: 'bg-gold-soft text-ink',
    bracketClass: 'border-gold',
  },
  gold: {
    label: '✨ Gold',
    swatchClass: 'bg-gradient-to-br from-[#c9a227] via-[#d4af37] to-[#b08a1e]',
    canvasClass: 'bg-gradient-to-br from-[#c9a227] via-[#d4af37] to-[#b08a1e] text-white border border-[#0f0f0f]/20',
    topTagClass: 'text-[#0f0f0f] bg-[#0f0f0f]/10 border-b border-[#0f0f0f]/20',
    mastheadClass: 'bg-ink',
    ruleClass: 'bg-gold',
    stampClass: 'text-gold',
    headlineClass: 'text-white',
    subheadingClass: 'text-white/70',
    contentCardClass: 'bg-[#0f0f0f] mx-6 my-4 rounded-2xl px-4 pt-2 pb-4',
    qrShellClass: 'bg-white p-4 rounded-2xl border-2 border-[#0f0f0f] shadow-xl',
    locationChipClass: 'bg-gold text-[#0f0f0f]',
    bracketClass: 'border-[#0f0f0f]',
  },
  legon: {
    label: '🏛️ Legon Slate',
    swatchClass: 'bg-[#0b131e] border border-white/20',
    canvasClass: 'bg-[#0b131e] text-white border border-white/10',
    topTagClass: 'text-gold/90 bg-white/5 border-b border-white/10',
    mastheadClass: 'bg-black/40 border-b border-gold/30',
    ruleClass: 'bg-gold',
    stampClass: 'text-gold',
    headlineClass: 'text-white',
    subheadingClass: 'text-white/70',
    contentCardClass: 'bg-white/5 mx-6 my-4 rounded-2xl px-4 pt-2 pb-4 border border-gold/20',
    qrShellClass: 'bg-white p-4 rounded-2xl border-2 border-gold shadow-lg shadow-gold/20',
    locationChipClass: 'bg-gold text-[#0f0f0f]',
    bracketClass: 'border-gold',
  },
}

const PATTERN_CONFIG: Record<BgPattern, { label: string; style: React.CSSProperties }> = {
  glow: {
    label: '✨ Gold Glow',
    style: { background: 'radial-gradient(ellipse 70% 45% at 50% 32%, rgba(201,162,39,0.20), transparent 70%)' },
  },
  grid: {
    label: '▦ Grid',
    style: {
      backgroundImage:
        'linear-gradient(rgba(201,162,39,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,39,0.10) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    },
  },
  clean: {
    label: '○ Clean',
    style: {},
  },
}

export default function PosterGeneratorPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [posterType, setPosterType] = useState<PosterType>('general')
  const [format, setFormat] = useState<PosterFormat>('a4')
  const [bgTheme, setBgTheme] = useState<BgTheme>('obsidian')
  const [bgPattern, setBgPattern] = useState<BgPattern>('glow')
  const [headline, setHeadline] = useState(POSTER_TEMPLATES.general.headline)
  const [subheading, setSubheading] = useState(POSTER_TEMPLATES.general.subheading)
  const [locationTag, setLocationTag] = useState('University of Ghana · Legon Campus')
  const [customQrImage, setCustomQrImage] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState<'png' | 'jpeg' | null>(null)

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
  const isStory = format === 'mobile'
  const theme = THEME_CONFIG[bgTheme]
  // Story preview: the canvas is 360×640 (9:16) and the print-resolution
  // layout (1080×1920) is zoomed DOWN to fit inside it.
  const STORY_PREVIEW_WIDTH = 360
  const storyZoom = STORY_PREVIEW_WIDTH / size.width

  async function handleDownload(exportFormat: 'png' | 'jpeg') {
    if (!posterRef.current || isExporting) return
    setIsExporting(exportFormat)
    try {
      const options = { quality: 0.98, cacheBust: true }
      let dataUrl: string
      if (isStory) {
        // Story: render an exact 1080×1920 (9:16) export. The on-screen
        // preview is a 360px-wide, zoomed-down copy, so we clone the node
        // off-DOM at half print resolution (540×960 — same 9:16 ratio) and
        // rasterize that; pixelRatio 2 doubles it to exactly 1080×1920.
        const clone = posterRef.current.cloneNode(true) as HTMLElement
        clone.style.width = `${Math.round(size.width / 2)}px`
        clone.style.height = `${Math.round(size.height / 2)}px`
        clone.style.zoom = '1'
        clone.style.transform = 'none'
        clone.style.position = 'fixed'
        clone.style.left = '-99999px'
        clone.style.top = '0'
        document.body.appendChild(clone)
        try {
          // pixelRatio: 2 on 540×960 logical px → exact 1080×1920 output.
          const storyOptions = { ...options, pixelRatio: 2 }
          dataUrl = exportFormat === 'png'
            ? await toPng(clone, storyOptions)
            : await toJpeg(clone, storyOptions)
        } finally {
          document.body.removeChild(clone)
        }
      } else {
        // A4/A5: pixelRatio: 2 → ~150 DPI at print size ×2 = 300 DPI equivalent.
        const printOptions = { ...options, pixelRatio: 2 }
        dataUrl = exportFormat === 'png'
          ? await toPng(posterRef.current, printOptions)
          : await toJpeg(posterRef.current, printOptions)
      }

      const link = document.createElement('a')
      link.download = `campus-plug-poster-${bgTheme}-${format}.${exportFormat}`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Poster export failed:', err)
      alert('Could not export the poster. Please try again or use Print / Save PDF instead.')
    } finally {
      setIsExporting(null)
    }
  }

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
            <p className="text-white/60">Design, download, and print promotional posters for Campus Plug.</p>
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

          {/* Background Theme Selector */}
          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Background Theme</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(THEME_CONFIG) as BgTheme[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setBgTheme(key)}
                  className={
                    'flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition-all border ' +
                    (bgTheme === key
                      ? 'bg-white text-charcoal border-white shadow-lg'
                      : 'bg-white/10 text-white border-white/20 hover:bg-white/20')
                  }
                >
                  <span className={`inline-block w-4 h-4 rounded-full ${THEME_CONFIG[key].swatchClass}`} aria-hidden="true" />
                  {THEME_CONFIG[key].label}
                </button>
              ))}
            </div>
          </div>

          {/* Pattern Overlay Selector */}
          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Pattern Overlay</label>
            <div className="flex flex-wrap gap-2">
              {([
                ['glow', PATTERN_CONFIG.glow.label],
                ['grid', PATTERN_CONFIG.grid.label],
                ['clean', PATTERN_CONFIG.clean.label],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setBgPattern(key)}
                  className={
                    'px-5 py-2.5 rounded-full font-semibold text-sm transition-all ' +
                    (bgPattern === key
                      ? 'bg-gold text-charcoal shadow-lg shadow-gold/25'
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

          {/* Action Bar: Download PNG / JPEG / Print */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleDownload('png')}
              disabled={isExporting !== null}
              className="bg-gold text-charcoal px-8 py-3 rounded-full font-bold hover:bg-gold/90 transition-colors shadow-lg shadow-gold/25 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isExporting === 'png' ? '⏳ Rendering…' : '⬇️ Download PNG'}
            </button>
            <button
              onClick={() => handleDownload('jpeg')}
              disabled={isExporting !== null}
              className="bg-white/10 text-white px-8 py-3 rounded-full font-bold hover:bg-white/20 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isExporting === 'jpeg' ? '⏳ Rendering…' : '⬇️ Download JPEG'}
            </button>
            <button
              onClick={handlePrint}
              className="border border-gold/60 text-gold px-8 py-3 rounded-full font-bold hover:bg-gold/10 transition-colors text-sm"
            >
              🖨️ Print / Save PDF ({FORMAT_SIZES[format].label})
            </button>
          </div>
        </div>
      </section>

      {/* ── Poster Canvas ── */}
      <section className="bg-off-white no-print pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
          <div className="bg-white/50 rounded-2xl p-6 border border-white/10 flex justify-center">
            {/* Story: strict 9:16 contained preview shell — the canvas inside is
                laid out at print resolution (1080×1920) and zoomed down ⅓ to a
                360×640 box, so proportions match the export exactly. */}
            <div className={isStory ? 'aspect-[9/16] max-h-[650px] w-auto max-w-[360px] mx-auto' : undefined}>
            <div
              ref={posterRef}
              className={`poster-canvas relative overflow-hidden shadow-2xl ${theme.canvasClass}`}
              style={
                isStory
                  ? { width: size.width, height: size.height, zoom: storyZoom }
                  : { width: size.width, height: size.height }
              }
            >
              {/* Pattern overlay (glow / grid / clean) */}
              <div className="absolute inset-0 pointer-events-none" style={PATTERN_CONFIG[bgPattern].style} />

              {/* Gold L-shaped corner brackets */}
              <span className={`absolute top-3 left-3 w-9 h-9 border-t-[3px] border-l-[3px] ${theme.bracketClass}`} aria-hidden="true" />
              <span className={`absolute top-3 right-3 w-9 h-9 border-t-[3px] border-r-[3px] ${theme.bracketClass}`} aria-hidden="true" />
              <span className={`absolute bottom-3 left-3 w-9 h-9 border-b-[3px] border-l-[3px] ${theme.bracketClass}`} aria-hidden="true" />
              <span className={`absolute bottom-3 right-3 w-9 h-9 border-b-[3px] border-r-[3px] ${theme.bracketClass}`} aria-hidden="true" />

              <div className="relative">
                {/* Editorial top tag */}
                <div className={`px-8 py-2.5 text-center ${theme.topTagClass}`}>
                  <p className="text-[9px] font-bold tracking-[0.35em] uppercase">
                    Official Campus Marketplace • University of Ghana
                  </p>
                </div>

                {/* Masthead */}
                <div className={`px-8 py-6 text-center ${theme.mastheadClass}`}>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-3xl">⚡</span>
                    <span className="text-white font-bold text-xl md:text-2xl tracking-[0.15em] uppercase">Campus Plug</span>
                    <span className="text-3xl">⚡</span>
                  </div>
                  <p className="text-gold text-xs font-bold tracking-[0.3em] uppercase">University of Ghana · Legon</p>
                </div>

                {/* Gold rule */}
                <div className={`h-1 ${theme.ruleClass}`} />

                {/* Themed content card */}
                <div className={theme.contentCardClass}>
                  {/* Section stamp */}
                  <div className="px-6 pt-5 pb-2">
                    <span className={`text-[10px] font-bold tracking-[0.25em] uppercase ${theme.stampClass}`}>{POSTER_TEMPLATES[posterType].stamp}</span>
                  </div>

                  {/* Headline */}
                  <div className="px-6 pt-2 pb-4">
                    <h2 className={`text-2xl md:text-3xl font-bold leading-tight font-serif-accent ${theme.headlineClass}`} style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
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
                  <div className="mx-6 border-t border-white/15" />

                  {/* Subheading */}
                  <div className="px-6 py-4">
                    <p className={`text-base leading-relaxed ${theme.subheadingClass}`}>{subheading}</p>
                  </div>

                  {/* QR Code — clean high-contrast white/gold backdrop for phone cameras */}
                  <div className="px-6 py-4 flex flex-col items-center">
                    <div className={theme.qrShellClass}>
                      <img
                        src={qrSrc}
                        alt="QR Code — scan to visit Campus Plug"
                        width={200}
                        height={200}
                        className="w-[200px] h-[200px]"
                      />
                    </div>
                    <p className={`text-[11px] font-semibold mt-3 tracking-wide ${theme.stampClass}`}>
                      📸 Point your phone camera here to scan
                    </p>
                  </div>

                  {/* Location tag */}
                  <div className="px-6 py-2 text-center">
                    <span className={`inline-block font-mono text-xs font-bold px-4 py-2 rounded-full ${theme.locationChipClass}`}>
                      📍 {locationTag}
                    </span>
                  </div>

                  {/* Trust bar */}
                  <div className="mx-6 border-t border-white/15 mt-4" />
                  <div className="px-6 py-4 text-center">
                    <p className={`text-[11px] font-semibold tracking-wide ${theme.subheadingClass}`}>
                      100% Free for Students · Direct WhatsApp · Legon Campus
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-ink px-8 py-4 text-center">
                  <p className="text-white text-xs font-bold tracking-[0.15em] uppercase">campuspluggh.com</p>
                  <p className="text-gold text-[10px] mt-1 tracking-widest">⚡ THE LEGON NOTICEBOARD ⚡</p>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
