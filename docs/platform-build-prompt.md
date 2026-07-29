# Ranmi — Comprehensive Platform Build Prompt

**A naming note, read this first.** The word "Project" is overloaded across this doc's two
halves, and they mean different things:
- **§0–§24 (current state)**: the code, database, and UI today all use "Project" for a
  secondary workspace that groups firms/contacts/tasks/team around one initiative — the
  thing with Firms/Taxonomy/Messages/Members/Actions/Tasks tabs. **In this document, that
  module is called "Tasks" instead**, to free up the word "Project" for the other meaning.
  Code identifiers (the `Project` Prisma model, `ProjectMember`, `ProjectFirm`,
  `/api/projects/*` routes) are unchanged in the actual codebase — only this document's
  prose relabels them.
- **§25–§26 (target architecture)**: "Project" means the *new* base container the whole
  platform is meant to sit inside — driven by the classification/taxonomy/search criteria
  the user gives it, per the earlier discussion in this project's history. Wherever you see
  "Project" in this document, this is what it means.

**This is a documentation deliverable only.** No code in this repo was changed to produce
this document — it describes the real-estate capital-introduction platform exactly as it
is built and running today (confirmed via `git diff` against the last known-good commit
and a clean `tsc --noEmit`), module by module, plus how the Claude API/AI research engine
works underneath all of it. Where the Tasks-workspace-scoped taxonomy feature already generalizes
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
Tasks (code: Project) ──< ProjectMember (team on this Tasks workspace)
   │        ProjectFirm (which firms this Tasks workspace is tracking)
   │        Project.taxonomy (AI-generated, Tasks-workspace-scoped classification tree)
   │        Task (checklist items linked to a Tasks workspace)
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
`ActivityLog` row and can auto-create a `Task`; that same `Task` shows up in a Tasks
workspace's checklists; the same `Firm` row shows up in Firms Database, Contacts (via its
`Contact` children), Reports (aggregated), and the Dashboard (counted/summarized).

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
- Used by: **Classification Engine** (re-classifying against the taxonomy), **Tasks
  workspace taxonomy generation** (describe → generate → review → confirm), **Settings →
  generate taxonomy children**.

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
| Tasks workspace taxonomy generation | `api/projects/[id]/taxonomy/route.ts` (code still says "projects") | `runCompletion` |
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
- **Filters**: Tasks workspace, firm, contact, owner, status, date range.
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
  domain resolution status, HQ region, Within-Mandate, Tasks workspace.

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

## 10. The one already-generalized piece: per-Tasks-workspace taxonomy

Every module above operates on the **global** Strategies/Focus Areas taxonomy by default.
But a Tasks workspace (code: `Project` model) already carries its own override:

```
Project.taxonomy            Json?     // { "Parent": ["Child", ...] }, scoped to one Tasks workspace only
Project.taxonomyDescription String?
Project.taxonomyConfirmedAt DateTime?
```

Flow (`api/projects/[id]/taxonomy/route.ts`): describe the Tasks workspace in free text →
AI generates a proposed taxonomy (`runCompletion`, no web search needed) → review/edit →
confirm (persists to `Project.taxonomy`) → optionally regenerate with refinement notes.
This is fully live today and is the one place the platform already lets a Tasks workspace
define its own classification scheme instead of using the single global one — everything
else described above (Firm's fixed fields, the CRM's fixed 13-stage pipeline, the
AUM-based Mandate settings) is still the same fixed structure for every Tasks workspace.

---

## 11. Module: Tasks (code still calls this "Project" — see naming note)

**Route:** `/projects`, `/projects/[id]` · **API:** `/api/projects`, `/api/projects/[id]`,
`/api/projects/[id]/firms`, `/api/projects/[id]/taxonomy`, `/api/projects/[id]/bulk-email`

A workspace grouping firms, contacts, tasks, and team members around one initiative —
never a separate workflow: every CRM-affecting action taken from inside a Tasks workspace
(send email, schedule meeting, change stage) goes through the exact same pipeline/task
engine as everywhere else in the platform (`Task.projectId` links a task to a Tasks
workspace without detaching it from the shared CRM machinery).

