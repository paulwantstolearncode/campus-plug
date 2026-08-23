import type { Metadata, Viewport } from "next";
import "./globals.css";
import HelpButton from "./HelpButton";
import FeedbackButton from "./components/FeedbackButton";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { Analytics } from "@vercel/analytics/react";
import { Playfair_Display, Manrope, DM_Serif_Display, IBM_Plex_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site";

// Editorial serif accent — used ONLY for italic gold keywords (hero
// "guesswork", section headers). Self-hosted via next/font with
// font-display: swap (default) so a font swap never causes CLS.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400"],
  variable: "--font-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "700"],
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
  },
  // No OG image asset exists yet, so advertise the plain summary card — a
  // "summary_large_image" card with no images configured renders image-less.
  // Add openGraph.images + twitter.images when a real 1200x630 asset is ready.
  twitter: {
    card: "summary",
    title: "Campus Plug",
    description: "Campus Plug is a student marketplace for the University of Ghana community. Browse verified student sellers offering services like braiding, tutoring, home-cooked meals, phone repairs, and products. Message sellers directly on WhatsApp to book.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${manrope.variable} ${dmSerif.variable} ${ibmPlexMono.variable}`}>
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