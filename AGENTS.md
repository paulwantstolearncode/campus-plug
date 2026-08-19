<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Non-negotiable ground rules

These rules keep this project safe. Every AI agent working on this repo must follow them.

### SQL-first deploys
Run any new SQL migration in Supabase BEFORE pushing code that depends on it. Pushing a form field that references a column that doesn't exist breaks production. Landing page has migration-safe fallbacks, but the pattern is: SQL first, then push.

### RLS conventions
- Use `DROP POLICY IF EXISTS` + `CREATE POLICY` for idempotency
- Order SQL as: CREATE TABLE → ALTER TABLE ENABLE RLS → DROP POLICY IF EXISTS → CREATE POLICY → CREATE INDEX
- Use `public.is_admin()` (SECURITY DEFINER helper) for admin checks
- NEVER use raw `SELECT 1 FROM profiles WHERE id = auth.uid()` subqueries inside RLS policies — this caused a 42P17 infinite recursion incident that took down production

### Never modify without permission
- Auth (Supabase Auth config, session handling, RLS on `profiles`)
- Sentry setup
- Vercel Analytics
- Resend email setup
- Existing seller reviews system
- This file (AGENTS.md), CLAUDE.md, or HANDOFF.md

If a task requires changes to any of these, ask the user first.

### Code conventions
- Use `formatName()` helper for all name displays (privacy)
- CRLF line endings on Windows
- `.env.local` holds Supabase keys (never commit)
- Preview server runs on port 56816 via `nohup npm run dev -- -p 56816`

### Validation before shipping
- `npx tsc --noEmit` — 0 errors
- `npx eslint` on touched files — 0 errors
- `npm run build` — clean
- For SQL files: `node .sqlcheck/check.js <file>`

### Design system
- Charcoal `#0f0f0f` + gold `#d4af37` on off-white `#f8f8f8`
- `rounded-3xl` cards, `rounded-full` buttons
- GH₵ currency
- Playfair Display serif italic gold for accent words in headings

### Repository facts
- Repo: github.com/paulwantstolearncode/campus-plug (origin/main)
- Live: campuspluggh.com
- Local path: C:\Users\Owner\Projects\campus-plug
- Do NOT commit: `.sqlcheck/`, `.freebuff/`, `.claude/`, `.claude-flow/`, `.swarm/`, `.agents/`, `.mcp.json`, `opencode.json`

### Testing limits
- Screenshot capture is not available in the Freebuff webview — use DOM inspection instead
- Real-device testing (iOS Safari, physical iPhone) happens on the user's device
- `/new` form and admin-panel interactions need real logins (seller/admin) to test end-to-end