- **Tasks workspace detail page tabs**: Firms (the `ProjectFirm` join — add/remove firms
  via `add-firms-modal.tsx`/`select-firms-modal.tsx`), Taxonomy (§10 above —
  describe/generate/review/confirm), Messages (workspace-scoped thread view, folded into
  Overview), Members (`assign-member-modal.tsx` — add teammates via `ProjectMember`),
  Actions (`actions-tab.tsx` — the workspace's task list/checklist, action-first then
  firms-second ordering), Tasks detail (`task-detail-modal.tsx` — full tracker: status,
  progress %, time spent, comments/activity feed, completion verification).
- **Add Task** (`add-task-modal.tsx`): can create one task per selected firm in one
  submission — all rows created together share a `batchId`, so the Actions tab can offer a
  single "Send Email" button that executes across the whole batch at once.
- **Bulk Email** (`bulk-email-modal.tsx` / `/api/projects/[id]/bulk-email`): compose once,
  send to every firm's primary contact in the workspace (or a selected subset).
- **All Tasks** (the Tasks list page's cross-workspace tab, `all-tasks-tab.tsx`): every
  task across every Tasks workspace the user can see, one flat list.
- Tasks workspace status: `active` / `on_hold` / `completed`; has its own start/due dates,
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

## 18. Second pass — corrections and remaining gaps

- **`firm-pipeline.ts` is the actual shared orchestrator**, not `firm-core-research.ts`
  alone. §7 undersold this: the single combined Claude research call
  (`researchFirmCore`) is one step inside `runFirmResearchPipeline()`, which also runs
  Hunter.io email enrichment, derives the Within-Mandate flag
  (`deriveWithinMandate`/`getMandateSettings`), and creates the firm's first pending task
  — and every AI/Hunter step degrades independently (a Hunter billing error doesn't abort
  domain/AUM research, etc.), surfaced back as a non-fatal `researchWarning` rather than
  failing the whole Add Firm call. **This exact pipeline is reused verbatim by
  Populate** (§7) — Add Firm and "Find Similar"/"By Criteria" are the same research
  machinery with a different discovery step in front of it, not two separate
  implementations.
- **Streaming mechanism** (`src/lib/ndjson-server.ts`): the "live progress" behavior
  mentioned for Add Firm's bulk NDJSON response is its own small utility — wraps a
  long-running pipeline in a `ReadableStream`, emits one JSON object per line as work
  progresses, and always terminates with `{"type":"done"}` or `{"type":"error"}`. Auth/
  permission failures happen before streaming starts, so they still return a normal HTTP
  error status; only the research work itself is streamed as a 200 with an NDJSON body.
- **Hunter.io key resolution** (`hunter.ts`): the API key can come from either an
  environment variable (applies platform-wide) or an encrypted value saved via
  Settings → Account Settings — the env var wins if both are set, so a deployment-level
  key can't be silently shadowed by a per-user Settings entry.
- **Reclassify All** (`/api/settings/reclassify-all`, `manage_settings` permission): batch
  re-runs `classifyFirm`/`applyClassification` (§7) across every non-deleted firm, reports
  how many firms' Strategies/Focus Areas actually changed — respects the same
  manual-edit-preservation rule as a single-firm reclassify.
- **CSV export exact shape** (`/api/reports/export`, `export_data` permission): columns are
  Firm Name, HQ, Strategies, Focus Areas, AUM, Within Mandate, CRM Stage, Owner, Primary
  Contact, Email, Email Status — one row per firm, values CSV-escaped
  (`toCsvValue`/quoted on comma/quote/newline).
- **Permanent purge is a genuine hard delete** (`/api/firms/[id]/purge`,
  `manage_settings` permission, only reachable from an already-soft-deleted firm): removes
  everything hanging off that `firmId` and frees the name/domain from future dedupe
  checks — unlike the soft-delete path (Recently Deleted), this is explicitly not
  reversible.

## 19. Third pass — two more real gaps

- **Populate actually has three modes, not two.** §7 only described "Find Similar" and
  "By Criteria" — there's a third, **`database_wide`**, which runs the AI research/discovery
  step without a seed firm or a user-set AUM band at all (broadest, least-constrained
  discovery mode). Only `by_criteria` and `similar_to_firm` run off a single research brief
  with a retry-on-thin-result safeguard — `database_wide` runs multiple independent
  briefs, so one brief's search failing doesn't sink the whole run the way a single flaky
  `similar_to_firm` call used to before this retry logic was added.
- **There are two distinct, deliberately separate send pipelines, not one.** §4 (Messages)
  and §6 (CRM Pipeline) each mentioned sending, but didn't make explicit that these are two
  different code paths with two different behaviors:
  - **`outreach.ts`'s `sendOutreachToFirm()`** — the CRM-tracked pipeline behind Send
    Email/Send Follow-Up/Send Term Sheet (`kind: "email" | "follow_up" | "term_sheet"`).
    Enforces the Do-Not-Contact gate (throws `OutreachError` if the firm's stage is
    `do_not_contact`), drives CRM stage transitions, and completes the matching pending
    task. Shared verbatim by `/api/outreach/send` and the Tasks module's bulk-send
    endpoint — sending from inside a Tasks workspace is never a separate implementation.
  - **`free-form-send.ts`'s `sendFreeFormMessage()`** — deliberately bypasses all of that:
    no Do-Not-Contact check, no forced stage change, no pending-task completion. Backs the
    Messages compose modal, in-thread Reply, and sending a saved Draft. A firm/contact link
    is optional and purely for record-keeping (shows on that firm's Activity tab) — sending
    a free-form message never drives the pipeline. Supports `replyToThreadId` to send
    within an existing thread's actual provider thread (lands as a real Gmail/Outlook
    reply), same mechanism CRM follow-ups use.

## 20. Fourth pass — the authorization mechanism itself, and an automatic stage transition

- **`firmScopeWhere`/`projectScopeWhere` (`src/lib/authz.ts`) is the exact mechanism**
  behind every "respects role-based visibility" claim made throughout this doc — worth
  spelling out since it was only ever referenced, never explained:
  - `dataScope: "all_firms"` roles → no filter at all, see everything.
  - `dataScope: "owned_firms_only"` roles → firms filtered to
    `{ crmStage: { ownerId: user.id } }` — note this scopes by **who owns the firm's CRM
    stage row**, not by who created/added the firm.
  - Tasks workspaces use a parallel but distinct rule: `all_firms` roles see every
    workspace; everyone else sees only workspaces they own **or are a member of**
    (`OR: [{ ownerId }, { members: { some: { userId } } }]`) — membership-based, not
    stage-ownership-based, since a Tasks workspace has no single CRM stage to key off of.
  - `requirePermission()`/`ForbiddenError` is the separate, permission-based (not
    data-scope-based) gate used throughout the API routes referenced across this doc
    (`manage_settings`, `export_data`, etc.) — the two systems (what you can see vs. what
    you're allowed to do) are independent and both apply.
- **Inbound replies can automatically change a firm's CRM stage** — a real, separate
  trigger from the manual kanban drag (§6) and the "Log outcome" respond action that §6
  never mentioned: `reply-handling.ts`'s `handleInboundReply()` (called from both the
  Gmail and Outlook webhook handlers, §14) auto-advances a firm from any stage except
  `do_not_contact`/`responded` itself to **`responded`** the moment a genuine reply lands —
  logged as its own `ActivityLog` stage_change entry ("Reply received — stage automatically
  changed to Responded"). This only applies to CRM-tracked threads
  (`EmailThread.isFreeForm: false`) — a reply to a free-form Messages thread never touches
  the pipeline, consistent with §19's send-pipeline split.
- Related: **`ingestNewInboundThread()`** handles the edge case of a contact emailing the
  connected mailbox directly (not as a reply to anything the platform sent) — creates the
  thread from scratch, then routes through the same notification path as an ordinary
  reply.

## 21. Fifth pass — the "zero external keys" configuration design, and single-firm reclassify

- **`/api/settings/app` is the platform's integration-status surface**, and it reflects a
  real architectural principle stated in the README that this doc never actually
  explained: **every external integration exposes its own `isXConfigured()` check**
  (`isAnthropicConfigured`, `isHunterConfigured`, `isGoogleConfigured`,
  `isMicrosoftConfigured`), and this route aggregates all four into one status object
  alongside `AppSettings` (follow-up threshold, whether a Hunter key is saved). The
  platform is deliberately designed to **run and be fully navigable with zero keys
  configured** — Add Firm, Populate, Find Contact, Send Email all surface a clear
  "not configured" state in the UI rather than silently failing or faking data, because
  every AI/enrichment/OAuth call site checks its own `isXConfigured()` guard before
  attempting the real call. This is a deliberate degrade-gracefully design decision, not
  an accident of missing error handling.
- **`/api/email-connections`** — simple GET of the current user's own `EmailConnection`
  (provider, connected address, status) — what Settings → Account/Integrations actually
  reads to show "Gmail connected as X" vs. "not connected," separate from the
  `/api/auth/google/connect` OAuth-initiation route.
- **Single-firm Reclassify is its own route**, distinct from Reclassify All (§18):
  `POST /api/firms/[id]/reclassify` — gated by `edit_firms` (not `manage_settings`, the
  permission Reclassify All requires), triggered from the individual firm's drawer. Same
  underlying `classifyFirm`/`applyClassification` call, just scoped to one firm and
  reachable by a different, more common permission level.

## 22. Sixth pass — exhaustive audit (every remaining UI component, lib util, route, seed, dependency)

This pass read every previously-unread `_components/*.tsx` file, `session.ts`, `crypto.ts`,
`utils.ts`, `taxonomy.ts`, every remaining API route, `prisma/seed.ts`, and `package.json`.
It surfaced one genuine security-relevant behavior and a cluster of real business rules —
distinct from documentation gaps, several of these are things a rebuild from this doc alone
would get functionally wrong.

**Auth — a real gap, not just a documentation one.** `src/lib/session.ts`'s
`getCurrentUser()` falls back to the first `isAccountOwner: true` user (bootstrapping one,
`sydney@adcapital-partners.com`, if none exists) whenever the session cookie is missing or
invalid — **at any time, not only on a fresh database**. §15 describes login as a real
gate; it isn't one as currently implemented. Flagging this as a behavior worth fixing, not
just documenting, since it means an invalid/absent cookie silently authenticates as the
account owner rather than redirecting to `/login`.

**Other real gaps found:**
- **At-rest encryption** (`src/lib/crypto.ts`): OAuth tokens and the Hunter.io key are
  AES-256-GCM encrypted before storage, requiring a 32-byte-hex `TOKEN_ENCRYPTION_KEY` env
  var (throws on startup/use if missing/wrong length) — never mentioned anywhere above.
- **`prisma/seed.ts` seeds only Admin + Viewer roles** (no Editor), one user
  (`sydney@adcapital-partners.com` / `changeme123`), default Mandate ($1B–$15B) and
  AppSettings — **no demo firms, contacts, or Tasks workspaces at all**. A fresh install is
  data-empty by design, not partially empty.
- **User deactivation is gated**: blocked until the caller supplies a replacement owner for
  any firms the user owns (`REASSIGN_REQUIRED` + count; new owner gets a
  `firms_reassigned` notification).
- **User deletion is restricted**: the account owner can never be deleted; an active user
  must be deactivated first; a deactivated user can still fail to delete if they have
  historical records (tasks/activity/messages) tied to them — stays "deactivated"
  permanently in that case.
- **A user's email is only editable while their invite is still `pending_invite`** — locked
  once active, since it's also the login identity.
- **Editing a role fires `role_changed` to every user on that role**; deleting a role
  requires zero assigned users; the account owner's role can never be changed via edit-user.
- **A Tasks workspace's "Assign member" invites always create a Viewer-role account** for
  an unknown email — different from the Settings → Team invite flow, which lets the
  inviter pick any role. Tasks-workspace-level invite = fixed least-privilege;
  account-level invite = admin-chosen.
- **Contact deletion is conditional**: hard-deletes only if the contact has zero
  `EmailThread`s/`Meeting`s; otherwise soft-deletes (`removedAt`). Never documented — only
  the analogous firm pattern was.
- **Task deletion is a genuine hard delete**, no soft-delete/recovery path, unlike firms
  and (see below) message threads.
- **Domain-confirmation gate in the Firm Drawer**: while `domainResolutionStatus !==
  "resolved"`, Find Contact/Find Email are blocked behind a banner; manually saving a
  domain force-sets the status to `resolved`.
- **A right-click context menu on the Firms Database grid** (`firm-context-menu.tsx`) is an
  entirely separate interaction surface: Edit, Add to [Tasks workspace] (UI label still
  reads "Add to Project"), a nested Assign submenu
  (owner, plus nested Add Task/Add Note), Find Similar Firms, Visit Website, Delete.
- **"Clear Override"** is a real, dedicated clickable control for reversing a manual
  Within-Mandate override — not just an implied side effect of re-editing.
- **AUM display formatting rule** (`formatAum`): ≥$1B → `$X.XXB` (trailing zeros
  stripped), ≥$1M → `$XM` (no decimals); `unconfirmed`/`dated` confidence prefixes `~` and
  suffixes `*` (e.g. `~$2.4B*`).
- **Add Firm's modal has a second, undocumented "By Strategy & Focus Area" tab** that posts
  straight to the same `/api/populate` `by_criteria` mode — a second UI entry point into
  Populate, not a separate feature.
- **`database_wide` Populate's actual bounds**: samples against the 10 most recently added
  firms, adds up to 20 new firms per run.
- **Tasks-workspace-scoped Add Firm** (code: `ProjectAddFirmModal`) is a third variant of
  the same pattern: by-name (auto-attaches to the workspace) or by-criteria using *that
  workspace's own* taxonomy instead of the global one.
- **Settings → Taxonomy's "Add Funds Category"** button (Strategies tab only): one click
  adds a "Funds" parent and immediately AI-generates its children via the same
  `generate-children` endpoint.
- **The Tasks workspace's Actions tab is under-described** — it's not just Bulk Email. It offers
  seven bulk actions over a multi-select of firms: Send Email/Follow-Up/Term Sheet,
  Schedule Meeting (single-selection only), Add Note (logs to every selected firm's
  Activity tab), Change CRM Stage, Assign Owner — all via `Promise.all` over the same
  single-firm endpoints documented elsewhere.
- **Message threads require a two-step delete**: `DELETE /api/messages/[id]` rejects the
  request unless the thread is already in the Bin (`deletedAt` set) — same soft-delete →
  purge shape as firms, never stated for threads.
- **Notification dismissal is a hard delete**, not a read/archive toggle — both "Clear All"
  and single-dismiss permanently remove the row(s), not just flip `isRead`.
- **Meeting outcome has three branches, not a binary**: In Discussion/Due Diligence,
  Declined, or **Reschedule** (keeps the firm at `meeting_scheduled` with a new date/time,
  doesn't advance the pipeline at all) — §6 undersold this as just "asks for the outcome."

**Explicitly not reported as gaps** (checked and ruled not worth documenting): an unused
`zod` dependency (imported nowhere), a Playwright devDependency with no actual `.spec.ts`/
config files behind it (no e2e suite exists to describe), and minor UI-only details
(Cc/Bcc fields, forward-message prefill, pagination sizes) that don't constitute business
rules.

## 23. The design system / UI component layer (previously undocumented entirely)

Every section above describes *what the app does*; none of it describes *what it's built
with visually*. A rebuild needs this too.

**Design tokens** (`src/app/globals.css`) — CSS custom properties, not hardcoded Tailwind
colors, so the palette is a single source of truth: `--color-surface` (white),
`--color-page` (`#f7f8fa`, the app background), `--color-primary` (`#1f3864`, dark navy —
the brand color) + `--color-primary-hover`, `--color-accent` (`#2e5fcc`, brighter blue for
links/active states), `--color-text-primary`/`--color-text-secondary`, `--color-border`.
Plus a **status color family** used everywhere something needs a semantic state color —
green/amber/red/blue/gray, each with a paired `-bg` tint (e.g. `--color-status-green` +
`--color-status-green-bg`) — this is the exact palette `STAGE_COLORS` (§6, CRM kanban) and
badge components draw from, so stage colors, classification-status badges, and
domain-resolution-status indicators all visually share one semantic language instead of
each picking its own colors.

**Shared UI primitives** (`src/components/ui/`) — *correction*: these are locally-styled
wrappers around **Radix UI primitives** (`@radix-ui/react-accordion`, `-avatar`,
`-checkbox`, `-dialog`, `-dropdown-menu`, `-label`, `-popover`, `-select`, `-tabs`,
`-toast`, `-tooltip` are all real dependencies), composed with `class-variance-authority`
+ `tailwind-merge` + `clsx` — the standard shadcn/ui-style pattern, not a from-scratch
component kit. Files present: `button`, `input` (+ a `Select` variant in the same file),
`card`, `badge`, `checkbox`, `avatar`, `tabs`, `accordion`, `dropdown-menu`, `drawer` (the
sliding side-panel pattern behind the Firm Drawer, §7, likely wrapping Radix Dialog),
`password-input`. Two are worth calling out specifically since they encode real behavior,
not just styling:
- **`AumInput`** — lets a user type "1" and pick "Billion" instead of nine zeros; internally
  splits/recombines into the same raw-USD string the rest of the app already expects
  (`aumValue`), and only re-derives its displayed figure/unit from external value changes
  (initial load, reset) — while the user is actively typing, their own input drives display,
  not a round-trip through the parent's state.
- **`StepProgress`** — the horizontal numbered-step tracker (green check when passed,
  pulsing current step, filling connector line) behind the live progress UI for Add Firm
  and Populate's NDJSON streaming (§17/§18) — this is the actual visual component that
  progress events (`ndjson-server.ts`) render into, not just an abstract "progress bar."

**Layout shell** (`src/components/layout/`) — `sidebar.tsx` (fixed nav — Dashboard, Tasks
[code/route: "Projects"], Messages, Contacts, CRM Pipeline, Firms Database, Reports,
Settings — with active-route highlighting) and `topbar.tsx` (the Notification Center
bell/dropdown, §13, lives here, not in the sidebar).

## 24. Deployment/infrastructure layer (previously entirely unaddressed)

- **No `middleware.ts` exists.** Route protection is enforced per-route inside each API
  handler (`getCurrentUser()` + `requirePermission()`), not centrally — reinforcing the
  §22 finding that auth is a per-call check, not a gate every request passes through
  first. A rebuild should be explicit about whether it wants centralized middleware or is
  intentionally keeping per-route checks.
- **`vercel.json`** defines the operational schedule and timeout overrides the two cron
  jobs (§14) and several AI-heavy routes actually need in production:
  - Cron schedules: `follow-up-check` daily at **13:00 UTC**, `renew-watches` daily at
    **06:00 UTC** — not just "daily," specific times.
  - `maxDuration` overrides (default Vercel function timeout is too short for these):
    **300s** for `POST /api/firms` (bulk Add Firm), `/api/populate`, and
    `/api/settings/reclassify-all`; **60s** for `/api/firms/[id]/find-contact`,
    `/api/firms/[id]/reclassify`, and `/api/contacts/[id]/find-email`. Any of these
    running with a default (shorter) timeout would truncate mid-research.
- **Full required/optional env var list** (`.env.example`) — some of these were referenced
  individually earlier but never listed together: `DATABASE_URL`, `ANTHROPIC_API_KEY`,
  `HUNTER_API_KEY`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`,
  `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_REDIRECT_URI`/
  `MICROSOFT_TENANT_ID` (defaults to `"common"`), **`AUTH_SECRET`** (session/JWT signing —
  not previously mentioned at all), `TOKEN_ENCRYPTION_KEY` (§22's AES-256-GCM key,
  generated via `openssl rand -hex 32`), `CRON_SECRET` (§14).
- **No custom `error.tsx`/`loading.tsx`/`not-found.tsx`** anywhere in `src/app` — the app
  relies entirely on Next.js's default error/loading/404 handling; there is no bespoke
  error-boundary or skeleton-loading design to carry over in a rebuild.
- **Root layout is minimal**: Inter font via `next/font/google`, static page
  `title`/`description` metadata ("NewCap Ranmi — Capital Introduction CRM"), no favicon
  customization, no analytics/monitoring script, no client-side providers wrapping the
  tree (theme, query-client, etc. are set up per-page/per-feature if at all, not globally).

**Auth/crypto libraries confirmed by `package.json`**: `bcryptjs` (password hashing) and
`jsonwebtoken` (session signing, consuming `AUTH_SECRET`) are the actual mechanisms behind
§15/§22's auth discussion — not custom-rolled. `date-fns` handles date formatting/parsing
throughout; `isomorphic-fetch` supports `@microsoft/microsoft-graph-client`. No CI
workflows (`.github/`) and no Docker setup exist in this repo — deployment is Vercel-only,
per `vercel.json` (§24).

---

# ⚠️ TARGET ARCHITECTURE — NOT YET BUILT

**Everything above this line (§0–§24) describes the application exactly as it runs today.**
Everything below describes where the product is headed — it is a design target, not
current behavior. This distinction matters: earlier in this project's history, spec
documents and actual code changes got confused with each other, and that confusion caused
real problems (a schema rewrite was implemented and had to be reverted). Nothing below this
banner has been implemented. It exists here so the target model lives alongside the
current-state documentation instead of scattered across separate files.

## 25. The "Project as base" model

**This section has been corrected twice in this project's history** — once to narrow it
(removing the field engine), then back to this, its accurate scope, once it became clear
that entity fields need to be user-defined and ongoing-editable, not fixed. The record is
kept here deliberately so a future session doesn't re-litigate this from scratch.

**The platform's mechanics stay exactly as they are today** — auth, sessions,
permissions, notifications, email/calendar OAuth, attachments, the research/enrichment
engine's machinery, the reporting engine, Messages, Tasks, Settings, the design system.
None of that is rebuilt. **Four things move from "one fixed global answer" to "generated
per Project at onboarding, and editable afterward, even with existing data present":**

1. **Entity fields** — today, `Firm` has a fixed set of real-estate columns (domain, HQ,
   AUM, target markets). Becomes whatever fields a Project actually needs, generated from
   the onboarding description, with an **ongoing field editor** — add/remove/rename a
   field any time, even after firms already have data in it. This requires the flexible
   `EntityType`/`FieldDefinition`/`Entity.data`(JSON) design in
   `docs/build-spec-v2-dynamic-platform.md` §2.1–2.2, not fixed database columns — a
   fixed-column approach can't support adding/removing fields without a schema migration
   each time.
2. **Classification** — today a single hardcoded global AUM Mandate band. Becomes
   per-Project qualification criteria (may or may not be AUM), generated and later
   editable.
3. **Taxonomy** — today (§10) a project can *optionally* override the one global
   taxonomy. Becomes the required first step, same describe → generate → review → confirm
   flow already live, editable/regeneratable afterward exactly as it already is today.
4. **CRM Stages** — today a single fixed global 13-stage `CrmStage` enum (§6). Becomes a
   generated, ordered stage sequence per Project, freely rename/reorder/add/replace
   afterward.

A new Project also starts with a clean, empty data set — no shared/seeded firms carried
over.

**Navigation**: "Projects" becomes the main entry point in the sidebar. Clicking into one
opens the same functional surfaces already documented in §0–§24 — an entity database (the
generic replacement for Firms Database), a pipeline (the generic replacement for CRM
Pipeline), Contacts, Messages, Reports — scoped to that Project's own fields,
classification, taxonomy, and stages. Today's "Tasks" module (§11) is a separate,
pre-existing concept, not replaced by this — a Project may still contain its own task
checklists, same as today's Tasks workspaces do.

**Tasks loses its own taxonomy feature.** Today (§10), the Tasks module (code: `Project`
model) has its own optional per-workspace taxonomy override
(`Project.taxonomy`/`Project.taxonomyDescription`/`Project.taxonomyConfirmedAt`,
`api/projects/[id]/taxonomy/route.ts`). In the target model, taxonomy belongs exclusively
to the new top-level Project concept — Tasks does not get its own separate taxonomy
anymore. That feature (the whole per-Tasks-workspace override described in §10) should be
removed, not carried forward or duplicated at the Tasks level. A Tasks workspace inherits
whichever Project it's tracking checklists for; it doesn't define its own classification
scheme.

## 26. What this means for the code documented in §0–§24

Most of §0–§24 carries forward largely as-is, scoped differently: the AI research engine
(§2) becomes prompt-generated from a Project's field definitions instead of hardcoded to
Firm's columns; the Next Step/automation engine (§6) becomes data-driven per Project
instead of a hardcoded switch, preserving its automation power (auto follow-up tasks, the
closing checklist, terminal stages) as configurable rules rather than hardcoded per
literal stage name; `mandate.ts`'s hardcoded AUM-band logic becomes a per-Project
qualification lookup. Messages, Meetings, Notifications, Tasks, auth, and the design
system (§12, §13, §15, §23) are already reasonably generic and mostly just get repointed
at Project-scoped entities. The concentrated rework is: the entity schema itself, the
pipeline stage list itself, and the two biggest UI surfaces (entity table/drawer,
pipeline kanban) — this mirrors the "skeleton vs. dynamic" split already captured in
`docs/architecture-skeleton-vs-dynamic.md`.

**This section will need to move above the banner (become current-state documentation)
once the target model is actually implemented — at that point, §0–§24 should be revised
to match, not left describing a superseded version of the app.**
