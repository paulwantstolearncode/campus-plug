# Postmortem: profiles RLS infinite recursion (42P17)

- **Status:** RESOLVED (fixed manually in production; repo files verified clean and parse-valid)
- **Date:** 2026-08-11
- **Commit:** `6336bdc` (fix + backup/restore scripts), `[pending]` (postmortem + copy warning)

---

## Incident 1 — the recursion bug

### Symptom
Users on `/become-seller` filled in their WhatsApp number, hit **Apply to Sell**, and got the alert **"Something went wrong. Please try again."** The browser console showed a `500` on `PATCH /rest/v1/profiles?...&select=id` (the form's `update({ whatsapp_number, seller_status: 'pending' }).select('id')` call). The page load itself worked.

### Diagnosis
A diagnostic script reproduced the exact update as an authenticated user and surfaced the real error:

```
ERROR: 42P17: infinite recursion detected in policy for relation "profiles"
```

Root cause: `supabase/harden_profiles_rls.sql` enforced the no-escalation rules in the UPDATE policy's `WITH CHECK` using subqueries that re-read the same table:

```sql
with check (
  auth.uid() = id
  and is_admin is not distinct from (
    select p.is_admin from public.profiles p where p.id = auth.uid()
  )
  ...
)
```

Policy expressions are subject to RLS on the tables they read, so those subqueries re-enter `profiles`. Once the SELECT-policy graph in production closed a cycle, Postgres raised 42P17 on **every** profiles UPDATE. RLS denials return 403 (or 200 with zero rows) — a 500 means the statement itself errored, which is what pointed at the policy.

### Fix
Escalation rules moved out of the recursive policy into a `BEFORE UPDATE` trigger (`prevent_profile_escalation`) that compares `OLD` vs `NEW` directly — no table reads, therefore recursion-free:

- `is_admin` / `is_seller` — cannot change (admins excepted)
- `seller_status` — owner may only set it to `'pending'` (admins excepted)
- admins and the SQL editor (no JWT) are trusted, so manual admin grants still work

The UPDATE policy itself became the plain `using (auth.uid() = id) with check (auth.uid() = id)`. All hardening is preserved; nothing about the trigger reads the table it guards.

**Files:** `supabase/fix_profile_update_recursion.sql` (prod fix), `supabase/harden_profiles_rls.sql` (canonical version updated to the same approach), `supabase/backup_profiles_before_rls_fix.sql` + `supabase/restore_profiles_from_backup.sql` (pre-change safety net), `supabase/debug_seller_status.sql` (the diagnostic).

### Lesson (bug)
Never write a policy that reads the table it guards — even "harmlessly" via a plain-predicate subquery — because the recursion risk depends on the *entire* policy graph, which can change later. Column-restriction rules belong in a BEFORE UPDATE trigger comparing `OLD`/`NEW`, or in column-level grants.

---

## Incident 2 — "corrupted" SQL file report

### What happened
The founder ran `fix_profile_update_recursion.sql` and hit a syntax error at line 85: the pasted content appeared to contain **both** the old recursive `WITH CHECK` subqueries and the new clean `auth.uid() = id`, plus duplicate `CREATE POLICY` / `CREATE FUNCTION` blocks. The file in the repo looked merged/duplicated.

### Investigation result: the repo file was never corrupted
- `git diff HEAD` for both SQL files is **empty** — the committed versions (in `6336bdc`) are byte-identical to the working copy.
- The file has exactly **one** commit in its history. No merge, no automation, no second write.
- Structure checks: `fix_profile_update_recursion.sql` contains exactly **1** `CREATE POLICY`, **1** `CREATE FUNCTION`, **1** `CREATE TRIGGER`. `harden_profiles_rls.sql`: **5** policies, **2** functions, **1** trigger. No recursive pattern (`select p.is_admin from public.profiles`) anywhere.
- **Real PostgreSQL grammar validation** (`pgsql-parser`, a WASM build of `libpg_query` — the same parser Postgres itself uses): all five SQL files parse cleanly, with the exact expected statement counts.

### Most likely mechanism
Corruption in transit, not in the repo: copying the script from a **rendered view** (chat, GitHub web UI, email) can merge, drop, or duplicate lines. This exact failure mode already bit this project once — `supabase/ensure_bundle_policies.sql` carries the warning *"Don't copy from chat or a rendered view — that's how the content got truncated last time."* The "merged old + new" appearance is what a line-merge during paste looks like.

### Prevention (process rule — now in effect)
1. **Copy SQL only from the local file** (open → Ctrl+A → copy → paste into the Supabase SQL editor), never from a rendered view.
2. **Before running a migration**, verify the structure: each expected block appears exactly once (`CREATE POLICY`, `CREATE FUNCTION`, `CREATE TRIGGER`), and no block looks merged.
3. **Before considering an SQL file complete**, validate it parses with the real Postgres grammar. One-shot method (no permanent dependency, ~10s):

   ```bash
   npm install --prefix .sqlcheck pgsql-parser --no-save --no-audit --no-fund
   node -e '
     (async () => {
       const { loadModule, parse } = require("./.sqlcheck/node_modules/pgsql-parser");
       await loadModule();
       const fs = require("fs");
       for (const f of process.argv.slice(2)) {
         try { await parse(fs.readFileSync(f, "utf8")); console.log("OK  " + f); }
         catch (e) { console.log("FAIL " + f + ": " + e.message); }
       }
     })();
   ' supabase/*.sql
   rm -rf .sqlcheck
   ```

   (The `--prefix` + `--no-save` flags keep the parser out of `package.json`/`node_modules` of the app.)
