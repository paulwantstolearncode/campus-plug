'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, type Category } from '@/lib/categories'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import { toPng, toJpeg } from 'html-to-image'
import { formatListingPrice } from '@/lib/format'

type PosterType = 'general' | 'wanted' | 'seller' | 'listing'
type PosterFormat = 'a4' | 'a5' | 'a6' | 'mobile'
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
  // Featured-listing poster: fields auto-fill from the picked listing
  // (title → headline, location tag, photo, price range) and stay
  // manually editable. targetUrl is built from the selected listing id.
  listing: {
    targetUrl: 'https://campuspluggh.com',
    headline: 'Featured on Campus Plug',
    subheading: 'Verified student seller · Direct WhatsApp deal',
    stamp: '04 / FEATURED LISTING',
  },
}

// Listing row shape used by the picker (price-range aware).
interface PosterListing {
  id: string
  title: string
  price: number
  max_price: number | null
  image_url: string | null
  campus_location: string | null
  category: string | null
  listing_type: string
  listing_images: { id: string; image_url: string; display_order: number }[] | null
}

const FORMAT_SIZES: Record<PosterFormat, { width: number; height: number; label: string }> = {
  a4: { width: 794, height: 1123, label: 'A4 Print' },
  a5: { width: 559, height: 794, label: 'A5 Flyer' },
  a6: { width: 397, height: 559, label: 'A6 Mini Flyer' },
  mobile: { width: 1080, height: 1920, label: 'Mobile Story' },
}

// Category feature strip — fills the middle of tall formats so posters read
// top-to-bottom with no dead space. Accommodations is pinned first; the
// remaining rows are derived from what's actually live on the board (see
// categoryPillars below), falling back to the biggest current categories
// while listings load.
const ACCOMMODATION_PILLAR = { emoji: '🏠', text: 'Accommodations (Hostel Rooms & Stays)' }
const FALLBACK_PILLARS = [
  { emoji: '👗', text: 'Clothing & Fashion (Sneakers, Thrift Wear)' },
  { emoji: '💇', text: 'Hair & Beauty (Braids, Barbing, Nails)' },
  { emoji: '💄', text: 'Beauty Products (Skincare, Cosmetics)' },
]

