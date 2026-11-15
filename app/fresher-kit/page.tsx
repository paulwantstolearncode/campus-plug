import type { Metadata } from 'next'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import FresherChecklist from '@/app/components/FresherChecklist'
import { CATEGORIES } from '@/lib/categories'

export const metadata: Metadata = {
  title: 'UG Fresher Marketplace — Campus Plug',
  description:
    'Buy everything a Level 100 needs — kettles, laptops, past questions, hair braiding, laundry — from verified UG students. Pay with MoMo, get delivery on campus.',
}

const HALL_BADGES = [
  '📍 Pentagon',
  '📍 Evandy',
  '📍 TF Hostels',
  '📍 Akuafo/Legon Hall',
  '📍 Jean Nelson',
]

// The six first-purchase categories for a Level 100, mapped to marketplace
// category slugs. Each pillar links straight to filtered marketplace listings.
const FRESHER_PILLARS: {
  slug: string
  emoji: string
  title: string
  description: string
  microPill?: string
}[] = [
  {
    slug: 'hostel-essentials',
    emoji: '🛏️',
    title: 'Hostel Essentials',
    description:
      'Kettles, fans, extension boards, bedding, storage boxes — everything your hall room is missing on day one.',
    microPill: 'Most bought by L100',
  },
  {
    slug: 'electronics-gadgets',
    emoji: '💻',
    title: 'Laptops & Tech',
    description:
      'Laptops that survive lectures, power banks for light-out hours, chargers, earbuds — sold by students who use them too.',
    microPill: '',
  },
  {
    slug: 'tutoring',
    emoji: '📚',
    title: 'Academics & Past Questions',
    description:
      'Past question booklets, slide printing, 1-on-1 tutoring for ECON, STAT, CS — courses that humble Level 100s.',
    microPill: '',
  },
  {
    slug: 'hair-beauty',
    emoji: '💇',
    title: 'Services & Grooming',
    description:
      'Laundry pick-up, hair braiding, barbing, tech repairs — booked and paid on campus.',
    microPill: 'Top requested',
  },
  {
    slug: 'clothing-fashion',
    emoji: '👗',
    title: 'Clothing & Fashion',
    description:
      'Fits, thrift finds, custom pieces — student closets, student prices.',
    microPill: '',
  },
  {
    slug: 'food-catering',
    emoji: '🍳',
    title: 'Food & Catering',
    description:
      'Home-cooked meals, meal prep, event catering — from student kitchens to your hall.',
    microPill: '',
  },
]

