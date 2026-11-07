# Feature checklist (v0.3)

✅ implemented, **not yet run by the author** (verify with README step 6) · 🟡 partial · ⏳ pending

## Foundation
- ✅ Register, sign in/out, forgot/reset password, profile, change password
- ✅ Invitations: emailed through the `invite-user` Edge Function (deploy required), copy-link fallback, auto-accept on sign-in with the same email
- ✅ Add member directly (owner/admin enters name, email, password; `add-member` Edge Function, no email confirmation needed)
- ✅ Multiple businesses, create/edit/archive, switcher + all-business view, role per business, deactivate members
- ✅ RLS, column grants, role-escalation guards, audit log (businesses, members, invitations, customers, leads, projects, task deletes)

## Premium UI
- ✅ Design tokens, light/dark, responsive sidebar groups, command palette (Ctrl/⌘ K), skeleton loaders, toasts, confirmation prompts
- 🟡 shadcn-*style* components (no Radix/shadcn CLI); `window.confirm` used for confirmations

## Employee access (v0.3)
- ✅ Employees can create tasks for themselves, edit/delete their own personal tasks, update status/notes on assigned tasks, tick and add checklist steps, comment
- ✅ Employees can add customers (assigned to themselves), edit their own customers, log interactions, set follow-ups
- ✅ Employees can add leads (assigned to themselves), edit/move/convert their own leads, delete leads they created
- ✅ Leave requests with manager approval, notifications both ways, "who is away" view
- ✅ My day panel on the dashboard, quick-add (+) button, stale-lead badge (no activity for 7+ days), checklist progress on tasks
- Employees still cannot: assign work to others, reassign/archive customers, import/export CSV, create projects, change roles, see others' leave or other people's customers/leads

## CRM & operations
- ✅ Customers: search, filters, sort, server pagination, add/edit/archive, tags, consent, duplicate detection, activity timeline, CSV import/export (formula-injection safe)
- 🟡 Customers: no segments/saved views, complaints/feedback records, purchase history (needs sales module)
- ✅ Leads: Kanban with drag-and-drop, stage reasons for Lost, convert to customer without duplicates, conversion/source/lost-reason report, expected values
- 🟡 Leads: pipeline stages are seeded and DB-configurable; no stage editor UI; no separate "deals" entity
- ✅ Tasks: list, board, calendar, filters (incl. project), search, comments, overdue badges, restricted employee updates, projects link
- 🟡 Tasks: checklists done; attachments and recurring templates still pending
- ✅ Projects: progress computed from task status, overdue flag, owner, status
- 🟡 Projects: no milestones, files, comments
- ✅ Automation: overdue task notices, lead follow-up tasks, customer follow-up reminders (pg_cron)
- ✅ Dashboard: task KPIs, lead KPIs, follow-ups due, active projects, workload and business-comparison charts (database RPCs, not sample data)
- 🟡 Dashboard: no date-range filter

## Tests
- ✅ `supabase/tests/rls_test.sql`, `rls_test_crm.sql`; Vitest for utils + CSV
- ⏳ Browser/e2e tests

## Pending (Phases 3–4)
⏳ Inventory & suppliers, sales/invoices/payments, income/expenses, financial reports, Hangout Corner/ECS modules, marketing, support, reports, workflow-rule UI, WhatsApp/email/SMS, file storage & attachments, leave/attendance.
