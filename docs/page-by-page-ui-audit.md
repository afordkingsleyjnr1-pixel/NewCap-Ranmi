# NewCap Ranmi — Complete Page-by-Page UI Audit

Every page in the running real-estate/capital-introduction platform: full layout, every
button, every behavior, every modal, confirmed against the actual source code (component
files and the API routes they call). Organized in sidebar navigation order.

---

# 1. Dashboard (`/dashboard`)

**Purpose:** A read-only landing/overview page — no editing happens here, only summary
numbers and links out to other pages.

**Layout (top to bottom):**
1. Page header: "Dashboard" title, subtitle "A quick read on where the pipeline stands."
2. A row of 4 stat tiles (2 columns on small screens, 4 across on large screens).
3. A 2×2 grid of four list cards.
4. A single full-width "Recent Activity" card at the bottom.

**Data loading:** On mount, it fetches `GET /api/dashboard` once (no refresh button, no
polling). While waiting, each stat tile shows an animated gray pulse placeholder instead
of a number; the four list cards and the Recent Activity card don't render at all until
the fetch resolves (no per-card loading spinner — the whole lower section is simply
absent until data arrives).

**The four stat tiles** (icon, label, number — all non-interactive, not clickable):
- **Total Managers** — count of all non-deleted firms in the user's visible scope.
- **Follow-Ups Pending** — count of CRM stage rows where stage is "follow_up_due" OR the
  next follow-up date is within the next 7 days.
- **Active Deals** — count of firms whose CRM stage is one of: Responded, Meeting
  Scheduled, In Discussion/Due Diligence, Term Sheet Sent.
- **Closed Won** — count of firms whose CRM stage is Closed Won.

