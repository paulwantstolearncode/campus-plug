# Legon Noticeboard — Campus Plug Design System

## Brand Essence

**Campus Plug is the verified student-to-student service directory that makes trusted campus help feel one message away.**

Personality: **grounded, discerning, warm.**

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Charcoal** | `#0f0f0f` | Primary text, dark backgrounds, nav bars |
| **Plug Gold** | `#d4af37` | Functional highlights only: price pills, top-rated badges, heart icons, CTA buttons, selection highlight, scrollbar |
| **Gold Light** | `#e8c66d` | Gradient midpoint for shine buttons |
| **Gold Dark** | `#b8941f` | Hover states for gold buttons |
| **Off-White** | `#fafafa` | Section backgrounds, card surfaces |
| **White** | `#ffffff` | Card backgrounds, nav backgrounds |
| **Background** | `#ffffff` | Page background |

### Color Rules
- Gold (`#d4af37`) is strictly for **functional highlights** — price displays, badges, active states, CTAs
- Gold is **never** used for large background fills or decorative surfaces
- Charcoal + white + off-white form the neutral base
- Gradient backgrounds use dark navy tones (`#1a1a2e`, `#16213e`) for hero sections

## Typography

### Fonts
- **Headlines**: Playfair Display (serif, italic) — used ONLY for the `font-serif-accent` class on hero keywords ("guesswork", "works", "category", "Plug", "specific")
- **Body/UI**: System font stack (Manrope when available, fallback to `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- **Section numbers**: Uppercase, tracking-widest, gold color, font-semibold

### Type Scale
- Hero headline: `text-5xl sm:text-6xl md:text-7xl lg:text-8xl` — bold, tight leading `[0.95]`
- Section headline: `text-4xl md:text-5xl` — bold
- Card title: `text-lg` — bold
- Body text: `text-lg md:text-xl` — gray-600
- Labels: `text-sm` — font-semibold
- Micro labels: `text-xs` or `text-[10px]` — uppercase, tracking-widest, font-bold

## Spacing & Layout

- Max width: `max-w-7xl` (marketplace), `max-w-5xl` (content), `max-w-3xl` (text-focused)
- Section padding: `py-20 md:py-28`
- Card padding: `p-6 md:p-10`
- Grid gaps: `gap-6 md:gap-8`

## Components

### Navigation Bar
- Fixed top, z-50, transparent → white/80 backdrop-blur on scroll
- Logo: emoji + bold text, group-hover:rotate-12
- Nav links: text-sm font-medium, hover:text-gold
- CTA: bg-charcoal text-white rounded-full

### Listing Card
- `rounded-3xl`, `shadow-xl`, `hover:shadow-2xl`, `hover:-translate-y-2`
- Border: `border-gray-200/80` (Gazette hairline)
- Image: aspect-square, `group-hover:scale-110` transition
- Price pill: absolute top-right, `bg-gold text-charcoal rounded-full`
- Type badge: absolute top-left, glass effect
- Heart icon: absolute below price pill (top-16 right-3), white/80 backdrop-blur
- Seller row: avatar initial, name, verified mark
- CTA buttons: bg-charcoal rounded-full, hover:bg-black

### Hero Section
- Animated gradient background (dark navy)
- Floating blobs: `bg-gold/20` with blur-3xl, 20s float animation
- Grid pattern overlay at 3% opacity
- Social proof pill: glass-light, live ping dot
- Trust badge: shield SVG in gold, uppercase tracking-widest

### Gazette Section Numbers
- Pattern: `01 / FEATURED`, `02 / EXPLORE CATEGORIES`, `03 / HOW IT WORKS`, `04 / WANTED BOARD`
- Style: `text-gold text-sm font-semibold`, inline-flex with charcoal/25 separator

### Buttons
- Primary: `bg-charcoal text-white rounded-full font-semibold hover:bg-black shadow-xl`
- Gold CTA: `bg-gold text-charcoal rounded-full font-bold hover:bg-gold-dark shadow-gold/25`
- Shine: animated gold gradient sweep (3s infinite)
- Ghost: `glass-light text-charcoal border border-gray-200`
- All buttons: `hover:scale-105` or `hover:scale-[1.02]` on hover, `active:scale-[0.97]` on press

### Forms
- Inputs: `rounded-2xl border-2 border-gray-200 focus:border-gold`
- Labels: `text-sm font-semibold text-charcoal mb-2`
- Error states: `border-red-500` with `text-xs text-red-500`
- Submit buttons: full-width, rounded-2xl, shadow-lg

## Animations

### Entrance
- `fade-up`: translateY(20px) → 0, opacity 0 → 1, 0.8s ease-out
- Staggered delays: 0.1s increments via `.fade-up-delay-N`
- Card stagger: 50ms per card via inline `animationDelay`

### Continuous
- `gradient-shift`: background-position 0%→100%, 15s ease infinite
- `float`: translate + scale oscillation, 20s ease-in-out infinite
- `shine`: background-position sweep, 3s linear infinite

### Interaction
- Card lift: `hover:-translate-y-2 hover:shadow-2xl`, 500ms
- Image zoom: `group-hover:scale-110`, 700ms
- Button scale: `hover:scale-105`, `active:scale-[0.97]`

### Reduced Motion
- `@media (hover: none) and (pointer: coarse)` disables gradient, blob, and shine animations for touch devices

## Grain Texture

Optional editorial overlay: `.grain` class adds a fixed SVG fractal noise texture at 3.5% opacity. Used on landing pages for a warm paper feel.

## Responsive Breakpoints

- `sm` (640px): stack → grid
- `md` (768px): show desktop nav, 2-col grids
- `lg` (1024px): 3-col grids, max-width containers
- `xl` (1280px): 4-col grids

## Microcopy Guidelines

- CTAs use action verbs: "Explore the plug", "Browse the board", "Put it on the board", "Message seller", "Pitch on WhatsApp"
- Trust signals: "The trusted plug for UG", "Every listing reviewed by a real person"
- Empty states: friendly emoji + clear next action
- Error states: "⚠️" prefix, plain language, retry guidance

## Dark Sections

- Background: `bg-gradient-to-br from-charcoal to-black`
- Text: white with white/70 for secondary
- Gold accents: `text-gold` for emphasis keywords
- Floating blobs: `bg-gold/20` with blur

## Footer

- Background: `bg-charcoal`
- Text: white/60 for links, white for logo
- Hover: `hover:text-gold`
- Separator: `border-t border-white/10`
- Legal: text-xs text-white/40
