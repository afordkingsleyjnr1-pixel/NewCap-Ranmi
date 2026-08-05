# How Claude Code should build the target platform from this codebase

Audience: a Claude Code session (this one or a future one) that already has the
real-estate platform's code and needs to turn it into the target "Project as base" system
described in `docs/platform-vision.md` and §25–26 of `docs/platform-build-prompt.md`.

## What this build actually is

**The platform's mechanics stay completely unchanged** — auth, sessions, permissions,
notifications, email/calendar OAuth, attachments, the research/enrichment engine's
machinery, the reporting engine, Messages, Tasks, Settings, the design system. None of
that is rebuilt.

**Four things move from "one fixed global answer" to "generated per Project at
onboarding, and editable afterward":**

1. **Entity fields** — today, `Firm` has a fixed set of real-estate columns (domain, HQ,
   AUM, target markets). Becomes whatever fields a Project actually needs, generated from
   the onboarding description, and **editable on an ongoing basis** — add/remove/rename a
   field even after firms already have data in it.
2. **Classification** — today, a single hardcoded global AUM Mandate band. Becomes
   per-Project qualification criteria, generated and later editable.
3. **Taxonomy** — today (§10), a project can *optionally* override the one global
   taxonomy. Becomes the required first step, same describe → generate → review → confirm
   flow already live, editable/regeneratable afterward exactly as it already is today.
4. **CRM Stages** — today, one fixed global 13-value `CrmStage` enum. Becomes a generated,
   ordered stage list per Project, freely rename/reorder/add/replace afterward.

Because entity fields are **ongoing-editable, even with existing data present**, they
cannot be modeled as rigid, fixed database columns per field (that would need a schema
migration every time a user adds/removes a field). They need the flexible-storage pattern:
a generic `Entity` record with a `data` JSON blob keyed by field key, plus a
`FieldDefinition` table describing what fields currently exist for a Project's entity
type. This is exactly the `EntityType`/`FieldDefinition`/`Entity.data` design already
drafted in `docs/build-spec-v2-dynamic-platform.md` §2.1–2.2 — that design was correct;
what changed across this project's history was confidence about whether it was in scope,
not the design itself.

## The one hard lesson already learned here

An earlier attempt at this exact build was done as one large, all-at-once schema rewrite
across ~100 files in a single pass — Prisma schema changed, but services/routes/UI didn't
get finished in the same pass, leaving a non-compiling, non-running app. It had to be
fully reverted.

**Do not repeat that.** The instruction for this build is: transform incrementally, keep
the app buildable and runnable after every single commit, and prove each phase works
before starting the next one. This is slower per-commit but is the only approach that
doesn't risk losing a working product mid-rebuild.

## Guiding rule for every phase below

After every phase: run `npx tsc --noEmit`, run the app, exercise the actual feature you
just touched in the browser (or via `curl` against the dev server), and only then commit.
If a phase can't be completed in one sitting, stop at a point where the app still
compiles and runs — even if that means the new feature is half-built but inert (e.g. a new
Prisma model exists but nothing writes to it yet) — never at a point where existing
functionality is broken.

## Phase 1 — Add, don't replace (schema)

Add the new tables (`EntityType`, `FieldDefinition`, `Entity` with a `data` Json column,
`PipelineStage`, `EntityStage`, `QualificationRule` — shapes per
`docs/build-spec-v2-dynamic-platform.md` §2) **alongside** `Firm`/`CrmStageRow`/
`MandateSettings`, not instead of them. Nothing reads or writes the new tables yet. Run
the migration, confirm `tsc` and the existing app are both unaffected — this phase should
produce zero behavior change, purely additive schema.

## Phase 2 — Onboarding flow, generating into the new tables only

Build the project-onboarding UI/API (describe → generate all four artifacts — entity
fields, classification, taxonomy, CRM stages → review → confirm) targeting the new
tables, reusing the exact describe/generate/review/confirm plumbing already live in
`api/projects/[id]/taxonomy/route.ts` (`runCompletion`, `extractJson` from
`src/lib/anthropic.ts`) as the direct template for the three new generators. At the end
of this phase, a project can have a generated `EntityType` + `FieldDefinition`s +
`PipelineStage`s + a `QualificationRule` sitting in the database — still nothing in the
rest of the app reads them. Verify by generating manually and inspecting the DB rows;
existing Firm/CRM functionality is completely untouched and still works.

## Phase 3 — The ongoing field editor

Build the settings screen that lets a Project's `FieldDefinition`s be added/removed/
renamed after the fact. The tricky part isn't the UI — it's deciding what happens to
existing `Entity.data` values when a field is removed or renamed: removing a field should
leave the data in place but hidden/unused (never silently delete user data), renaming
should carry the existing values forward under the new key. Get this behavior right and
tested before moving on — it's the one place data-loss risk actually exists in this whole
build.

