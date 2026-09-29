<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- App pages live under `src/routes/_authenticated/` and read/write data via the browser database client with React Query hooks in `src/lib/data.ts` — row-level security enforces admin-only writes.
- Admin permission = `user_roles` table + `has_role()`; the first signed-up account becomes admin via a signup trigger — keeps roles off user records.
- Roles: admin / manager / user(employee) in `user_roles`; admin-only RPCs `admin_set_user_role` / `admin_set_user_active` change them — no direct writes to user_roles.
- Challenge notifications and manager replies are database-backed; `manager_reply` mirrors legacy `resolution_notes`, and Realtime synchronizes views.
- Org logo is stored as a small data URL in `org_settings.logo_url` because public storage buckets are blocked in this workspace.
- KPI targets live on `departments` (target_* columns); SLA hours and session timeout live on `org_settings` — single source for admin-configured rules.
- Admin/staff-only routes are listed in ADMIN_PATHS/STAFF_PATHS (`src/lib/data.ts`) and enforced in AppShell, with RLS as the real guard.
- Excel import/export uses the `xlsx` package client-side — no server needed.
- Public signup is disabled; accounts are created via server functions in src/lib/accounts.functions.ts (one-time first-admin setup when no admin exists, then admin-only createUserAccount) — internal system, no self-registration.
- AI complaint analysis: `planAnalysis` pre-filters (skip unchanged via `complaint_analysis.input_hash`, local results for empty descriptions and single strong routing-rule matches), then client runs `analyzeComplaints` in 20-item batches, 4 in parallel — faster runs, keys server-side.
- Complaint audit trail lives in `complaint_events` (client-inserted, RLS-scoped to staff or the assigned employee) — separate from the general activity_logs.
- Role homes: /dashboard renders ManagementHome (admin/supervisor) or EmployeeHome by role (src/components/RoleHomes.tsx); employees table and others' challenges are readable by staff only via RLS — employees see only their own work.
- AI knowledge base: `ai_knowledge` table + private `ai-knowledge` bucket gated by `can_manage_ai()` (admin or `ai_trainer` role); answers come from `askKnowledge` server fn, and the only AI provider call lives in `src/lib/ai-provider.server.ts` — keeps keys server-side and answers grounded only in uploaded knowledge.
- `ai_trainer` role sees only /ai-feed, /ai-test, /settings (TRAINER_PATHS in src/lib/data.ts, enforced in AppShell) — isolates trainers from complaint data.
- Per-complaint AI analysis stored in `complaint_kb_analysis` (server fn src/lib/complaint-kb.functions.ts reads ai_knowledge via admin client only after RLS confirms the caller can see the complaint); `complaint_attachment_analysis` reserved for future attachment analysis — keeps knowledge private and grounded.
- Complaint attachments: private `complaint-attachments` bucket (folder = complaint id, gated by can_access_complaint); OCR runs in the browser via swappable provider in src/lib/ocr.ts (Tesseract), AI comparison in src/lib/attachment-analysis.functions.ts — free OCR, keys server-side, recommendation only.
- Departments & routing: `departments` (manager/handling_hours/guidelines), `department_rules`, `department_files` (files stored in `ai-knowledge` bucket + mirrored into `ai_knowledge`), `department_alerts` filled hourly by `check_department_delays()` via pg_cron; department suggestion in analyzeComplaintKb is deterministic rule matching and only staff can approve forwarding — explainable, no auto-routing.
- Quality notes: `quality_notes` + `quality_note_events`; clients only SELECT/INSERT, every status change goes through `quality_note_action()` RPC so each role can do only its step; employees see a note only after the supervisor sends it.
- Supervisor impersonation: admin-only server fn issues a one-time magic-link token for a `manager` account; admin's own session is kept in sessionStorage to return; start/end logged in activity_logs.
- Quality files: `quality_files` table + private `quality-files` bucket gated by `is_quality()` (quality or admin), upload/delete logged to activity_logs by trigger — keeps quality documents away from other roles.
- App emails go through Lovable managed email (src/lib/email-templates, sender notify.scbc.gov.sa); quality-note alerts sent from emailQualityNote server fn and logged in quality_note_events — no queues or email tables.
- Quality bulk import: Excel parsed client-side (src/components/QualityImport.tsx), people matched via `quality_directory()` RPC, notes inserted with import_id, each run logged in `quality_imports` (+activity_logs trigger) — same RLS and note workflow as manual notes.
- All file uploads use the shared `FileDrop` component (src/components/FileDrop.tsx: drag & drop + picker button, name/size/status) — one consistent upload UI; new uploads must reuse it.
- Quality AI assistant: separate `quality_knowledge` table (files in `quality-files` bucket under kb/) + `quality_ai_usage` log, gated by `is_quality()`; server fns in src/lib/quality-ai.functions.ts read it with the caller's RLS — keeps quality knowledge isolated from the general AI knowledge base.
- Related complaints: links store AI evidence; `complaints.is_follow_up` and `follow_up_*` are canonical for counts/filters; both saves must succeed — never auto-merges/closes.
- Custom watch lists: `watch_lists` + `watch_list_members` (kind employee/supervisor), admin-managed; `check_department_delays()` routes overdue / no-action (24h) / stale-update (48h) alerts via `route_smart_alert()` to list supervisors when the employee is linked, else to the department default, logging to `watch_alerts` — layered on existing alerts, distribution untouched.
- Smart alerts: `watch_alerts` is the alert record (status new/seen/closed, reason, required_action); delivery via `notifications.alert_id`; seen/close only through `alert_action()` RPC which logs to `watch_alert_events` + activity_logs; visibility via `can_see_alert()` — one record per alert, alerts never change complaint status.
- Bulk user import: Excel parsed client-side (src/components/BulkUsersImport.tsx) with preview/validation, accounts created by admin-only `bulkCreateUsers` server fn, one activity_logs entry per run — reuses existing roles and page access.
- Early warning: `problem_warnings` table filled by staff-only `scanEarlyWarnings` server fn (src/lib/early-warning.functions.ts, deterministic clustering by category+service+description keywords, ≥3 in 72h) via `upsert_problem_warning()` RPC which notifies admins/managers — read-only insight, never touches complaints; CRM complaints are covered once stored in `complaints`.
- Smart complaint analyst: staff-only `runComplaintAnalysis` server fn (src/lib/complaint-analyst.functions.ts) aggregates complaints with the caller's RLS, sends only aggregates + short samples to AI, saves results in `complaint_analyses` — read-only, grounded in platform data.
- Admin tasks: `admin_tasks` + `admin_task_events` (admin-only RLS, triggers log every change to events + activity_logs and notify the assignee); AI execution via admin-only `executeAdminTaskAI` (src/lib/admin-tasks.functions.ts), read-only over platform data — independent of complaints, extendable via exec_type.
