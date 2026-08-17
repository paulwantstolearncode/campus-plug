import type { Metadata, Viewport } from "next";
import "./globals.css";
import HelpButton from "./HelpButton";
import { Analytics } from "@vercel/analytics/react";
import { Playfair_Display } from "next/font/google";

// Editorial serif accent — used ONLY for italic gold keywords (hero
// "guesswork", section headers). Self-hosted via next/font with
// font-display: swap (default) so a font swap never causes CLS.
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
  title: "Campus Plug 🔌 — The Student Marketplace",
  description: "Book trusted services from verified UG students. Hair braiding, tutoring, tech support, photography, and more — all in one place.",
  keywords: ["campus plug", "UG marketplace", "student services Ghana", "University of Ghana", "book services"],
  openGraph: {
    title: "Campus Plug 🔌",
    description: "The premium marketplace for UG students. Every student. Every skill. One plug.",
    url: "https://campus-plug-oukb.vercel.app",
    siteName: "Campus Plug",
    locale: "en_GH",
    type: "website",
  },
  // No OG image asset exists yet, so advertise the plain summary card — a
  // "summary_large_image" card with no images configured renders image-less.
  // Add openGraph.images + twitter.images when a real 1200x630 asset is ready.
  twitter: {
    card: "summary",
    title: "Campus Plug 🔌",
    description: "Book trusted services from verified UG students.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={playfair.variable}>
      <body>
        {children}
        <HelpButton />
        <Analytics />
      </body>
    </html>
  );
}