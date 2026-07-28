# Ranmi — Comprehensive Platform Build Prompt

**This is a documentation deliverable only.** No code in this repo was changed to produce
this document — it describes the real-estate capital-introduction platform exactly as it
is built and running today (confirmed via `git diff` against the last known-good commit
and a clean `tsc --noEmit`), module by module, plus how the Claude API/AI research engine
works underneath all of it. Where the project-scoped taxonomy feature already generalizes
part of the system, that's called out — nothing else here reflects speculative future
work.

---

## 0. What Ranmi is

A research-grade institutional investment manager database, BD/outreach CRM, and
AI-powered sourcing platform for a boutique capital-introduction operation. Seven modules,
one shared data spine (`Firm` → `Contact`/`CrmStageRow`/`ActivityLog`/`EmailThread`/
`Meeting`/`Task`), and one AI layer (Claude, with server-side web search/fetch) that feeds
research and classification into that spine.

**Stack:** Next.js (App Router) + TypeScript, Tailwind CSS, PostgreSQL + Prisma, Anthropic
API for AI, Hunter.io for email enrichment, Gmail API / Microsoft Graph for outreach +
calendar.

---

## 1. Data spine (how everything connects)

```
Project ──< ProjectMember (team on this project)
   │        ProjectFirm (which firms this project is tracking)
   │        Project.taxonomy (AI-generated, project-scoped classification tree)
   │        Task (project-linked checklist items)
   │
Firm ──< Contact (people at the firm)
   │  ──1 CrmStageRow (current pipeline stage, one per firm)
   │  ──< ActivityLog (every stage change, note, call logged against the firm)
   │  ──< EmailThread ──< EmailMessage (outreach conversations)
   │  ──< Meeting (scheduled/completed meetings)
   │  ──< Task (pending-action + manual tasks)
   │  ──< ResearchSource (provenance: where each researched field's value came from)
   └──? PopulateRun (if this firm was created by "Find Similar"/"By Criteria")
```

Every module below is a different view/action surface over this same spine — there's no
separate database per module. A stage change on the CRM Pipeline kanban writes an
`ActivityLog` row and can auto-create a `Task`; that same `Task` shows up in Project
checklists; the same `Firm` row shows up in Firms Database, Contacts (via its `Contact`
children), Reports (aggregated), and the Dashboard (counted/summarized).

---

## 2. The Claude API / AI research layer

Every AI-powered feature in the platform routes through one thin wrapper,
**`src/lib/anthropic.ts`**, which exposes two functions:

### `runWebResearch(...)` — for anything that needs live information
- Model: `claude-haiku-4-5-20251001` (cheaper per-token than Sonnet; the workload is
  research/JSON-extraction, not creative reasoning, so Haiku is the right cost/quality
  tradeoff here).
- Enables Claude's **server-side `web_search` tool** (`web_search_20250305`), capped by
  `maxUses` (default 4) — each search is billed per-use ($10/1,000), independent of token
  cost.
- Optionally enables **`web_fetch`** (`web_fetch_20250910`, capped by `maxFetches`) — once
  a search finds a firm's domain/page URLs, `web_fetch` pulls the full page content
  directly instead of burning additional searches to piece together snippets. No per-call
  fee; standard token cost for the fetched page.
- **Prompt caching**: the system prompt is sent with `cache_control: { type: "ephemeral" }`,
  and large byte-identical-across-calls content (e.g. the Strategies/Focus Areas taxonomy
  JSON) goes in via `cacheableSystemExtra` as its own cached block — repeated calls within
  the ~5-minute cache window pay full price only once.
- **Retry logic**: one retry with a 1.5s backoff on retryable statuses (429/408/409/5xx) —
  smooths over transient web-tool throttling instead of surfacing every blip as a hard
  failure.
- Used by: **Firm research** (domain, AUM, strategy, contacts), **Contact discovery**,
  **Populate** ("Find Similar").

### `runCompletion(...)` — for reasoning-only prompts, no web access
- Same model, no tools attached — used where a search call would just add unbilled-for
  cost with zero benefit.
- Used by: **Classification Engine** (re-classifying against the taxonomy), **Project
  taxonomy generation** (describe → generate → review → confirm), **Settings → generate
  taxonomy children**.

### `extractJson<T>(text)`
Every AI response is prompted to return strict JSON; this helper pulls the first `{...}`
block out of a possibly prose-wrapped response and parses it, returning `null` on failure
so callers can degrade gracefully instead of crashing on a malformed model response.

