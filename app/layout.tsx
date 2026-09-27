import type { Metadata, Viewport } from "next";
import "./globals.css";
import HelpButton from "./HelpButton";
import FeedbackButton from "./components/FeedbackButton";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { Analytics } from "@vercel/analytics/react";
import { Space_Grotesk, Plus_Jakarta_Sans, Instrument_Serif } from "next/font/google";
import { SITE_URL } from "@/lib/site";

// Global default share card — rendered by the /api/og edge route (no params =
// the branded default card). Pages with their own openGraph.images (listings,
// requests, categories) override this.
const DEFAULT_OG_IMAGE = `${SITE_URL}/api/og`

// ── Design-system type stack ──────────────────────────────────────
// Space Grotesk  → display headings (geometric, confident editorial voice)
// Plus Jakarta   → body/UI copy (clean, modern, highly legible)
// Instrument Serif → italic keyword accents ("guesswork", "plug")
// All self-hosted via next/font with font-display: swap — never causes CLS.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400"],
  variable: "--font-serif-accent",
  display: "swap",
});


// Explicit viewport export (Next.js App Router convention) — keeps the mobile
// layout viewport pinned to device width and guards against any environment
// (stale cache / injected meta) serving a desktop-width viewport.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  // Canonical origin for all generated metadata URLs (OG, canonical, sitemap)
  // — the site moved from the Vercel preview domain to campuspluggh.com.
  metadataBase: new URL(SITE_URL),
  title: "Campus Plug — Student Marketplace at University of Ghana",
  description: "Campus Plug is a student marketplace for the University of Ghana community. Browse verified student sellers offering services like braiding, tutoring, home-cooked meals, phone repairs, and products. Message sellers directly on WhatsApp to book.",
  keywords: ["campus plug", "UG marketplace", "student services Ghana", "University of Ghana", "book services"],
  openGraph: {
    title: "Campus Plug",
    description: "Campus Plug is a student marketplace for the University of Ghana community. Browse verified student sellers offering services like braiding, tutoring, home-cooked meals, phone repairs, and products. Message sellers directly on WhatsApp to book.",
    url: SITE_URL,
    siteName: "Campus Plug",
    locale: "en_GH",
    type: "website",
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Campus Plug — Student Marketplace at University of Ghana",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Campus Plug",
    description: "Campus Plug is a student marketplace for the University of Ghana community. Browse verified student sellers offering services like braiding, tutoring, home-cooked meals, phone repairs, and products. Message sellers directly on WhatsApp to book.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${spaceGrotesk.variable} ${instrument.variable}`}>
      <body>
        {children}
        <HelpButton />
        <FeedbackButton />
        <PWAInstallPrompt />
        <Analytics />
      </body>
    </html>
  );
}