**The four list cards** (each row is a clickable link, navigating to
`/firms?open=<firmId>` which opens that firm's detail drawer on the Firms page):
- **"Follow-Ups Due (today / this week)"** — firms with a next-follow-up date due within
  7 days, firm name + due date. Empty state: "Nothing due."
- **"Recently Replied — Awaiting Triage"** — email threads with status "replied," firm
  name + last-activity timestamp. Empty state: "Nothing to triage."
- **"Upcoming Meetings (next 7 days)"** — scheduled meetings within the next week, firm
  name (+ contact name if any) + start time. Empty state: "No meetings scheduled."
- **"Recently Closed — Won"** — the 10 most recent Closed Won firms, firm name + date the
  stage changed. Empty state: "None yet."

**Recent Activity card** — the 20 most recent activity-log entries across all firms,
firm name (bold) + activity text + timestamp; not clickable. Empty state: "No activity
yet."

No buttons, filters, search, or edit controls exist anywhere on this page.

---

# 2. Projects / Tasks module (`/projects`, `/projects/[id]`)

*(Note: this is the module the platform code and nav still call "Projects" — see the
naming note in `platform-build-prompt.md` for why later docs call it "Tasks.")*

## 2.1 Projects list page (`/projects`)

**Header**: title "Projects," subtitle "Group firms, contacts, tasks, and team members
around one initiative," and a **Create Project** button (plus icon) opening the Create
Project Modal.

**Two tabs**: **Projects** and **All Tasks**.

**Projects tab**: a responsive grid of project cards. Each shows: project name, a status
pill (green "active" / amber "on hold" / gray "completed"), a trash-can delete icon
(top right), an optional 2-line description, a stats row (firm count, "N open · M done"
task count, due date if set), and a footer of up to 4 overlapping member avatars plus
"Owner: [name]." Clicking the card navigates to `/projects/{id}`. Clicking delete shows a
`confirm()`: *"Delete project "[name]"? Firms and contacts stay in the database; tasks
stay in the main Tasks module, just unlinked from this project."* — confirming calls
`DELETE /api/projects/{id}`.

Empty state: "No projects yet. Click Create Project to set up your first workspace."
Loading state: "Loading…"

**Create Project Modal**: Project Name, Description, Project Type (free text), Start
Date/Due Date, Project Owner dropdown (default "— Me —"). **Cancel** / **Create Project**
(disabled until name + start date filled).

**All Tasks tab**: every open task across every firm system-wide, sorted by due date.
Columns: checkbox (toggle done/open), Task title (strikethrough if done, gray
"Checklist" pill if auto-generated), Firm, Contact, Project, Priority pill, Due Date (red
"overdue" pill if passed and still open), Owner, delete icon (confirm then
`DELETE /api/tasks/{id}`). Empty state: "No open tasks. Checklists auto-generate when a
firm reaches Term Sheet / LOI."

## 2.2 Project detail page (`/projects/[id]`)

**Header**: "← Back to Projects" link; name, status pill, type pill, description,
"Owner: X · Start [date] · Due [date]." Red **Delete Project** button (same confirm, then
navigates back).

**Stat tiles**: Firms count, Open Tasks, Completed Tasks, Upcoming Deadlines.

**Tab bar**: **Overview**, **Tasks (N)**, **Actions**, and a **"More" dropdown** revealing
**Firms (N)**, **Taxonomy**, **Members (N)**.

**Overview tab**: left column — "Upcoming Deadlines" (5 soonest open tasks) and "Recent
Activity" (scoped to project's firms); right column — a compact preview (max 6) of the
project's message threads.

**Firms tab**: **Add Firms** button (opens `AddFirmsModal`); once ≥1 selected, **Send Bulk
Email (N)** appears (opens `BulkEmailModal`). Table: checkbox, Firm name (link), Strategy/
Focus Area pills, Stage pill, **Next Step** (shared action button — see CRM Pipeline
section), trash-can **Remove** icon (confirm "Remove this firm from the project? It stays
in the Firms Database."). Empty state: "No firms in this project yet."

**Tasks tab**: **Add Task** button (admin/`manage_settings`-only; disabled if project has
zero firms) — others see: "Only workspace admins can create tasks. Head to the Actions
tab to send emails, schedule meetings, log notes, or update CRM stages directly." Table:
checkbox, Task title (gray "CRM Action" pill if system-generated), Firm, Contact,
Priority pill, **Progress** (colored tracker-status pill + mini progress bar), Due Date,
Owner, delete icon. Row click (not checkbox/delete) opens **Task Detail Modal**.

**Actions tab** — the bulk-action console, a 2-step wizard:

*Step 1 — choose an action* (buttons disabled until firms selected):
| Button | Enabled when | Effect |
|---|---|---|
| Send Email | ≥1 selected | Opens Bulk Email Modal, kind=email |
| Send Follow-Up | ≥1 selected | Opens Bulk Email Modal, kind=follow_up |
| Send Term Sheet / LOI | ≥1 selected | Opens Bulk Email Modal, kind=term_sheet |
| Schedule Meeting | exactly 1 selected | Opens the shared Schedule Meeting modal |
| Add Note | ≥1 selected | Opens inline Add Note modal |
| Change CRM Stage | ≥1 selected | Opens inline Change CRM Stage modal |
| Assign Owner | ≥1 selected | Opens inline Assign Owner modal |

*Step 2 — select firms*: **Select Firm(s)** opens `SelectFirmsModal` (searchable,
paginated 50/page, "Select all N matching," Cancel/Use Selection). Each selected firm
shows an amber "no email on file" pill if applicable, and a contact-override dropdown if
it has multiple contacts.

- **Add Note modal**: one Note textarea → `POST /api/firms/{id}/notes` per selected firm
  in parallel.
- **Change CRM Stage modal**: New Stage dropdown (all 13 stages) → `PATCH
  /api/crm/{id}/stage` per firm in parallel. This is the **only** place in the UI a bulk,
  arbitrary stage move is exposed — including moving something into or out of Do Not
  Contact.
- **Assign Owner modal**: Owner dropdown → `PATCH /api/firms/{id}` per firm in parallel.
- **Bulk Email Modal**: Type dropdown (Email/Follow-Up/Term Sheet), Subject, Message.
  Warns if any targets lack a resolvable email (they'll be skipped). Submits to
  `/api/projects/{id}/bulk-email`, which runs every target through the *identical*
  single-send pipeline (same CRM stage advances, same Do-Not-Contact block per firm).
  Result screen: green "N sent" / red "N failed" with per-firm error lines.

**Taxonomy tab** — a per-project, AI-assisted classification builder, fully separate from
the platform-wide taxonomy:
1. **Describe**: a "Project Focus Description" textarea.
2. **Generate** (sparkle icon): POSTs the description to `/api/projects/{id}/taxonomy`;
   Claude proposes 3–8 parent categories × 2–8 children each, strictly as JSON. Nothing
   saved yet.
3. **Review**: editable grid of parent/child category cards — rename inline, delete a
   parent (trash icon) or a single child, "+ Add subcategory," and a top-level
   "+ Add Category" button.
4. **Regenerate**: a refinement-notes input + **Regenerate** button re-runs the AI call
   with those notes, replacing the draft (discards manual edits).
5. **Confirm & Save**: PATCHes the (possibly hand-edited) taxonomy + description; server
   stamps `taxonomyConfirmedAt`; a green "Saved [timestamp]" pill appears.
6. **Add Firm** (project-taxonomy-specific): disabled until a taxonomy is confirmed at
   least once. Two modes: **By Name** (research pipeline, same live step-progress as main
   Add Firm) or **By Project Taxonomy** (uses this project's own confirmed taxonomy as
   the picker, plus Market/AUM/count fields, posts to `/api/populate` mode `by_criteria`).

**Members tab**: **Assign User** button (opens `AssignMemberModal`); member list with
avatar, name, email, amber "Invite Pending" pill if unaccepted, trash-can Remove (not
shown for the project owner) — confirm then `DELETE /api/projects/{id}/members/{userId}`.

### Remaining Projects-module modals
- **Add Firms Modal**: attach an *existing* database firm (distinct from Taxonomy tab's
  research-new-firms flow). By Search or By Strategy/Focus Area (TaxonomyPicker trees).
  "N selected" counter, select-all-matching toggle, 50/page pagination. Submits
  `POST /api/projects/{id}/firms`.
- **Add Task Modal** (admin-only, plain to-do — explicitly not a CRM action): Task Name,
  Related Firms (multi-select, defaults to first project firm), Related Contact (only if
  exactly one firm selected), Assign To, Priority, Due Date, Notes. One task created per
  selected firm.
- **Assign Member Modal**: Email Address field. If the email matches an existing user,
  added immediately. If not, server creates a pending-invite account; modal shows a
  result screen with either a green "invite email sent" line or an amber warning plus a
  copyable invite link.
- **Task Detail Modal**: tracker-status dropdown (Not Started/In Progress/Under
  Review/Completed/Blocked, syncing the simple done/open flag); once "Completed," either
  a green "Verified by [name]" pill or (for admins) a **Verify Completion** button, others
  see amber "Awaiting verification"; a 0–100% Progress slider (steps of 5); a "Log
  minutes worked" input + **Log Time** button (adds to running total); an Activity &
  Comments feed (system entries in italic gray, user comments normal) + comment box.
- **Select Firms Modal**: the picker invoked from the Actions tab, same search/paginate/
  select-all pattern.

---

# 3. Messages (`/messages`)

**Purpose:** A Gmail-style inbox for every email thread tied to firms, plus free-form
messages sent directly (not through the CRM outreach pipeline).

**Header row**: title/subtitle, **Refresh** button (spins while reloading).

**Filter bar** (hidden in Drafts folder): search box (client-side, matches subject/firm/
contact), **All Projects** / **All Assignees** / **All Statuses** dropdowns and a date
range (all server-side, refetch), **Clear Filters** button (appears once anything's set).

**Left nav column**: **Send Message** button (opens compose modal blank); four folder
buttons — **Inbox** (shows unread-count pill when not active), **Sent**, **Drafts**,
**Bin**.

**List view**: 50/page with prev/next chevrons. Inbox/Sent/Bin rows show sender/firm name
(bold if unread), project tag, subject + snippet, unread dot, relative timestamp. Drafts
rows show a gray "Draft" pill, subject or "(no subject)," recipient or "No recipient yet,"
body snippet, and a hover trash-can (`DELETE /api/messages/drafts/{id}`, no confirm).
Empty states per folder ("No messages in your inbox." / "Nothing sent yet." / "Bin is
empty." / "No drafts saved."). Background silent re-fetch every 20s for non-Draft/Bin
folders. Deep-link support via `?open=<threadId>`.

**Reader view**: back arrow, subject, firm/recipient, project pills. Header actions:
normal folders get "Mark as unread" and **Move to Bin**; Bin folder gets **Restore** and
**Delete Forever** (native confirm, hard-deletes the thread — server blocks this unless
the thread is already in the Bin). Messages list newest-first, collapsible (only the
newest starts expanded), avatar-initial bubbles, Cc list if present, attachment pills
(image attachments also show inline thumbnails). Each expanded message gets **Reply**,
**Reply All** (only if that message had Cc), **Forward** (opens compose modal in "Forward"
mode, "Fwd:" prefix + quoted body). Inline reply composer: Cc toggle, textarea, attachment
picker, note about auto-appended Gmail signature, **Cancel**/**Send** — posts to
`/api/messages/send` with `replyToThreadId` so it lands as a real reply.

**Compose/New Message Modal**: "Link to firm (optional)" dropdown → loads that firm's
contacts for a "Recipient (To)" dropdown, or manual name/email fields; "Add Cc/Bcc" link;
Subject, Message, attachment picker. **Cancel** / **Save as Draft** / **Send** (drafts save
via `/api/messages/drafts`, sending a draft calls `/api/messages/drafts/{id}/send` then
deletes the draft record). Errors (including "NEEDS_REAUTH" → "Reconnect your email to
continue.") show inline.

---

# 4. Contacts (`/contacts`)

**Purpose:** A flat, firm-agnostic list of every contact across all firms.

**Header**: title + live count "N contacts across all firms."

**Filter bar**: search box (server-side, by name), **All Email Status** dropdown
(Verified/Inferred/Unknown).

**Table columns**: Name, Email (+ status pill or "—"), Firm (accent-colored, but the
whole row is clickable), Current Stage (colored pill), **Next Step** (shared action
button — see CRM Pipeline), Edit (pencil) icon.

- Row click (except Next Step/Edit cells) opens the **Firm Drawer** (shared component,
  full detail described under Firms Database below).
- Next Step button opens the matching modal (Compose Email/Schedule Meeting/Review
  Reply/Meeting Outcome/Close Deal — all detailed under CRM Pipeline).
- Edit icon opens the **Edit Contact modal**: Name, Title, Primary Email, repeatable
  Alternate Emails (add via `+`/Enter, remove via `×` tag), LinkedIn URL. **Cancel**/
  **Save** (`PATCH /api/contacts/{id}`, gated on `manage_contacts` permission).

Loading state: single "Loading…" row. Empty state: "No contacts yet."

---

# 5. CRM Pipeline (`/crm`)

**Header**: title + live count "N firms in the pipeline," and a Kanban/List view toggle
(icon buttons, no API call — just flips local state).

## 5.1 List view
Columns: Firm (link), Current Stage pill, **Next Step**, Pending Task (first task title
fragment or "—"), Owner. Sorted by `nextFollowUpDate` ascending (firms without one sort
last). Row click opens the Firm Drawer.

## 5.2 Kanban view
One horizontally-scrolling column per stage, fixed order (Not Contacted → … → Do Not
Contact), each with a count. Cards show firm name, HQ, AUM, an amber "Follow up [date]"
label if set, and either the Next Step button or plain non-actionable status text. **Do
Not Contact column cards show no Next Step control at all.**

**Drag-and-drop**: pointer-drag (≥6px to start, so plain clicks still work). Dropping a
Do Not Contact card anywhere is silently ignored — hard, one-way door, enforced
client-side. Dropping on a different valid column calls `PATCH /api/crm/{id}/stage`;
same-column or invalid-target drops do nothing. Valid drop-target column highlights while
dragging over it.

**Server effect of a stage change**: requires `edit_firms` permission; logs the
transition to Activity; entering `term_sheet_sent` for the first time auto-creates the
6-item closing checklist (NDA executed, DDQ sent, DDQ received, Legal review complete,
Capital call scheduled, Funds received), idempotently.

## 5.3 The Next Step engine (shared everywhere — Firms grid, CRM list/kanban, Contacts,
Projects Firms tab)

| Stage | Label | Action |
|---|---|---|
| Not Contacted | Send Email | send_email |
| Email Sent | Awaiting Response | none |
| Follow-Up Due | Send Follow-Up | send_follow_up |
| Follow-Up Sent | Awaiting Response | none |
| No Response | No Response | none |
| Responded (no open "Schedule Meeting" task) | Review Reply | review_reply |
| Responded (task exists, i.e. after "Interested") | Set Meeting | schedule_meeting |
| Meeting Scheduled, not yet passed | Attend Meeting | none |
| Meeting Scheduled, end time passed | Update Meeting Outcome | meeting_outcome |
| In Discussion / Due Diligence | Send Term Sheet / LOI | send_term_sheet |
| Term Sheet / LOI Sent | Mark Closed Won/Lost | close_deal |
| Closed Won / Lost | Deal Closed | none |
| Nurture | Recontact Later | none |
| Do Not Contact | "—" | none |

## 5.4 The five Next Step action modals (shared `use-next-step-actions.tsx`)

**a) Compose Email Modal** (covers Send Email / Send Follow-Up / Send Term Sheet — title
and subject/body boilerplate change per kind): Recipient dropdown (firm's contacts, or
manual Name/Email fallback), Subject (pre-filled), Message (pre-filled, editable),
attachment picker (base64-encoded client-side, removable pills), note about auto-appended
signature. Submit posts `/api/outreach/send` — blocked with "Outreach is blocked." if
firm is Do Not Contact; requires connected mailbox ("NEEDS_REAUTH"); on success logs
Activity, completes the pending task, and **auto-advances the stage**
(email_sent/follow_up_sent/term_sheet_sent).

**b) Schedule Meeting Modal**: Contact/ad-hoc fields, Title (pre-filled "Call — [Firm]"),
Date, Time, Duration, Location/Link, Agenda Notes. Submit posts `/api/meetings` — blocked
if Do Not Contact; creates a real calendar event, logs Activity, **sets stage to
`meeting_scheduled`**, marks the pending task done.

**c) Review Reply Modal**: "Interested" / "Not Interested" buttons. Interested → creates
the "Schedule Meeting" task (stage stays "Responded," but Next Step flips to "Set
Meeting"). Not Interested → moves stage straight to **Nurture**.

**d) Meeting Outcome Modal** (shown once the meeting's end time passes): "In Discussion /
Due Diligence" (→ stage `in_discussion_diligence`, creates "Send Term Sheet" task),
"Declined" (→ **Nurture**), or "Reschedule Meeting" (reveals Date/Time/Duration fields,
updates the same calendar event in place, stage unchanged).

**e) Close Deal Modal**: pick Closed Won/Lost, then optional Deal Notes, then **Confirm
Closed Won/Lost** — `PATCH` sets the stage and notes.

## 5.5 Do-Not-Contact, enforced in three places
1. Kanban drag (client-side no-op).
2. `POST /api/meetings` (server 403).
3. Outreach send, both single and bulk (server 403 "Outreach is blocked").
The Actions tab's bulk "Change CRM Stage" is the one UI path that can still move a firm
into or out of Do Not Contact manually.

---

# 6. Firms Database (`/firms`)

## 6.1 Main page
**Header**: title + live count; **Add Firm** button (opens Add Firm modal).

**Filter bar**: search (name contains), **All Strategies** / **All Focus Areas** / **All
Stages** / **All Sources** (Seed/Manual/Comparable) / **All Classification**
(Classified/Needs Review/Unclassified) / **All Domains** (Resolved/Ambiguous/Unresolved) /
**Any Mandate** (Within/Outside/Unconfirmed) dropdowns. Once any filter is active: **Clear
Filters** and **Populate using current filters** (opens Populate modal pre-loaded with
the current Strategy/Focus Area as search criteria) appear. Results capped at 500,
newest-first.

**Bulk selection bar** (appears once ≥1 row checked): **Find Similar Firms** (runs
Populate's "similar to this firm" server-side per selected firm, silently adds
candidates, no modal), **Bulk Delete** (soft-deletes all selected, no confirm), **Clear
Selection**.

**"Show By" control**: "Main Database" default, or a **Projects ›** flyout submenu to
filter the grid to one project's firms.

**Table columns**: checkbox, Firm Name, HQ, Strategies (≤3 pills), Focus Areas (≤3
pills), AUM, CRM Stage pill, **Next Step**, notification bell (unread count tooltip),
Primary Contact, Email (+ status pill).
- Row click opens the Firm Drawer; right-click opens the Firm Context Menu.
- Loading: "Loading…" row. Empty: "No firms yet. Click Add Firm to get started."

## 6.2 Firm Context Menu (right-click)
1. **Edit** — opens Firm Drawer.
2. **Add to Project** — opens Add to Project modal.
3. **Assign** (submenu on hover): scrollable active-user list — clicking directly `PATCH`es
   `ownerId`, no confirm — plus, in the same flyout, **Add Task** and **Add Note**.
4. **Find Similar Firms** — opens Populate modal seeded to this firm.
5. **Visit Website** — only if domain resolved; opens `https://{domain}` in new tab.
6. **Delete** (red) — `confirm()`: "Delete `{name}`? This soft-deletes the firm — it can
   be restored later from Settings." → `DELETE /api/firms/{id}`.

## 6.3 Add Firm Modal
Two tabs:
- **By Name**: textarea, one name per line/comma-separated. Explains automatic domain
  resolution, AUM research, classification, and contact-finding. **Add & Research**
  streams live NDJSON per-firm progress (step tracker, e.g. "Firm 2 of 5: [Name]"). Result
  screen: green "N added and fully researched" / amber "N need domain confirmation" /
  gray "N skipped as existing duplicates" pills, itemized lists, red failure box, amber
  incomplete-research warnings. **Done** button.
- **By Strategy & Focus Area**: Strategies/Focus Areas taxonomy pickers, Market text,
  AUM min/max, Number of firms to add (1–50, default 10). **Search & Add** (disabled
  unless ≥1 criterion set) posts `/api/populate` mode `by_criteria`, same streaming UI,
  result pills: blue "N candidates found" / green "N new firms added" / gray "N skipped."

## 6.4 Populate Modal (reused from main page, drawer, and context menu)
Three modes: **Similar to a Firm** (read-only seed firm name), **By Strategy & Focus
Area** (same fields as Add Firm's criteria tab, plus **Clear Selection**), **Across Entire
Database** (no inputs — samples the 10 most recently added firms, adds up to 20 new firms
per run). **Run Populate** streams the same progress UI and result-pill pattern. **Cancel**
before running.

## 6.5 Firm Drawer (shared with Contacts, CRM, Projects pages)
Slide-out panel. Title = firm name; subtitle = HQ + domain link ("no domain resolved" if
none).

**Top badges**: CRM stage pill, source-type tag, amber "Domain: {status}" pill if
unresolved, amber "Needs classification review" if applicable. Buttons: **Add to
Project**, **Find Similar Firms**, **Delete** (soft-delete confirm, mentions contacts/
activity/tasks preserved).

**Domain-confirmation gate** (shown while unresolved): explains Find Contact/Find Email
need a confirmed domain; text input + **Confirm Domain** button strips protocol/www/path
and `PATCH`es `domainResolutionStatus: "resolved"`.

**Next Step banner**: label + action button if one applies.

**Quick-edit row**: CRM Stage dropdown (immediate `PATCH`), Owner dropdown (immediate
`PATCH`), read-only AUM display (value + confidence + as-of date).

**Within Mandate row**: colored pill; if manually overridden, **Clear Override** link
resets it and recalculates from current mandate band.

**Tabs — Overview**: Strategies/Focus Areas accordions (tag pills), **Reclassify** button
(re-runs Classification Engine), a Strategy Detail textarea (note: currently
display-only/uncontrolled in this view — edits here are not persisted), "Similar To" tag
list (dimmed "(deleted)" if a linked firm was soft-deleted).

**Tabs — Contacts**: **Find Contact** button (requires resolved domain; runs name/title/
LinkedIn research + auto Hunter.io email lookup if configured; warns if Hunter isn't
configured), **Add Contact** button (manual entry modal). Each contact row: name (+
"Primary" tag), title, email or **Find Email** link (disabled without a resolved domain;
Hunter.io lookup, warns if nothing found), alternate emails list, status pill, Edit
(pencil), Delete (trash — `confirm()`, hard-deletes if no threads/meetings tied to the
contact, else soft-deletes via `removedAt`).

**Tabs — Activity**: reverse-chronological read-only log (type, timestamp, author).

**Tabs — Tasks**: checkbox (toggle open/done), title (strikethrough when done), priority
pill (only if not medium), due date, trash-can delete (`confirm()`).

*(Note: the drawer also fetches meetings/emailThreads/researchSources from the API, but
none of these have a dedicated tab in this view — meetings feed the Next Step
calculation behind the scenes only.)*

## 6.6 Remaining Firms-module modals
- **Add Contact Modal**: Name (required), Title, Email, LinkedIn URL. Posts
  `/api/firms/{id}/contacts`.
- **Edit Contact Modal**: Name, Title, Primary Email, Alternate Emails (tag list),
  LinkedIn URL. `PATCH /api/contacts/{id}`.
- **Add Note Modal**: single Note textarea. Posts `/api/firms/{id}/notes`.
- **Add to Project Modal**: lists every project with a per-row **Add** button (turns
  green "Added" on success, multiple projects addable in one sitting). **Done** to close.
- **Quick Add Task Modal**: Task Type dropdown (Send Email/Send Follow-up/Schedule
  Meeting/Send Term Sheet/Custom Task — custom reveals a Title field), Assign To, Due
  Date. Posts `/api/tasks`.
- **Taxonomy Picker** (shared control, not a modal): parent/child checkbox tree used
  inside Add Firm and Populate criteria modes — parent toggle, expand/collapse chevron,
  2-column child checkbox grid, child-count badge on the parent label.

---

# 7. Reports (`/reports`)

**Purpose:** Read-only analytics — pipeline funnel, response rate, closed-won list — plus
a CSV export.

**Header**: title/subtitle, and **Export CSV** button — a plain link to
`/api/reports/export` (browser-native file download via `Content-Disposition:
attachment`, not an in-page fetch; gated on `export_data` permission, a 403 here shows raw
JSON since it's a plain link rather than an app-rendered error).

All three cards populate from one `GET /api/reports/summary` call on load (no per-section
skeleton — nothing renders until it resolves):

- **"Pipeline Conversion Funnel"**: one small tile per CRM stage (all 13), colored pill +
  count. Not interactive.
- **"Outreach-to-Response Rate"**: Sent / Replied / Response Rate (%) — three plain
  numbers.
- **"Closed — Won"**: every Closed Won firm, name + deal notes (or "—") + stage-change
  date. Empty: "No closed-won deals yet." Not clickable.

No filters, search, sort, or inline editing anywhere on this page.

---

# 8. Settings (`/settings`)

Five tabs across the top: **Account Settings**, **My Account**, **Team & Roles**,
**Taxonomy**, **Recently Deleted**. Switching tabs doesn't reload the page.

## 8.1 Account Settings tab
Four stacked cards, loaded on mount:

- **Integration Status** — read-only colored pills per integration (Anthropic, Hunter,
  Google, Microsoft): "configured" (green) or "not configured" (gray).
- **Mandate AUM Band** — Min/Max AUM inputs, caption warning that saving immediately
  recomputes Within Mandate for every firm. **Save** button (`PATCH
  /api/settings/mandate` → upserts the band, then recomputes every firm's flag; no success
  count shown in the UI, the button just stops spinning).
- **Hunter.io & Follow-Up Threshold** — masked API-key input (shows "(configured)" in
  green if already set), numeric threshold-days input. **Save** (`PATCH
  /api/settings/app`; key encrypted server-side before storage, never round-tripped back
  in plaintext). Green "Saved." or red error message on completion.
- **Reclassify All** — one button, label flips to "Reclassifying…" while running
  (`POST /api/settings/reclassify-all`, requires `manage_settings`). Result: "N of M firms
  updated."

## 8.2 My Account tab
One card: **Connected Email Account**. Reads `?connected=1` / `?error=...` URL params to
show a green success banner or red failure banner.

- **No mailbox connected**: explanatory text + **Connect Gmail** / **Connect Outlook**
  buttons (plain OAuth-redirect links).
- **Connected**: status pill (green "connected" / red e.g. "needs_reauth") + provider and
  address. If `needs_reauth`: extra **Reconnect Gmail**/**Reconnect Outlook** buttons.
  Always-shown **Disconnect** button (`POST /api/email-connections/disconnect`, flips
  back to "no mailbox connected" view).

## 8.3 Team & Roles tab

**Team card**: **Invite** button (opens Invite modal); each user row shows name (+
"Owner" pill if applicable), email + role, status pill (active/pending_invite/
deactivated), and status-dependent actions:
- Pending → **Resend**, **Revoke**.
- Active non-owner → **Deactivate**.
- Everyone → **Edit**.
- Non-owner, non-active → **Delete**.

**Invite flow**: Name, Email, Role dropdown. **Send Invite** → `POST /api/users` (rejects
duplicate emails). Opens "Invite Sent" modal: green confirmation if the invite email
actually sent from the inviter's mailbox, or an amber warning + copyable invite link if
not.

**Resend** → same-style "Invite Resent" modal. **Revoke** → hard-deletes the still-pending
user row, no confirm.

**Deactivate** → server checks if the person owns any firms first; if so, returns
`REASSIGN_REQUIRED` and the UI opens a **"Reassign Firms Before Deactivating"** modal
(dropdown of other active users, **Cancel** / **Reassign & Deactivate**) — confirming
bulk-reassigns every owned firm, notifies the new owner ("firms_reassigned"), then
deactivates. Zero owned firms → deactivates immediately with no prompt.

**Edit** → modal with Name/Email/Role. Email field is disabled unless status is still
`pending_invite` (email is locked once the account has been activated, since it's the
login identity). Role dropdown disabled entirely for the account owner. Saving fires a
`role_changed` notification if the role actually changed.

**Delete** → native `confirm()`: "Delete {name}? This cannot be undone." Server refuses to
delete the owner, refuses to delete anyone still `active` (must deactivate first), and
refuses if the person has historical records tied to them (shows an alert, they stay
"deactivated" permanently in that case).

**Roles card**: **Create Role** button; each role row shows name, gray "System" pill if
built-in, and a caption ("all_firms · 5 permissions · 2 users"). Non-system roles get a
**Delete** button (system defaults never do).

**Create Role modal**: Role Name, Data Scope dropdown (All Firms / Owned Firms Only), a
full permission checklist (edit_firms, manage_contacts, send_outreach, manage_meetings,
manage_tasks, run_populate, export_data, manage_settings, manage_team) each with a
plain-language description. **Create Role** disabled until named.

**Delete Role** → no client confirm; server enforces zero-assigned-users (shows an
`alert()` with the count otherwise) and refuses for system-default roles regardless.

*(Note: there is no "Edit Role" button anywhere in the UI, even though the server supports
it — roles can currently only be created or deleted from this screen.)*

## 8.4 Taxonomy tab
Two side-by-side editor cards: **Strategies** and **Focus Areas** (the global,
platform-wide taxonomy — distinct from each Project's own taxonomy tab).

Each card: **Save Changes** button (disabled until something changed), and — Strategies
only — an **Add Funds Category** shortcut (one click creates an empty "Funds" parent and
immediately AI-generates its children; errors if "Funds" already exists). "New category
name…" text box + **Add Category** button (Enter also adds).

Each parent category renders as its own box: editable name field, a sparkle-icon
"Generate subcategories with AI" button (`POST /api/taxonomy/generate-children`, merges
suggestions into the children list — nothing saved until Save Changes), a trash icon
(confirm: "Remove the '{parent}' category and all its subcategories?"), each child with
its own rename field + tiny trash icon, and an "+ Add subcategory" link. **Save Changes**
does a full replace via `PATCH /api/taxonomy` — this only edits the shared dictionary used
elsewhere in the app; it does not itself reclassify any firm (that's the separate
Reclassify All / per-firm Reclassify actions).

## 8.5 Recently Deleted tab
Lists soft-deleted firms (`deletedAt` set). Empty: "Nothing deleted." Each row: name,
**Restore** button (clears `deletedAt`, firm reappears everywhere), **Delete Permanently**
(red; native confirm explaining it removes the firm and all its contacts/activity/tasks/
meetings for good and cannot be undone — a genuine irreversible hard delete, distinct from
Restore).

---

# 9. Auth pages (outside the app shell)

## `/login`
Centered card, "NC" mark + wordmark. Email, Password (`PasswordInput`), "Remember me"
checkbox (checked by default), "Forgot password?" link. **Sign In** button ("Signing
in…" while loading). Server requires the account be `active` (pending/deactivated show
the same generic "Invalid email or password" — status is never leaked), verifies bcrypt
hash, sets a signed httpOnly session cookie (30-day validity regardless; "Remember me"
controls whether the *browser cookie itself* persists or is cleared on browser close). On
success → `/dashboard`.

## `/forgot-password`
Email field, **Send Reset Link** button. Regardless of whether the email exists, always
shows: "If an account exists for {email}, a reset link has been sent." (deliberate
non-disclosure).

## `/reset-password?token=...`
New Password / Confirm New Password (min 8 chars, must match — checked client-side before
any network call). **Reset Password** (disabled with no token in URL). On success: "Your
password has been reset." + **Sign In** button.

## `/accept-invite?token=...`
No token → immediate red "Missing invite link", nothing else shown. Valid token → fetches
and pre-fills Email (disabled, fixed at invite time) and Name (editable); Password/Confirm
Password fields (same 8-char/match rules). **Accept Invitation** → logs in and redirects
straight to `/dashboard` on success.

---

# 10. Layout shell

## Sidebar
Fixed left rail. Logo mark + wordmark. Nav items, in order: **Dashboard, Projects,
Messages, Contacts, CRM Pipeline, Firms Database, Reports, Settings**. Active item (or any
sub-route beneath it) gets a solid highlight; inactive items get a hover highlight only.
Footer caption: "Adcapital Partners / NCM International."

## Topbar
**Notification bell**: red badge with unread count if any. Dropdown panel: **Clear All**
link (hard-deletes every notification, not just marks read), a desktop-notification
opt-in row (or a note if browser-denied), each notification row (message, blue "New" pill
if unread, relative timestamp) — clicking navigates to the related firm and marks just
that one read. Empty: "You're all caught up." Behind the scenes: polls every 20s, plays a
generated two-tone chime on new unread items, and (if permitted) pops up to 3 native OS
notifications.

**User menu**: avatar + name, dropdown with **Settings** link and **Log Out** (`POST
/api/auth/logout` → redirect to `/login`).
