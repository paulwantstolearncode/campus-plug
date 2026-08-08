import type { Metadata } from "next";
import "./globals.css";
import HelpButton from "./HelpButton";
import { Analytics } from "@vercel/analytics/next";

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
    <html lang="en">
      <body>
        {children}
        <HelpButton />
        <Analytics />
      </body>
    </html>
  );
}