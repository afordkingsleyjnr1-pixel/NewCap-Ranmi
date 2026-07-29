# How Claude Code should build the target platform from this codebase

Audience: a Claude Code session (this one or a future one) that already has the
real-estate platform's code and needs to turn it into the target "Project as base" system
described in `docs/platform-vision.md` and §25–26 of `docs/platform-build-prompt.md`.

## What this build actually is — corrected scope

An earlier pass at this document (and the plan behind it) assumed a fully generic
field-type engine — arbitrary new `EntityType`/`FieldDefinition` records, any field
addable/removable/typed by the user. **That is not what's being asked for.** The corrected,
much smaller scope is:

**The platform's structure stays completely unchanged** — the same entity record shape
(name, domain, HQ, AUM, target markets, contacts, activity log, messages, tasks), the same
research/enrichment engine, the same reporting engine, the same everything documented in
§0–24 of `platform-build-prompt.md`. **Exactly three things move from "one fixed global
answer" to "generated per Project from what the user describes at onboarding":**

1. **Classification** — today a single hardcoded global AUM Mandate band
   (`MandateSettings`, `WithinMandate`). Becomes per-Project qualification criteria.
2. **Taxonomy** — today a per-project override of a global default (already built:
   `Project.taxonomy`, describe → generate → review → confirm). Becomes the primary,
   required configuration step rather than an optional override.
3. **CRM Stages** — today a single hardcoded global 13-value `CrmStage` enum. Becomes a
   generated, ordered stage list per Project.

Plus: a new Project starts with a clean, empty data set (no shared/seeded firms).

**There is no generic field-builder, no arbitrary field types, no `FieldDefinition`
engine.** The Firm record's actual columns (domain, HQ, AUM, target markets, etc.) are
unchanged — they may simply go unused for a Project whose classification doesn't need
them (e.g. a recruiting-focused Project has no use for "AUM," and that's fine; the field
just isn't part of that Project's classification/taxonomy, not deleted or replaced).

## The one hard lesson already learned here

An earlier attempt at a *bigger* version of this build (the generic field-engine version,
now known to be the wrong scope) was done as one large, all-at-once schema rewrite across
~100 files in a single pass. It broke the app — schema changed, but services/routes/UI
didn't get finished in the same pass — and had to be fully reverted.

**Do not repeat that**, even at this smaller, corrected scope. Transform incrementally,
keep the app buildable and runnable after every commit, and prove each phase works before
starting the next one.

## Guiding rule for every phase below

After every phase: run `npx tsc --noEmit`, run the app, exercise the actual feature you
just touched in the browser (or via `curl` against the dev server), and only then commit.
If a phase can't be completed in one sitting, stop at a point where the app still
compiles and runs — even if that means the new feature is half-built but inert — never at
a point where existing functionality is broken.

## Phase 1 — Schema: add, don't replace

Add three things, additively, alongside what exists today:
- `PipelineStage` (per project, ordered list — see the shape already drafted in
  `docs/build-spec-v2-dynamic-platform.md` §2.3, minus the FieldDefinition/EntityType
  parts which are out of scope now) and an `EntityStage`-equivalent replacing
  `CrmStageRow`'s fixed enum reference with a reference to a `PipelineStage` row.
- `QualificationRule` (per project — a field key + numeric min/max, generalizing
  `MandateSettings`' fixed AUM band to whichever field this Project's classification
  actually cares about).
- Nothing new for taxonomy — `Project.taxonomy` already exists and already does this job.

Nothing reads or writes these new tables yet. Confirm `tsc` and the existing app are both
unaffected — this phase should produce zero behavior change.

## Phase 2 — Onboarding flow generating all three

Build (or extend) the project-onboarding UI/API so that one description produces all
three artifacts in one sitting: Classification (qualification rule(s)), Taxonomy (already
built — just make it the primary/required step), and CRM Stages (new). Reuse the existing
describe → generate → review → confirm plumbing in `api/projects/[id]/taxonomy/route.ts`
(`runCompletion`, `extractJson` from `src/lib/anthropic.ts`) as the literal template for
the two new generators — same pattern, new prompts. At the end of this phase, a Project
can have generated `PipelineStage` rows and a `QualificationRule` sitting in the database
— still nothing in the rest of the app reads them yet.

## Phase 3 — Wire the CRM Pipeline UI to per-Project stages

Change the kanban (`kanban.tsx`) and the Next Step engine (`crm-stages.ts`) to read a
Project's own `PipelineStage` list instead of the fixed `CRM_STAGES` constant — this is
the one place real UI/logic rework happens, since `crm-stages.ts` today is an exhaustive
switch keyed to literal stage names. Preserve the automation power (auto follow-up tasks,
the closing checklist, Do-Not-Contact-style terminal stages) by making it data-driven per
stage row rather than hardcoded per literal name (this exact design was already drafted
once — the `pipeline-engine.ts` sketch from earlier in this project's history is a
reasonable starting point, just re-verify it against the current schema rather than
reusing it blindly).

## Phase 4 — Wire classification/qualification to per-Project rules

Replace `mandate.ts`'s hardcoded AUM-band logic with a lookup against the Project's own
`QualificationRule`(s) — same idea, generalized to whatever field the Project's
classification actually specifies (which may or may not be AUM).

## Phase 5 — Cut real projects over, one at a time

Only once Phases 1–4 are proven working end-to-end does an existing project move off the
fixed global `CrmStage`/`MandateSettings`. Do this per-project, not as a global schema
rename, so a project that hasn't onboarded onto per-Project stages/classification keeps
working exactly as it does today throughout.

## Phase 6 — Only after everything is migrated, retire the old global structures

Deleting the global `CrmStage` enum and `MandateSettings` singleton is the **last** step,
done only once every project has migrated and the new system has run in production long
enough to trust it.

## What to reuse vs. rebuild — quick reference

| Layer | Action |
|---|---|
| Entity record shape (Firm's actual fields), auth, sessions, permissions, notifications, email/calendar OAuth, attachments, research engine, reporting engine, design system | Reuse entirely, unmodified — none of this changes |
| `Project.taxonomy` generate/review/confirm plumbing | Reuse as the literal template for the two new generators (classification, CRM stages) |
| `crm-stages.ts`'s hardcoded switch, `MandateSettings`'s fixed AUM band | Replace with per-Project data, per Phases 3–4 |

## Source documents to build from

- `docs/platform-vision.md` — the corrected product framing (three things generated per
  Project; everything else unchanged).
- `docs/build-spec-v2-dynamic-platform.md` §2.3 (pipeline shape) and the qualification-
  rule concept — useful as data-shape reference, but ignore the EntityType/FieldDefinition
  parts of that document, which describe the larger, out-of-scope version of this build.
- `docs/platform-build-prompt.md` §0–24 — exactly what the current app does today, the
  baseline every phase above must not regress.