const HALL_CHIPS = ['📍 Pentagon', '📍 Evandy', '📍 TF Hostels', '📍 Main Campus']

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
  featureCardClass: string
  featureTextClass: string
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
    featureCardClass: 'bg-white/5 border border-gold/25',
    featureTextClass: 'text-white',
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
    featureCardClass: 'bg-white border border-rule',
    featureTextClass: 'text-ink',
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
    featureCardClass: 'bg-[#0f0f0f] border border-white/10',
    featureTextClass: 'text-white',
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
    featureCardClass: 'bg-white/5 border border-gold/20',
    featureTextClass: 'text-white',
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

  // Featured-listing picker state.
  const [listings, setListings] = useState<PosterListing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [listingsError, setListingsError] = useState<string | null>(null)
  const [selectedListingId, setSelectedListingId] = useState('')
  const [badgeTag, setBadgeTag] = useState('')

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

  // Fetch active listings for the featured-listing picker (once admin is
  // verified). Active = not deleted, not sold, approved for the public
  // marketplace — posters funnel real buyers to live listings.
  useEffect(() => {
    if (!isAdmin) return

    async function loadListings() {
      setListingsLoading(true)
      try {
        const { data, error: listingsError } = await supabase
          .from('listings')
          .select('id, title, price, max_price, image_url, campus_location, category, listing_type, listing_images (id, image_url, display_order)')
          .eq('approval_status', 'approved')
          .is('deleted_at', null)
          .is('sold_at', null)
          .order('created_at', { ascending: false })

        if (listingsError) throw listingsError
        setListings((data as unknown as PosterListing[]) || [])
      } catch (err) {
        console.error('Poster listings fetch failed:', err)
        setListingsError('Could not load listings for the picker.')
      } finally {
        setListingsLoading(false)
      }
    }

    loadListings()
  }, [isAdmin])

  const selectedListing = listings.find((l) => l.id === selectedListingId) || null

  // Category pillars: accommodations first, then the top categories from
  // what's actually live on the board right now (listings are already
  // fetched for the picker). Falls back to the biggest current categories
  // while the fetch is pending or fails.
  const categoryPillars = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of listings) {
      if (!l.category) continue
      counts.set(l.category, (counts.get(l.category) || 0) + 1)
    }
    const derived = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([slug]) => CATEGORIES.find((c) => c.slug === slug))
      .filter((c): c is Category => Boolean(c))
      .map((c) => ({
        emoji: c.emoji,
        text: `${c.label} (${c.sampleItems.slice(0, 2).join(', ')})`,
      }))
    return [ACCOMMODATION_PILLAR, ...(derived.length > 0 ? derived : FALLBACK_PILLARS)]
  }, [listings])

  // Pick a listing → auto-fill poster fields. Every filled field stays
  // manually editable afterwards (headline, subheading, location, badge).
  function handleListingSelect(listingId: string) {
    setSelectedListingId(listingId)

    const listing = listings.find((l) => l.id === listingId)
    if (!listing) return

    setPosterType('listing')
    setHeadline(listing.title)
    setSubheading(POSTER_TEMPLATES.listing.subheading)
    setLocationTag(listing.campus_location || 'University of Ghana · Legon Campus')
    setCustomQrImage(null)
  }

  function handlePosterTypeChange(type: PosterType) {
    setPosterType(type)
    if (type !== 'listing') setSelectedListingId('')
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

  // Featured listing: QR + stamp point to the listing's public page so
  // scans land on the real product, not just the homepage.
  const targetUrl =
    posterType === 'listing' && selectedListingId
      ? `https://campuspluggh.com/listing/${selectedListingId}`
      : POSTER_TEMPLATES[posterType].targetUrl
  const qrSrc = customQrImage || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}`
  const size = FORMAT_SIZES[format]
  const isStory = format === 'mobile'
  // A6 is the smallest ISO format we print — the editorial layout gets a
  // proportionate scale-down (type, QR, brackets, bands) so it reads like
  // a proper mini flyer, not a shrunken A4.
  const isMini = format === 'a6'
  const theme = THEME_CONFIG[bgTheme]

  // Poster photo: primary image_url, else the first gallery shot by
  // display order. Plain URL — the canvas renders a standard <img>
  // because html-to-image can't rasterize next/image.
  const listingPhoto = selectedListing
    ? selectedListing.image_url ||
      [...(selectedListing.listing_images || [])]
        .sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))[0]?.image_url ||
      null
    : null
  const listingPriceLabel = selectedListing
    ? formatListingPrice(selectedListing.price, selectedListing.max_price)
    : ''
  // Story preview: the canvas keeps its print-resolution layout (1080×1920)
  // and is zoomed DOWN to fit the preview shell. The factor is measured from
  // the shell so it stays exact on phones (where the shell is narrower than
  // 360px); 1/3 is the desktop fallback for the first paint.
  const STORY_PREVIEW_WIDTH = 360
  const storyShellRef = useRef<HTMLDivElement>(null)
  const [storyZoom, setStoryZoom] = useState(STORY_PREVIEW_WIDTH / 1080)
  useEffect(() => {
    if (!isStory || !storyShellRef.current) return
    const el = storyShellRef.current
    // ResizeObserver fires an initial entry on observe, so zoom tracks the
    // real shell width (rotation, resize, breakpoint changes) without any
    // synchronous setState in the effect body.
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w > 0) setStoryZoom(w / size.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isStory, size.width])

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
            <h1 className="text-3xl md:text-4xl font-bold text-white">🎨 Print Posters</h1>
          </div>

          {/* ── Featured Listing Picker ── */}
          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">
              🏪 Featured Listing Picker
            </label>
            {listingsLoading ? (
              <div className="px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white/60 text-sm animate-pulse">
                Loading listings…
              </div>
            ) : listingsError ? (
              <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                {listingsError}{' '}
                <button
                  onClick={() => { setListingsError(null); window.location.reload() }}
                  className="underline font-semibold hover:text-red-200"
                >
                  Retry
                </button>
              </div>
            ) : listings.length === 0 ? (
              <div className="px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white/60 text-sm">
                No active listings found — approve listings in the admin panel first.
              </div>
            ) : (
              <select
                value={selectedListingId}
                onChange={(e) => handleListingSelect(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-gold transition-colors text-sm"
              >
                <option value="" className="text-charcoal bg-white">
                  — Pick a listing to feature (optional) —
                </option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id} className="text-charcoal bg-white">
                    {l.title} · {formatListingPrice(l.price, l.max_price)}
                    {l.listing_type === 'service' ? ' · Service' : ''}
                  </option>
                ))}
              </select>
            )}
            {selectedListing && (
              <p className="text-xs text-white/50 mt-1.5">
                Auto-filled title, price{' '}
                {selectedListing.max_price && selectedListing.max_price > selectedListing.price
                  ? 'range '
                  : ''}
                and location — edit the fields below to customize.
              </p>
            )}
          </div>

          {/* Poster Type Selector */}
          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Poster Type</label>
            <div className="flex flex-wrap gap-2">
              {([
                ['general', '🏠 General Student Poster'],
                ['wanted', '📋 Wanted Board Flyer'],
                ['seller', '💰 Seller Recruitment'],
                ['listing', '🏪 Featured Listing'],
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
                ['a6', '🧾 A6 Mini Flyer'],
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
              <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1">🏷️ Badge Tag (optional)</label>
              <input
                type="text"
                value={badgeTag}
                onChange={(e) => setBadgeTag(e.target.value)}
                placeholder='e.g. "Level 100 Special" or "Hot Deal"'
                className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white border border-white/20 focus:outline-none focus:border-gold transition-colors text-sm placeholder:text-white/40"
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
            {/* Story: strict 9:16 preview shell — the canvas inside is laid
                out at print resolution (1080×1920) and zoomed down by
                storyZoom, so proportions always match the export exactly.
                Width is clamped responsively (viewport-aware on phones via
                dvh units) and the shell scrolls if the viewport is too short
                to show the whole story at once. */}
            <div
              ref={storyShellRef}
              className={
                isStory
                  ? 'aspect-[9/16] w-[min(360px,calc(100vw_-_5.25rem),calc(92dvh*0.5625))] max-h-[92dvh] mx-auto overflow-y-auto no-scrollbar'
                  : undefined
              }
            >
            <div
              ref={posterRef}
              className={`poster-canvas relative overflow-hidden shadow-2xl ${theme.canvasClass}`}
              style={
                isStory
                  ? { width: size.width, height: size.height, zoom: storyZoom, transformOrigin: 'top left' }
                  : { width: size.width, height: size.height }
              }
            >
              {/* Pattern overlay (glow / grid / clean) */}
              <div className="absolute inset-0 pointer-events-none" style={PATTERN_CONFIG[bgPattern].style} />

              {/* Gold L-shaped corner brackets */}
              <span className={`absolute ${isMini ? 'top-1.5 left-1.5 w-6 h-6 border-t-2 border-l-2' : 'top-3 left-3 w-9 h-9 border-t-[3px] border-l-[3px]'} ${theme.bracketClass}`} aria-hidden="true" />
              <span className={`absolute ${isMini ? 'top-1.5 right-1.5 w-6 h-6 border-t-2 border-r-2' : 'top-3 right-3 w-9 h-9 border-t-[3px] border-r-[3px]'} ${theme.bracketClass}`} aria-hidden="true" />
              <span className={`absolute ${isMini ? 'bottom-1.5 left-1.5 w-6 h-6 border-b-2 border-l-2' : 'bottom-3 left-3 w-9 h-9 border-b-[3px] border-l-[3px]'} ${theme.bracketClass}`} aria-hidden="true" />
              <span className={`absolute ${isMini ? 'bottom-1.5 right-1.5 w-6 h-6 border-b-2 border-r-2' : 'bottom-3 right-3 w-9 h-9 border-b-[3px] border-r-[3px]'} ${theme.bracketClass}`} aria-hidden="true" />



              {/* ── Layout: full-height flex column — full-bleed top bands,
                  stretchy middle, footer pinned to the bottom edge (no dead void) ── */}
              <div className="relative flex flex-col justify-between h-full min-h-full overflow-hidden">
                {/* Top bands: editorial tag → masthead → gold rule (full-bleed) */}
                <div>
                  <div className={`px-8 py-2.5 text-center ${theme.topTagClass}`}>
                    <p className={`${isMini ? 'text-[7px]' : 'text-[9px]'} font-bold tracking-[0.35em] uppercase`}>
                      Official Campus Marketplace • University of Ghana
                    </p>
                  </div>

                  <div className={`px-8 ${isMini ? 'py-2.5' : 'py-5'} text-center ${theme.mastheadClass}`}>
                    <div className="flex items-center justify-center gap-3 mb-1.5">
                      <span className={isMini ? 'text-base' : 'text-2xl'}>⚡</span>
                      <span className={`text-white font-bold ${isMini ? 'text-base' : 'text-xl'} tracking-[0.15em] uppercase`}>Campus Plug</span>
                      <span className={isMini ? 'text-base' : 'text-2xl'}>⚡</span>
                    </div>
                    <p className={`text-gold ${isMini ? 'text-[8px]' : 'text-[11px]'} font-bold tracking-[0.3em] uppercase`}>University of Ghana · Legon</p>
                  </div>

                  <div className={`h-1 ${theme.ruleClass}`} />
                </div>

                {/* ── Middle: stretches to fill every spare pixel — headline,
                    subheading, category strip, glowing QR ── */}
                <div className="flex-1 min-h-0 py-3 flex">
                  <div className={`${theme.contentCardClass} flex-1 flex flex-col justify-evenly min-h-0 my-0! ${isMini ? 'py-2!' : 'py-4!'}`}>
                    <div className={`text-center ${isMini ? 'px-4' : 'px-5 sm:px-8'}`}>
                      {badgeTag.trim() !== '' && (
                        <span className={`inline-block bg-gold text-[#0f0f0f] font-bold ${isMini ? 'text-[8px] tracking-[0.15em] px-3 py-1 mb-2' : 'text-[11px] tracking-[0.2em] px-4 py-1.5 mb-3'} uppercase rounded-full`}>
                          {badgeTag.trim()}
                        </span>
                      )}
                      <span className={`${isMini ? 'text-[7px]' : 'text-[10px]'} font-bold tracking-[0.25em] uppercase ${theme.stampClass}`}>
                        {posterType === 'listing' && selectedListing
                          ? (selectedListing.listing_type === 'service' ? 'Service on Campus Plug' : 'Item on Campus Plug') + ' · ' + (selectedListing.category ? selectedListing.category.replace(/-/g, ' ') : 'Marketplace')
                          : POSTER_TEMPLATES[posterType].stamp}
                      </span>
                      <h2 className={`mt-2 ${isStory ? 'text-4xl' : isMini ? 'text-lg' : 'text-2xl'} font-bold leading-tight font-serif-accent ${theme.headlineClass}`} style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                        {headline.split(' ').map((word, i) => {
                          const lower = word.toLowerCase()
                          if (['sell', 'free', 'students', 'sell?', 'campus', 'plug', 'start'].includes(lower)) {
                            return <span key={i} className="italic text-gold">{word} </span>
                          }
                          return <span key={i}>{word} </span>
                        })}
                      </h2>
                      <p className={`mt-2 ${isStory ? 'text-base' : isMini ? 'text-[10px]' : 'text-sm'} leading-relaxed ${theme.subheadingClass}`}>{subheading}</p>

                      {/* Featured listing: price range + photo card. Standard
                          <img> on purpose — html-to-image rasterizes plain
                          image tags, not next/image. */}
                      {posterType === 'listing' && selectedListing && (
                        <div className="mt-4 space-y-3">
                          <p className={`${isStory ? 'text-4xl' : isMini ? 'text-xl' : 'text-2xl'} font-bold text-gold tracking-tight`}>
                            {listingPriceLabel}
                          </p>
                          {listingPhoto ? (
                            <div className={`relative mx-auto rounded-2xl overflow-hidden border-2 ${theme.bracketClass}`} style={{ maxWidth: isStory ? 420 : isMini ? 190 : 340 }}>
                              <img
                                src={listingPhoto}
                                alt={selectedListing.title}
                                className="w-full aspect-[4/3] object-cover block"
                                crossOrigin="anonymous"
                              />
                            </div>
                          ) : (
                            <div className={`mx-auto rounded-2xl border-2 border-dashed ${theme.bracketClass} flex items-center justify-center`} style={{ maxWidth: isStory ? 420 : isMini ? 190 : 340 }}>
                              <span className={`${isStory ? 'text-6xl' : isMini ? 'text-3xl' : 'text-4xl'} py-10 opacity-60`}>🛍️</span>
                            </div>
                          )}
                          <p className={`${isStory ? 'text-sm' : isMini ? 'text-[8px]' : 'text-[11px]'} font-semibold ${theme.stampClass} tracking-wide`}>
                            ⚡ Message the seller on WhatsApp — no agents, no fees
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Category highlights strip — only for template posters
                        (featured listings show their own photo + price above).
                        A6 packs the 4 pillars into a 2-up grid so the mini
                        canvas keeps breathing. */}
                    {(posterType !== 'listing' || !selectedListing) && (
                      <div className={`grid ${isMini ? 'grid-cols-2 gap-1 px-4' : 'grid-cols-1 gap-1.5 px-5 sm:px-8'}`}>
                        {categoryPillars.map((pillar) => (
                          <div key={pillar.text} className={`flex items-center ${isMini ? 'gap-1.5 rounded-md px-2 py-1.5' : 'gap-2.5 rounded-lg px-3 py-2'} ${theme.featureCardClass}`}>
                            <span className={`${isMini ? 'text-xs' : 'text-base'} leading-none`}>{pillar.emoji}</span>
                            <span className={`${isMini ? 'text-[8px]' : isStory ? 'text-[13px]' : 'text-[11px]'} font-semibold ${theme.featureTextClass}`}>{pillar.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* QR code — prominent, centered, glowing for instant scans.
                        A6 keeps it scannable but proportional (110px). */}
                    <div className={`flex flex-col items-center ${isMini ? 'px-4' : 'px-5 sm:px-8'}`}>
                      <div className={isMini ? theme.qrShellClass.replace('p-4', 'p-2.5') : theme.qrShellClass}>
                        <img
                          src={qrSrc}
                          alt="QR Code — scan to visit Campus Plug"
                          width={240}
                          height={240}
                          className={isStory ? 'w-[240px] h-[240px]' : isMini ? 'w-[140px] h-[140px]' : 'w-[200px] h-[200px]'}
                        />
                      </div>
                      <p className={`${isStory ? 'text-[13px]' : isMini ? 'text-[8px]' : 'text-[11px]'} font-semibold mt-2 tracking-wide ${theme.stampClass}`}>
                        📸 Point your phone camera here to scan
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Bottom stack: location chip, hall badges, trust line, footer ── */}
                <div>
                  <div className={`${isMini ? 'px-4' : 'px-6 sm:px-8'} pb-2 text-center`}>
                    <span className={`inline-block font-mono ${isStory ? 'text-sm' : isMini ? 'text-[9px]' : 'text-xs'} font-bold ${isMini ? 'px-3 py-1.5' : 'px-4 py-2'} rounded-full ${theme.locationChipClass}`}>
                      📍 {locationTag}
                    </span>
                  </div>

                  {/* Hall chips don't fit the A6 canvas — locations already
                      appear in the tag above, so minis drop the row. */}
                  {!isMini && (
                    <div className="px-6 sm:px-8 pb-3 flex flex-wrap justify-center gap-1.5">
                      {HALL_CHIPS.map((hall) => (
                        <span key={hall} className={`${isStory ? 'text-[12px]' : 'text-[10px]'} font-semibold px-2.5 py-1 rounded-full border ${theme.featureCardClass} ${theme.featureTextClass}`}>
                          {hall}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer — anchored flush to the bottom border of the frame.
                      Trust line lives here so it's always on the dark band,
                      regardless of canvas theme. */}
                  <div className={`bg-ink ${isMini ? 'px-4 py-2' : 'px-8 py-3.5'} text-center`}>
                    <p className={`text-white/70 ${isMini ? 'text-[8px]' : 'text-[11px]'} font-semibold tracking-wide`}>
                      100% Free for Students · Direct WhatsApp · Legon Campus
                    </p>
                    <p className={`text-white ${isMini ? 'text-[9px]' : 'text-xs'} font-bold tracking-[0.15em] uppercase mt-1.5`}>campuspluggh.com</p>
                    <p className={`text-gold ${isMini ? 'text-[7px]' : 'text-[10px]'} mt-1 tracking-widest`}>⚡ THE LEGON NOTICEBOARD ⚡</p>
                  </div>
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
