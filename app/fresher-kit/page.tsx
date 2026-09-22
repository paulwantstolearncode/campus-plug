import type { Metadata } from 'next'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'
import FresherChecklist from '@/app/components/FresherChecklist'

export const metadata: Metadata = {
  title: 'UG Fresher Survival Kit — Campus Plug',
  description:
    'Everything Level 100 students need to settle into Pent, Evandy, TF, and Main Campus halls — kettles, laptops, past questions, hair braiding, laundry, and more, all from verified UG students.',
}

const HALL_BADGES = [
  '📍 Pentagon',
  '📍 Evandy',
  '📍 TF Hostels',
  '📍 Akuafo/Legon Hall',
  '📍 Jean Nelson',
]

const PILLARS: {
  emoji: string
  title: string
  description: string
  links: { href: string; label: string }[]
  accentClass: string
}[] = [
  {
    emoji: '🛏️',
    title: 'Hostel Essentials',
    description:
      'Kettles, fans, extension boards, bedding, storage boxes — everything your hall room is missing on day one.',
    links: [{ href: '/services?category=hostel-essentials', label: 'Shop Hostel Essentials' }],
    accentClass: 'text-emerald-600',
  },
  {
    emoji: '💻',
    title: 'Laptops & Tech',
    description:
      'Laptops that survive lectures, power banks for the light-out hours, chargers, and earbuds — sold by students who use them too.',
    links: [{ href: '/services?category=electronics-gadgets', label: 'Browse Electronics & Gadgets' }],
    accentClass: 'text-sky-600',
  },
  {
    emoji: '📚',
    title: 'Academics & Past Questions',
    description:
      'Past question booklets, slide printing, and 1-on-1 tutoring for the courses that humble Level 100s — ECON, STAT, CS.',
    links: [{ href: '/services?category=tutoring', label: 'Find Tutoring & Academic Help' }],
    accentClass: 'text-gold',
  },
  {
    emoji: '💇',
    title: 'Services & Grooming',
    description:
      'Laundry pick-up, hair braiding, barbing, and tech repairs — booked on WhatsApp, done on campus.',
    links: [
      { href: '/services?category=hair-beauty', label: 'Hair & Beauty' },
      { href: '/services?category=tech-repairs', label: 'Tech & Repairs' },
    ],
    accentClass: 'text-pink-600',
  },
]

export default function FresherKitPage() {
  return (
    <main className="min-h-screen bg-paper">
      <NavBar variant="light" />

      {/* ── Hero ── */}
      <section className="relative pt-28 pb-14 px-4 sm:px-6 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,162,39,0.10), transparent 70%)' }}
        />
        <div className="relative max-w-4xl mx-auto text-center">
          <p className="font-serif-accent text-2xl sm:text-3xl text-gold mb-3">Level 100 Cheat Code</p>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-ink tracking-tight mb-5">
            UG Fresher Survival Kit
          </h1>
          <p className="text-ink-muted text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Everything you need to settle into Pent, Evandy, TF, and Main Campus Halls without getting overcharged.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-7">
            {HALL_BADGES.map((badge) => (
              <span
                key={badge}
                className="bg-white text-ink text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-full border border-rule shadow-sm"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── The 4 Survival Pillars ── */}
      <section className="px-4 sm:px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.title}
                className="card-lift bg-white rounded-2xl border border-rule p-6 sm:p-7 flex flex-col shadow-sm hover:border-gold/60"
              >
                <div className="text-4xl mb-4">{pillar.emoji}</div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-ink mb-2">{pillar.title}</h2>
                <p className="text-ink-muted text-sm leading-relaxed mb-5">{pillar.description}</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  {pillar.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center gap-1.5 bg-gold text-charcoal text-sm font-bold px-5 py-2.5 rounded-full hover:bg-gold/90 transition-colors shadow-sm shadow-gold/25"
                    >
                      {link.label} <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
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
        <div className="max-w-4xl mx-auto bg-ink rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(201,162,39,0.12), transparent 70%)' }}
          />
          <div className="relative">
            <p className="font-serif-accent text-xl sm:text-2xl text-gold mb-3">Can&apos;t find it listed?</p>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
              Looking for something specific?
            </h2>
            <p className="text-white/60 text-sm sm:text-base max-w-xl mx-auto leading-relaxed mb-7">
              Post a request on our Wanted Board and senior students will message you on WhatsApp.
            </p>
            <Link
              href="/requests"
              className="inline-flex items-center gap-2 bg-gold text-charcoal text-sm sm:text-base font-bold px-8 py-3.5 rounded-full hover:bg-gold/90 transition-colors shadow-lg shadow-gold/25"
            >
              📋 Post on the Wanted Board →
            </Link>
          </div>
        </div>
      </section>

      {/* ── WhatsApp Share Bar ── */}
      <section className="sticky bottom-0 z-30 px-4 pb-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              '⚡ Level 100 at UG? This Fresher Survival Kit has everything you need — kettle, laptop, past questions, braiding, all from students on campus 👉 https://campuspluggh.com/fresher-kit'
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white text-sm sm:text-base font-bold px-6 py-4 rounded-2xl shadow-xl hover:brightness-105 transition-all"
          >
            📲 Share Survival Kit with Roommates
          </a>
        </div>
      </section>

      {/* ── Footer spacing so the sticky bar never covers content ── */}
      <div className="h-6" />
    </main>
  )
}