export default function FresherKitPage() {
  return (
    <main className="min-h-screen bg-adinkra-paper">
      <NavBar variant="light" />

      {/* ── Hero: marketplace entry for Level 100 ── */}
      <section className="relative bg-ink text-white overflow-hidden -mt-[64px] pt-[calc(64px+4rem)] pb-14 px-4 sm:px-6">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="hidden md:block absolute top-[-140px] left-1/2 -translate-x-1/2 w-[520px] h-[400px] bg-gold/15 blur-[140px] rounded-full"
          />
          <div className="absolute inset-0 grain-overlay opacity-[0.03]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <p className="font-serif-accent italic text-2xl sm:text-3xl text-gold mb-4">
            Level 100 Marketplace
          </p>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5">
            Buy your first{' '}
            <span className="relative inline-block">
              semester essentials
              <span
                className="absolute left-0 -bottom-1.5 w-full h-[3px] rounded-full bg-gold"
                aria-hidden="true"
              />
            </span>{' '}
            from students
          </h1>
          <p className="text-white/60 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Kettles, laptops, past questions, braiding, laundry — everything to
            settle into Pent, Evandy, TF, and Main Campus halls. Pay with MoMo,
            get it on campus.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-7">
            {HALL_BADGES.map((badge) => (
              <span
                key={badge}
                className="bg-white/5 backdrop-blur-sm text-white/90 text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-full border border-gold/30 hover:border-gold/60 hover:bg-gold/10 transition-colors"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── The 6 First-Purchase Pillars: marketplace categories ── */}
      <section className="px-4 sm:px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FRESHER_PILLARS.map((pillar) => {
              const cat = CATEGORIES.find((c) => c.slug === pillar.slug)
              return (
                <Link
                  key={pillar.slug}
                  href={`/services?category=${pillar.slug}`}
                  className={
                    'card-lift group relative bg-surface rounded-card border border-rule overflow-hidden flex flex-col ' +
                    (pillar.microPill
                      ? 'sm:row-span-2 min-h-[280px] p-7 sm:p-8'
                      : 'min-h-[180px] p-6 sm:p-7') +
                    ' hover:border-gold/60 hover:shadow-[0_16px_48px_-16px_rgba(201,162,39,0.25)] transition-colors'
                  }
                >
                  {/* Category color tint wash */}
                  <span
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: ((cat?.color || '#c9a227') as string) + '66' }}
                    aria-hidden="true"
                  />
                  {/* Ambient emoji watermark */}
                  <span
                    className="absolute -bottom-6 -right-4 text-[6rem] sm:text-[7.5rem] leading-none opacity-5 select-none pointer-events-none transition-transform duration-500 group-hover:scale-110"
                    aria-hidden="true"
                  >
                    {pillar.emoji}
                  </span>

                  <div className="relative flex flex-col flex-1">
                    {pillar.microPill && (
                      <span
                        className="self-start inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3"
                        style={{
                          backgroundColor: ((cat?.color || '#c9a227') as string) + '1f',
                          color: cat?.color || '#c9a227',
                        }}
                      >
                        {pillar.microPill}
                      </span>
                    )}
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center mb-4 text-xl"
                      style={{ backgroundColor: ((cat?.color || '#c9a227') as string) + '26' }}
                    >
                      {pillar.emoji}
                    </div>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-ink mb-2">
                      {pillar.title}
                    </h2>
                    <p className="text-ink-muted text-sm leading-relaxed mb-5">
                      {pillar.description}
                    </p>
                    <div className="mt-auto flex items-center gap-2">
                      <span className="text-ink text-sm font-bold px-5 py-2.5 rounded-full transition-all hover:scale-[1.03] shadow-sm">
                        Shop {pillar.title.toLowerCase()} <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Interactive Fresher Checklist ── */}
      <section className="px-4 sm:px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <FresherChecklist />
        </div>
      </section>

      {/* ── Wanted Board Callout ── */}
      <section className="px-4 sm:px-6 pb-16">
        <div className="max-w-4xl mx-auto bg-ink rounded-card p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(201,162,39,0.12), transparent 70%)',
              }}
            />
            <div className="absolute inset-0 grain-overlay opacity-[0.04]" />
          </div>
          <div className="relative">
            <p className="font-serif-accent italic text-xl sm:text-2xl text-gold mb-3">
              Can&apos;t find it listed?
            </p>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
              Looking for something specific?
            </h2>
            <p className="text-white/60 text-sm sm:text-base max-w-xl mx-auto leading-relaxed mb-7">
              Post a request on our Wanted Board and verified student sellers
              will quote you on WhatsApp.
            </p>
            <Link
              href="/requests"
              className="inline-flex items-center gap-2 text-ink text-sm sm:text-base font-bold px-8 py-3.5 rounded-full transition-all hover:scale-[1.03] shadow-lg shadow-gold-glow"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #e8b93b 0%, #c9a227 55%, #a8841a 100%)',
              }}
            >
              📋 Post on the Wanted Board →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Sticky share bar ── */}
      <section className="sticky bottom-0 z-30 px-4 pb-4 sm:px-6">
        <div className="max-w-3xl mx-auto relative">
          <span
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-gold animate-pulse shadow-[0_0_12px_2px_rgba(201,162,39,0.5)]"
            aria-hidden="true"
          />
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              '⚡ Level 100 at UG? The Campus Plug Fresher Marketplace has everything you need — kettle, laptop, past questions, braiding, all from students on campus 👉 https://campuspluggh.com/fresher-kit'
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full min-h-[52px] text-white text-sm sm:text-base font-bold px-6 py-3.5 rounded-full border border-white/15 backdrop-blur-md shadow-xl transition-all hover:brightness-105"
            style={{
              background:
                'linear-gradient(135deg, rgba(37,211,102,0.92) 0%, rgba(18,140,74,0.92) 100%)',
            }}
          >
            📲 Share Fresher Marketplace with Roommates
          </a>
        </div>
      </section>

      {/* ── Footer spacing so the sticky bar never covers content ── */}
      <div className="h-6" />
    </main>
  )
}
