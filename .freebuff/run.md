# Campus Plug — run doc

Next.js 16 (App Router) + Supabase. Package manager: npm.

## Reproduce the uncommitted artifacts

A fresh checkout needs two things that are not committed:

1. **`.env.local`** — copy it from the main checkout (`C:\Users\Owner\Projects\campus-plug`).
   It holds only the Supabase URL + anon key (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
   Never commit it; never log the values.
2. **`node_modules`** — install with `npm install` (uses `package-lock.json`).

Note: in the current layout the main checkout and the working workspace are the same directory,
so `.env.local` and `node_modules` are already present. In a separate worktree, copy/install as above.

## Run the server

- Default: `npm run dev` → `next dev` on port 3000.
- To match the live preview port: `npm run dev -- -p 53615`.
- Pick any free port if 3000 is taken; there is no port pinned in config (`next.config.ts` is empty).

The dev server watches the source, so code edits hot-reload; no rebuild step is needed for preview.
