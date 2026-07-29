# How Claude Code should build the target platform from this codebase

Audience: a Claude Code session (this one or a future one) that already has the
real-estate platform's code and needs to turn it into the target "Project as base" system
described in `docs/platform-vision.md` and §25–26 of `docs/platform-build-prompt.md`.

## The one hard lesson already learned here

Earlier in this project, an attempt was made to do this as one large, all-at-once schema
rewrite: replace `Firm`/`CrmStage`/`MandateSettings` with `Entity`/`PipelineStage`/
`QualificationRule` in a single pass across ~100 files. It was committed, and it broke the
app — the schema changed but the services, API routes, and UI didn't get finished in the
same pass, leaving a non-compiling, non-running platform. It had to be reverted in full.

**Do not repeat that.** The instruction for this build is: transform incrementally, keep
the app buildable and runnable after every single commit, and prove each phase works
before starting the next one. This is slower per-commit but is the only approach that
doesn't risk losing a working product mid-rebuild.

## Guiding rule for every phase below

After every phase: run `npx tsc --noEmit`, run the app, exercise the actual feature you
just touched in the browser (or via `curl` against the dev server), and only then commit.
If a phase can't be completed in one sitting, stop at a point where the app still
compiles and runs — even if that means the new feature is half-built but inert (e.g. a new
Prisma model exists but nothing writes to it yet), never at a point where existing
functionality is broken.

## Phase 1 — Add, don't replace (schema)

Add the new tables (`EntityType`, `FieldDefinition`, `PipelineStage`, etc., per the design
already captured in `docs/build-spec-v2-dynamic-platform.md`) **alongside** `Firm`/
`CrmStageRow`/`MandateSettings`, not instead of them. Nothing reads or writes the new
tables yet. Run the migration, confirm `tsc` and the existing app are both unaffected —
this phase should produce zero behavior change, purely additive schema.

## Phase 2 — Onboarding flow, generating into the new tables only

Build the project-onboarding UI/API (describe → generate taxonomy + entity schema +
pipeline → review → confirm) targeting the new tables, reusing the exact
describe/generate/review/confirm plumbing already live in
`api/projects/[id]/taxonomy/route.ts` (`runCompletion`, `extractJson` from
`src/lib/anthropic.ts`) as the direct template for the two new generators (entity schema,
pipeline). At the end of this phase, a project can have a generated `EntityType` +
`FieldDefinition`s + `PipelineStage`s sitting in the database — still nothing in the rest
of the app reads them. Verify by generating one manually and inspecting the DB rows;
existing Firm/CRM functionality is still completely untouched and still works.

## Phase 3 — One new, parallel UI surface reading the new tables

Build a *new* route (e.g. `/projects/[id]/entities`) that renders a project's dynamically-
defined entities using its `FieldDefinition`s — a generic table/drawer, reusing the
existing `Object.entries()`-over-JSON pattern already used for Firm's `strategies`/
`focusAreas` accordions as the template for a fully dynamic field renderer. This is new
code, additive, not a modification of `/firms`. At the end of this phase you have two
parallel systems running side by side: the old fixed Firms Database (untouched, still
fully functional) and a new generic entity view that only projects opting into the new
onboarding flow use.

## Phase 4 — Wire the AI/automation engines to the new model, still in parallel

Build `entity-core-research.ts` (prompt generated from `FieldDefinition.aiResearchable`
fields, per the design in `docs/build-spec-v2-dynamic-platform.md` §4) and the generic
pipeline engine (`pipeline-engine.ts`'s design — data-driven Next Step, auto-task/
auto-checklist, terminal stages, branching — already drafted once and is a good starting
point, just re-derive it fresh rather than reusing the reverted commit's exact code
without re-verifying it against the current schema). These are new files; they don't
modify `firm-core-research.ts` or `crm-stages.ts`. Verify by running research and a stage
change against a project using the new system end-to-end, with the old system still
provably working in parallel.

## Phase 5 — Cut real projects over, one at a time

Only once Phases 1–4 are proven working end-to-end does any existing project actually
move off the fixed Firm/CrmStage model. This is the point where `Contact`/`ActivityLog`/
`EmailThread`/`Meeting`/`Task`/`Notification` foreign keys start pointing at the new
`Entity` table for projects that have opted in — do this per-project, not as a global
schema rename, so a project that hasn't onboarded onto the new system keeps working
exactly as it does today throughout.

## Phase 6 — Only after everything is migrated, retire the old code

Deleting `Firm`, `CrmStageRow`, `CrmStage`, `MandateSettings`, `crm-stages.ts`,
`firm-core-research.ts`, the `/firms` and `/crm` routes/pages, is the **last** step, done
only once every project has been migrated and the new system has been running in
production long enough to trust it. This is a deliberate, late, low-risk cleanup — not
something to rush toward, since keeping the old code around costs nothing but deleting it
too early is exactly the mistake already made once.

## What to reuse vs. rebuild — quick reference

| Layer | Action |
|---|---|
| Auth, sessions, permissions, notifications, email/calendar OAuth, attachments | Reuse entirely, unmodified |
| Taxonomy generate/review/confirm plumbing | Reuse as the literal template for the two new generators |
| `Object.entries()`-over-JSON rendering pattern (Firm's strategies/focusAreas) | Reuse as the template for the dynamic field renderer |
| Firm/CrmStage schema, `crm-stages.ts`, `firm-core-research.ts`, `populate.ts`'s AUM formula | New parallel versions, don't edit in place until Phase 5 |
| Design system (`src/components/ui/`, `globals.css` tokens) | Reuse entirely, unmodified |

## Source documents to build from

- `docs/build-spec-v2-dynamic-platform.md` — the data model design (EntityType/
  FieldDefinition/PipelineStage/QualificationRule).
- `docs/architecture-skeleton-vs-dynamic.md` — what's fixed infrastructure vs. what varies
  per project.
- `docs/platform-build-prompt.md` §0–24 — exactly what the current app does today, the
  baseline every phase above must not regress.
- `docs/platform-build-prompt.md` §25–26 — the target navigation model this build is
  working toward.
- `docs/platform-vision.md` — the product framing (one engine, many projects, onboarding
  generates the lens).
