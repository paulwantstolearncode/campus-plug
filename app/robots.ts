import type { MetadataRoute } from "next";

// robots.txt. Disallow entries are prefix matches, so /admin also covers
// /admin/sales and /dashboard covers /dashboard/record-sale etc. Only
// routes that actually exist are listed (the app has no /signup or
// /api/* routes — /login handles both sign-in and sign-up).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/new", "/dashboard", "/auth"],
    },
    sitemap: "https://campuspluggh.com/sitemap.xml",
  };
}
