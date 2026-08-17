import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";

// Build-time sitemap. Next.js does NOT resolve relative sitemap URLs
// against metadataBase, so absolute URLs are built from SITE_URL (the
// same constant that feeds metadataBase in app/layout.tsx).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, priority: 1.0, changeFrequency: "daily" },
    { url: `${SITE_URL}/services`, priority: 0.9, changeFrequency: "daily" },
    { url: `${SITE_URL}/become-seller`, priority: 0.7, changeFrequency: "monthly" },
  ];

  // Dynamic: approved listings only, via the anon client so RLS decides
  // what is public (draft/pending/rejected never leave the DB). The
  // listings table has no updated_at column, so lastModified uses
  // created_at. Any failure (missing env, DB down, schema drift) falls
  // back to just the static routes so the build never breaks.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: listings, error } = await supabase
      .from("listings")
      .select("id, created_at")
      .eq("approval_status", "approved");

    if (error || !listings) return staticRoutes;

    const listingRoutes: MetadataRoute.Sitemap = listings.map((l) => ({
      url: `${SITE_URL}/listing/${l.id}`,
      priority: 0.8,
      changeFrequency: "weekly",
      lastModified: l.created_at,
    }));

    return [...staticRoutes, ...listingRoutes];
  } catch {
    return staticRoutes;
  }
}