## Phase 4 — One new, parallel UI surface reading the new tables

Build a *new* route (e.g. `/projects/[id]/entities`) rendering a project's dynamically-
defined entities using its current `FieldDefinition`s — a generic table/drawer, reusing
the existing `Object.entries()`-over-JSON pattern already used for Firm's `strategies`/
`focusAreas` accordions as the template for a fully dynamic field renderer. This is new,
additive code — not a modification of `/firms`. At the end of this phase, the old fixed
Firms Database (untouched, still fully functional) and the new generic entity view run
side by side.

## Phase 5 — Wire the AI/automation engines to the new model, still in parallel

Build `entity-core-research.ts` (prompt generated from `FieldDefinition.aiResearchable`
fields, per `docs/build-spec-v2-dynamic-platform.md` §4). **This must call
`runWebResearch()` in `src/lib/anthropic.ts` (not `runCompletion()`)** — the function that
enables both of Claude's server-side tools: `web_search` (finds relevant pages) and
`web_fetch` (pulls full page content directly once a URL is known, avoiding extra search
calls to piece together snippets from search results alone). This is the exact mechanism
`firm-core-research.ts` already uses today (§2 of `platform-build-prompt.md`) and it must
carry forward unchanged into the generic version — only the prompt content changes
(generated from field definitions instead of hardcoded to Firm's columns), not the
underlying tool wiring. Also build a generic pipeline engine
(data-driven Next Step, auto-task/auto-checklist, terminal stages, branching — a
reasonable starting sketch already exists from earlier in this project's history, but
re-derive/re-verify it against the current schema rather than reusing old code blindly).
These are new files; they don't modify `firm-core-research.ts` or `crm-stages.ts`. Verify
end-to-end against a project using the new system, with the old system still provably
working in parallel.

## Phase 6 — Cut real projects over, one at a time

Only once Phases 1–5 are proven working end-to-end does an existing project actually move
off the fixed Firm/CrmStage model — per-project, not a global schema rename, so a project
that hasn't onboarded onto the new system keeps working exactly as it does today
throughout.

## Phase 7 — Only after everything is migrated, retire the old code

Deleting `Firm`, `CrmStageRow`, `CrmStage`, `MandateSettings`, `crm-stages.ts`,
`firm-core-research.ts`, the `/firms` and `/crm` routes/pages, is the **last** step, done
only once every project has been migrated and the new system has been running in
production long enough to trust it. Keeping the old code around costs nothing; deleting it
too early is exactly the mistake already made once.

**Also retire at this point**: the Tasks module's own per-workspace taxonomy override
(`Project.taxonomy`/`taxonomyDescription`/`taxonomyConfirmedAt` on today's `Project`
model, and `api/projects/[id]/taxonomy/route.ts`, plus the Taxonomy tab in the Tasks
workspace UI). Taxonomy belongs exclusively to the new top-level Project concept now —
Tasks doesn't get its own separate classification scheme. Don't remove this until Phase 6
is done, same reasoning as everything else in this phase — but it should go, not stay
duplicated alongside the new Project-level taxonomy.

## What to reuse vs. rebuild — quick reference

| Layer | Action |
|---|---|
| Auth, sessions, permissions, notifications, email/calendar OAuth, attachments | Reuse entirely, unmodified |
| Taxonomy generate/review/confirm plumbing | Reuse as the literal template for the three new generators |
| `Object.entries()`-over-JSON rendering pattern (Firm's strategies/focusAreas) | Reuse as the template for the dynamic field renderer |
| Firm/CrmStage schema, `crm-stages.ts`, `firm-core-research.ts`, `populate.ts`'s AUM formula, `mandate.ts` | New parallel versions, don't edit in place until Phase 6 |
| Design system (`src/components/ui/`, `globals.css` tokens) | Reuse entirely, unmodified |

## Source documents to build from

- `docs/build-spec-v2-dynamic-platform.md` — the data model design (EntityType/
  FieldDefinition/PipelineStage/QualificationRule). Correct as originally drafted.
- `docs/architecture-skeleton-vs-dynamic.md` — what's fixed infrastructure vs. what varies
  per project.
- `docs/platform-build-prompt.md` §0–24 — exactly what the current app does today, the
  baseline every phase above must not regress.
- `docs/platform-build-prompt.md` §25–26 — the target navigation model this build is
  working toward.
- `docs/platform-vision.md` — the product framing (one engine, many projects, onboarding
  generates fields + classification + taxonomy + stages, all four staying editable).