### Where each AI feature lives
| Feature | File | Uses |
|---|---|---|
| Domain/AUM/strategy/contacts research on Add Firm | `firm-core-research.ts` | `runWebResearch` (web_search + web_fetch) |
| Standalone reclassify | `classification-engine.ts` | `runCompletion` (taxonomy validation, no web) |
| Contact discovery (BD/capital-markets titles) | `contact-discovery.ts` | `runWebResearch` |
| Populate — Find Similar / By Criteria | `populate.ts` | `runWebResearch` |
| Project taxonomy generation | `api/projects/[id]/taxonomy/route.ts` | `runCompletion` |
| Global taxonomy child-category generation | `api/taxonomy/generate-children/route.ts` | `runCompletion` |

---

## 3. Module: Dashboard

**Route:** `/dashboard` · **API:** `GET /api/dashboard`

One glance at what needs attention today. Pulls, in parallel:
- **Headline counts** — total firms, follow-ups pending (stage = `follow_up_due` OR
  `nextFollowUpDate` within 7 days), active deals (stage in `responded` /
  `meeting_scheduled` / `in_discussion_diligence` / `term_sheet_sent`), closed-won count.
- **Follow-ups due this week** — `CrmStageRow` rows with `nextFollowUpDate` inside the next
  7 days, firm attached.
- **Replies awaiting triage** — `EmailThread`s with `status: "replied"`, most recent first.
- **Upcoming meetings this week** — scheduled meetings starting within 7 days.
- **Recently closed-won** — last 10 firms that hit `closed_won`, most recent stage-change
  first.
- **Recent activity feed** — last 20 `ActivityLog` rows across the whole scope (emails,
  calls, notes, stage changes).

All queries respect `firmScopeWhere(user)` — a role's `dataScope` (`all_firms` vs.
`owned_firms_only`) filters every one of these to just the firms that user's role is
allowed to see.

---

## 4. Module: Messages

**Route:** `/messages` · **API:** `GET/POST /api/messages`, `/api/messages/send`,
`/api/messages/drafts`, `/api/messages/attachments`

