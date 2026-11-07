# Multi-Business CRM: v0.3 (Foundation + CRM core + employee access)

React + TypeScript + Vite + Tailwind + Supabase (Auth, Postgres, RLS) + Vercel.
See `docs/ARCHITECTURE.md` (tables, permissions, plan) and `FEATURES.md` (done / partial / pending).

## 1. Supabase
1. supabase.com → New project.
2. **SQL Editor** → run `supabase/migrations/0001_foundation.sql`, then `0002_crm_core.sql`, then `0003_employee_access.sql`. (Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. **Authentication → URL Configuration:** set *Site URL* to your Vercel URL (use `http://localhost:5173` while developing) and add both to *Redirect URLs*.
4. **Authentication → Providers → Email:** keep "Confirm email" ON (invitations rely on a verified email).
5. **Project Settings → API:** copy *Project URL* and the *anon public* key. Never use the `service_role` key in this app.

## 2. Run locally
```bash
npm install
cp .env.example .env      # fill in the two values
npm run dev               # http://localhost:5173
npm test                  # unit tests
npm run build             # type-check + production build
```
First user: **Create account**, confirm email, sign in, then **Businesses → New business** (you become its owner).
Optional dev data: edit the email in `supabase/seed.sql` and run it in the SQL editor (Hangout Corner, ECS Technologies, Other Business + sample tasks).

## 3. Inviting people (email)
Employees → Invite someone. Invitees join automatically when they sign in with that exact email.
To send the email, deploy the Edge Function once (CLI installed and project linked):
```bash
supabase functions deploy invite-user
supabase secrets set SITE_URL=https://your-app.vercel.app
```
Until then the page shows a copy-link fallback. Existing accounts are not re-invited; they just sign in.

## 3b. Automation (overdue + follow-ups)
Run `supabase/cron.sql` once in the SQL editor. It schedules `run_automation()` every 30 minutes (idempotent).
Test it any time with `select public.run_automation();`.

## 4. GitHub Desktop
1. Unzip the project. GitHub Desktop → **File → Add local repository** → choose the folder → "create a repository" → Create.
2. Commit ("Initial commit") → **Publish repository** (keep it private).
CLI alternative: `git init && git add . && git commit -m "Initial commit" && git branch -M main && git remote add origin <url> && git push -u origin main`.

## 5. Vercel
1. vercel.com → Add New → Project → import the GitHub repo (Framework: Vite is auto-detected).
2. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Deploy. Then add the Vercel URL to Supabase *Site URL / Redirect URLs* (step 1.3). `vercel.json` handles SPA routing.

## 6. Verify (do this before relying on it)
- `supabase/tests/rls_test.sql` and `rls_test_crm.sql`: run on a **dev** project (psql or SQL editor). They create fake users, check cross-business and role boundaries, print `RLS tests passed` / `RLS CRM tests passed`, and roll back.
- Manual: two accounts, two businesses; confirm neither sees the other's data; employee cannot edit task title/assignee.
- `npm run build` must succeed.

## 7. Backup and recovery
- Supabase Dashboard → Database → Backups (daily backups on paid plans; enable Point-in-Time Recovery for production).
- Manual dump: `pg_dump "<connection string from Settings → Database>" -Fc -f backup_$(date +%F).dump`
- Restore into a fresh project: `pg_restore --no-owner -d "<new connection string>" backup.dump`. Keep dumps outside the repo (they contain data).

## Maintenance notes
- Every new table needs `enable row level security`, explicit policies, and explicit `grant`s (migration 0001 revokes default grants; new tables don't inherit that).
- Supabase returns at most 1000 rows per request; list screens paginate and CSV import/export page through results.
- Add new migrations as `supabase/migrations/000N_name.sql`; never edit applied ones.
- Archived businesses are hidden but not write-locked at the DB level yet.

## Add member directly (no sign-up needed)
Employees → "Add member directly". One-time setup: Supabase dashboard → **Edge Functions → Deploy a new function → Via Editor**, name it `add-member`, paste `supabase/functions/add-member/index.ts`, Deploy. The same steps work for `invite-user` (email invites; also set the `SITE_URL` secret).
