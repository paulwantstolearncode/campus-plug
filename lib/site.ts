// Single source of truth for the site's canonical origin. Used by both
// app/layout.tsx (metadataBase + openGraph.url) and app/sitemap.ts —
// Next.js does NOT resolve relative sitemap URLs against metadataBase,
// so the sitemap builds absolute URLs from this constant directly.
export const SITE_URL = "https://campuspluggh.com";