Every email thread in one inbox-style view — whether it came from CRM outreach (linked to
a firm/contact) or a free-form message sent straight from Messages (no firm link at all,
visible to everyone since it isn't scoped to a firm owner).

- **Folders**: Inbox (default), Sent, Bin — a thread can appear in both Inbox and Sent,
  same convention as Gmail (shows in Sent if you sent anything in it, Inbox if it has an
  unarchived inbound message).
- **Auto-sync on load**: opening/refreshing Messages triggers
  `syncAllRepliesThrottled()` (best-effort, failure doesn't break the page) — pulls new
  replies from the connected Gmail/Outlook mailbox so a reply that landed shows up without
  any push-notification infrastructure.
- **Drafts** are a separate `MessageDraft` model, not `EmailThread` rows — sending a draft
  creates the real thread/message via the same send pipeline (`email-send.ts` →
  Gmail API / Microsoft Graph) and deletes the draft.
- **Filters**: project, firm, contact, owner, status, date range.
- Composing/sending always goes through the same OAuth "send-as-user" pipeline
  (`google-oauth.ts`/`microsoft-oauth.ts`) — one connection per user powers both send and
  calendar.

---

## 5. Module: Contacts

**Route:** `/contacts` · **API:** `GET /api/contacts`, `/api/contacts/[id]`,
`/api/contacts/[id]/find-email`

Every person across every firm, one flat searchable list.
- **Filters**: firm's CRM stage, email verification status (`verified`/`inferred`/
  `unknown`), free-text search.
- Each contact belongs to exactly one `Firm` (`Contact.firmId`) and carries: title, email +
  email status/source, alternate emails, LinkedIn URL, a BD-priority `rank` (see
  `contact-ranking.ts` below), and a `isPrimaryBdContact` flag.
- **Find Email** (`find-email` route) — Hunter.io lookup/verification for a contact missing
  a confirmed address.
- Contacts discovered during Firm research are pre-ranked by
  **`contact-ranking.ts`**'s `rankByCapitalMarketsPriority()` — a deterministic regex-based
  re-sort that prioritizes titles containing "Capital Markets," "Investor Relations,"
  "Business Development," "Introductions," or "Formation" — the actual BD-facing decision
  makers a cap-intro shop cares about, ranked above generic titles.

---

## 6. Module: CRM Pipeline

**Route:** `/crm` (kanban + list views) · **API:** `/api/crm/[id]/stage`,
`/api/crm/[id]/respond`

The core BD workflow engine, built on a fixed 13-stage pipeline
(`not_contacted → email_sent → follow_up_due → follow_up_sent → no_response → responded →
meeting_scheduled → in_discussion_diligence → term_sheet_sent → closed_won/closed_lost →
nurture / do_not_contact`), defined in **`src/lib/crm-stages.ts`**.

- **Kanban** (`kanban.tsx`, `@dnd-kit/core` drag-and-drop): one column per stage, cards
  colored/labeled via `STAGE_COLORS`/`STAGE_LABELS`. Dragging a card calls
  `PATCH /api/crm/[id]/stage`, which writes the new stage + `stageChangedAt`, always logs
  an `ActivityLog` row (`type: "stage_change"`), and — only on entering `term_sheet_sent` —
  auto-creates the **closing checklist** (`CLOSING_CHECKLIST_TEMPLATE`: NDA executed, DDQ
  sent/received, legal review complete, capital call scheduled, funds received), idempotent
  so re-entering the stage doesn't duplicate tasks.
- **Do-Not-Contact** is enforced as a one-way door in the kanban drag handler (client-side)
  — you can't drag a firm back out of it.
- **The Next Step engine** (`computeNextStep`) — every stage implies exactly one suggested
  action (e.g. `not_contacted` → "Send Email," `follow_up_due` → "Send Follow-Up"), except
  two stages with real branching: `responded` shows "Review Reply" until the firm is marked
  Interested (creates a "Schedule Meeting" task, then next step becomes "Set Meeting"), and
  `meeting_scheduled` shows nothing until the meeting's end time passes, then asks for the
  outcome.
- **`POST /api/crm/[id]/respond`** — the Interested/Not Interested action off a reply:
  Interested creates the "Schedule Meeting" task; Not Interested force-moves the firm to
  `nurture`.
- **Auto pending-tasks** (`pipeline-tasks.ts`) — system-generated tasks share their title
  with the Next Step label, so completing the real action (sending the email) and
  completing the task are the same operation, tracked via `TASK_TITLES`.

---

## 7. Module: Firms Database

**Route:** `/firms` · **API:** `GET/POST /api/firms`, `/api/firms/[id]`, `/api/firms/bulk`

The core entity table — every institutional investment manager tracked, with:
- **Fixed fields**: name, domain (+ resolution status), HQ location, target markets, AUM
  (value/display/as-of/confidence), Within-Mandate flag (auto-derived from the AUM band in
  Settings, or manually overridden), Strategies + Focus Areas (classified against the
  taxonomy), classification status/source, source type (seed/manual/comparable).
- **Add Firm** (`POST`): free-text names (newline/comma-separated), each run through
  `findDuplicate()` (name+domain dedupe) then `runFirmResearchPipeline()` — the AI research
  call — streamed back as NDJSON progress so the UI can show per-firm status live.
- **Firm drawer** (`firm-drawer.tsx`): full detail view — editable fields
  (domain/HQ/target markets/AUM fields/strategy detail/domain status), Strategies/Focus
  Areas accordions (edited here flips `classificationSource` to `manual_override` or
  `engine_then_edited` so a later reclassify never silently overwrites a human edit),
  Within-Mandate override control, contacts, activity log, tasks, meetings, email threads,
  and **Research Sources** — a provenance list showing exactly where each researched value
  came from (`ResearchSource`, keyed polymorphically by entity type + id + field name).
- **Populate — "Find Similar" / "By Criteria"** (`populate.ts`): a 5-factor weighted
  similarity score (AUM 0.3, strategies 0.25, focus areas 0.2, geography 0.15, target
  markets 0.1) finds comparable firms via AI web research, with an AUM-band post-filter
  (`outsideAumBand`); results are added with `sourceType: "comparable"` and linked back to
  the seed firm via `similarTo[]`/`PopulateRun`.
- **Classification Engine** (`classification-engine.ts`): validates any AI-proposed
  Strategy/Focus Area tags against the actual taxonomy tree
  (`validateTaxonomySelection`, dropping anything not recognized), and — critically —
  never overwrites a manually-touched classification on reclassify, only fills in
  genuinely new parent categories.
- **Filters**: strategy/focus-area parent, CRM stage, source type, classification status,
  domain resolution status, HQ region, Within-Mandate, project.

---

## 8. Module: Reports

**Route:** `/reports` · **API:** `GET /api/reports/summary`, `/api/reports/export`

- **Pipeline funnel** — count of firms per CRM stage, computed by grouping every firm's
  current stage.
- **Outreach response rate** — sent vs. replied `EmailThread` count, as a percentage.
- **Closed-Won list** — every firm currently at `closed_won`, with stage-change date.
- **Export** (`/reports/export`) — pulls the underlying data for offline/spreadsheet use.

All scoped by the same `firmScopeWhere(user)` role-based visibility rule as every other
module.

---

## 9. Module: Settings

**Route:** `/settings` (tabbed) · **Tabs:** My Account, Account/Integrations, Team & Roles,
Classification & Taxonomy, Recently Deleted

- **My Account** — profile, password.
- **Account/Integrations** — Hunter.io API key, Gmail/Outlook connection status
  (`EmailConnection`), follow-up threshold days (`AppSettings`).
- **Team & Roles** — invite users, assign `Role`s (`permissions` JSON array +
  `dataScope`: `all_firms` vs. `owned_firms_only`), deactivate accounts.
- **Classification & Taxonomy** — the global, DB-backed Strategies/Focus Areas taxonomy
  (`TaxonomySet`, seeded from `lib/taxonomy.ts` defaults on first read), full CRUD, plus
  AI-assisted "generate children for this parent" (`generate-children` route).
- **Mandate settings** (`/api/settings/mandate`) — the AUM min/max band; editing it
  immediately recomputes `withinMandate` for every firm not manually overridden
  (`recomputeMandateForAllFirms`).
- **Recently Deleted** — soft-deleted firms (`deletedAt`), restore or permanently purge.

---

## 10. The one already-generalized piece: per-project taxonomy

Every module above operates on the **global** Strategies/Focus Areas taxonomy by default.
But `Project` already carries its own override:

```
Project.taxonomy            Json?     // { "Parent": ["Child", ...] }, project-scoped only
Project.taxonomyDescription String?
Project.taxonomyConfirmedAt DateTime?
```

Flow (`api/projects/[id]/taxonomy/route.ts`): describe the project in free text → AI
generates a proposed taxonomy (`runCompletion`, no web search needed) → review/edit →
confirm (persists to `Project.taxonomy`) → optionally regenerate with refinement notes.
This is fully live today and is the one place the platform already lets a project define
its own classification scheme instead of using the single global one — everything else
described above (Firm's fixed fields, the CRM's fixed 13-stage pipeline, the AUM-based
Mandate settings) is still the same fixed structure for every project.

---

## 11. Module: Projects (omitted from the first pass — corrected here)

**Route:** `/projects`, `/projects/[id]` · **API:** `/api/projects`, `/api/projects/[id]`,
`/api/projects/[id]/firms`, `/api/projects/[id]/taxonomy`, `/api/projects/[id]/bulk-email`

A workspace grouping firms, contacts, tasks, and team members around one initiative —
never a separate workflow: every CRM-affecting action taken from inside a project (send
email, schedule meeting, change stage) goes through the exact same pipeline/task engine as
everywhere else in the platform (`Task.projectId` links a task to a project without
detaching it from the shared CRM machinery).

- **Project detail page tabs**: Firms (the `ProjectFirm` join — add/remove firms from this
  project via `add-firms-modal.tsx`/`select-firms-modal.tsx`), Taxonomy (§10 above —
  describe/generate/review/confirm), Messages (project-scoped thread view, folded into
  Overview), Members (`assign-member-modal.tsx` — add teammates via `ProjectMember`),
  Actions (`actions-tab.tsx` — the project's task list/checklist, action-first then
  firms-second ordering), Tasks (`task-detail-modal.tsx` — full tracker: status, progress
  %, time spent, comments/activity feed, completion verification).
- **Add Task** (`add-task-modal.tsx`): can create one task per selected firm in one
  submission — all rows created together share a `batchId`, so the Actions tab can offer a
  single "Send Email" button that executes across the whole batch at once.
- **Bulk Email** (`bulk-email-modal.tsx` / `/api/projects/[id]/bulk-email`): compose once,
  send to every firm's primary contact in the project (or a selected subset).
- **All Tasks** (`/projects` page's cross-project tab, `all-tasks-tab.tsx`): every task
  across every project the user can see, one flat list.
- Project status: `active` / `on_hold` / `completed`; has its own start/due dates,
  description, and free-text `type`.

## 12. Meetings & Calendar integration

No standalone "Meetings" nav item — meetings are scheduled from a firm's drawer and
surfaced on the Dashboard ("Upcoming meetings this week") and Reports, but the mechanism
(`src/lib/services/calendar.ts`) is its own subsystem:
- **`createCalendarEvent`** — same OAuth connection as email (Gmail or Microsoft Graph),
  extended with the Calendar scope; creates a real calendar event with a video/location
  link, invites the firm's contact, and stores the provider's `providerEventId` back on the
  `Meeting` row so later reschedule/cancel calls target the right event.
- Meeting statuses: `scheduled` → `completed`/`canceled`; logging notes after a meeting
  sets `notesLoggedAt` and (per the CRM Next Step engine, §6) unlocks the "Update Meeting
  Outcome" action once the scheduled end time has passed.
- `POST /api/cron/renew-watches` (see §14) keeps the same OAuth connection's Gmail/Outlook
  push subscription alive — Calendar and reply-detection ride the one connection per user.

## 13. Notification Center

**Service:** `src/lib/services/notifications.ts` — the one shared mechanism every other
feature writes to via `createNotification({ userId, type, body, relatedFirmId })`. Surfaced
as a bell/dropdown in the topbar (not a sidebar nav item), with `isRead` tracked per
notification. Fixed notification types: `reply_received`, `role_changed`,
`firms_reassigned`, `email_needs_reauth`, `meeting_reminder`, `follow_up_due`.

## 14. Real-time reply detection (webhooks) + background jobs

- **`POST /api/webhooks/gmail`** — Gmail push notification endpoint via Google Cloud
  Pub/Sub. Google delivers a base64-encoded `{emailAddress, historyId}` payload; the
  handler looks up the `EmailConnection` by mailbox, fetches Gmail history since the last
  known cursor, and calls `handleInboundReply()` (`reply-handling.ts`) to match the message
  to its thread, flip `EmailThread.status` to `replied`, and fire a `reply_received`
  notification.
- **`POST /api/webhooks/outlook`** — equivalent for Microsoft Graph subscriptions.
- **`syncAllRepliesThrottled()`** (`reply-sync.ts`) — the polling fallback used by
  Messages/Dashboard on page load, independent of whether push webhooks are currently
  working (defense in depth, not a replacement for them).
- `POST /api/cron/follow-up-check` (daily) — Outreach Sent → Follow-Up Due → No Response
  stage transitions based on elapsed time (`AppSettings.followUpThresholdDays`).
- `POST /api/cron/renew-watches` (daily) — renews both providers' push subscriptions before
  they expire (Gmail watches and Outlook subscriptions both have finite lifetimes).

Both cron endpoints accept a `CRON_SECRET` bearer token.

## 15. Auth & Team onboarding

**Routes:** `/login`, `/forgot-password`, `/reset-password`, `/accept-invite` ·
**API:** `src/app/api/auth/*`

- Session-based auth (`src/lib/session.ts`), password hashing, forgot/reset-password token
  flow (`passwordResetToken`/`passwordResetExpiresAt` on `User`).
- Google/Microsoft OAuth endpoints (`/api/auth/google`, `/api/auth/microsoft`) are reused
  for both "connect this mailbox for outreach" and (implicitly) the same provider identity
  — not a separate SSO system.
- **Team invites** (`team-invite.ts`): inviting a user sends a real email — from the
  *inviting admin's own connected mailbox*, same send pipeline as everything else — with an
  accept-invite link. Notably this was previously broken (invites only ever returned the
  link, never emailed it); fixed to actually send via `sendOutreachEmail`.
- **Permissions** (`src/lib/permissions.ts`): fixed permission list — `edit_firms`,
  `manage_contacts`, `send_outreach`, `manage_meetings`, `manage_tasks`, `run_populate`,
  `export_data`, `manage_settings`, `manage_team` — assigned per `Role`, checked via
  `requirePermission()`/`ForbiddenError` in API routes. Three seeded roles: Admin, Editor,
  Viewer.

## 16. Email attachments

**Service:** `src/lib/services/attachment-store.ts` — attachments on sent/received
messages are stored inline as base64 alongside the `EmailMessage`/`MessageDraft` row (no
separate object storage), capped at ~8MB per file so a stray large attachment can't bloat
the table. Above the cap, the file's metadata (filename/mimeType) still shows as a chip in
the UI, just without a downloadable body — same "degrade gracefully, stay visible" pattern
the platform uses elsewhere for research gaps.

## 17. Deduplication

**Service:** `src/lib/services/dedupe.ts` — `findDuplicate()` checks only `name` + `domain`
before Add Firm/Populate creates a new row, preventing the same institution from being
added twice under slightly different research runs.
