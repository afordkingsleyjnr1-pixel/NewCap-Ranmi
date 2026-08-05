# Ranmi Platform Architecture — Skeleton vs. Dynamic

This maps the **current codebase** (v1, single-tenant, firm-shaped) against the **v2 plan**
(multi-tenant, dynamic entities — see `docs/build-spec-v2-dynamic-platform.md`), so it's
clear exactly what stays fixed infrastructure ("skeleton") and what becomes project-defined
("dynamic") in the rebuild.

---

## Layer 1 — Skeleton (fixed, same for every org/project, never varies)

This is infrastructure. It doesn't know or care what kind of thing a project is tracking.

| Subsystem | Current code | Stays fixed because |
|---|---|---|
| **Auth & sessions** | `src/lib/session.ts`, `src/app/api/auth/*` | Login/session/password-reset is identical regardless of what a project tracks |
| **Users & Roles/Permissions** | `User`, `Role` models, `src/lib/permissions.ts`, `team-invite.ts` | Org membership and permission scopes are structural, not content |
| **Organization/tenancy layer** *(new in v2)* | n/a yet — needs building | The isolation boundary itself; every project lives inside one |
| **Project container** | `Project`, `ProjectMember` models | The *shell* that holds a project's config is fixed; what's inside it is dynamic |
| **Email integration engine** | `google-oauth.ts`, `microsoft-oauth.ts`, `email-send.ts`, `EmailConnection`, `EmailThread`, `EmailMessage`, `MessageDraft`, `src/app/api/webhooks/gmail`, `outlook` | OAuth, send/receive, reply-threading — entity-agnostic; only *what you link a thread to* is dynamic |
| **Calendar/Meetings engine** | `calendar.ts`, `Meeting` model | Same reasoning — scheduling mechanics don't change per project |
| **Task engine** | `pipeline-tasks.ts`, `Task`, `TaskComment` models | Tasks/checklists are already generic; just need to point at dynamic Entities instead of `Firm` |
| **Notification system** | `notifications.ts`, `Notification` model | Delivery mechanism is generic |
| **AI research *engine*** (queueing, calling Anthropic, web search, Hunter.io lookups, dedupe/ranking logic) | `contact-discovery.ts`, `contact-ranking.ts`, `dedupe.ts`, `hunter.ts` | The *machinery* that runs a research job and enriches contacts is reusable; only the *prompt content and field targets* are dynamic (see Layer 2) |
| **Populate ("Find Similar") engine** | `populate.ts`, `PopulateRun` model | The similarity-search mechanism is generic; what "similar" means is defined by the project's EntityType/taxonomy |
| **Reporting/export engine** | `src/app/api/reports/*` | The export/aggregation mechanism is fixed; the columns it reports on are dynamic |
| **Activity log / audit trail** | `ActivityLog` model | Generic event log, entity-agnostic once repointed at Entities |

---

## Layer 2 — Dynamic (project-defined, varies per project)

This is everything that currently hardcodes "firm" or "capital-raising" assumptions —
these become configuration, not schema.

| Concept | Current (fixed) | Becomes (dynamic) |
|---|---|---|
| **The tracked thing itself** | `Firm` model — fixed columns: `domain`, `hqLocation`, `aumValue`, `aumDisplay`, `aumConfidence`, `strategies`, `focusAreas`, `withinMandate` | Generic `Entity` + project-defined `EntityType`/`FieldDefinition`/`FieldValue` (§2 of build spec v2). A project can define "Firm" with AUM, or "Person" with none of that |
| **Taxonomy** | `src/lib/taxonomy.ts` — single global Strategies/Focus Areas tree, `TaxonomySet`/`TaxonomyKind` | Per-project taxonomy tree, AI-assisted generation (`generate-children`) scoped to the project's own EntityType |
| **Pipeline/CRM stages** | `CrmStage` enum — fixed 13-value list (not_contacted → closed_won/lost, term_sheet_sent, etc.), one `CrmStageRow` per Firm | Per-project `PipelineDefinition` — ordered custom stage list; new projects get a starter template (Found → Qualified → Contacted → Engaged → Won) but can fully rename/reorder/replace it |
| **Mandate/qualification criteria** | `MandateSettings` — singleton table, hardcoded `aumMin`/`aumMax` | Project-defined qualification rules, expressed against whatever fields that project's EntityType defines |
| **AI research targets** | `firm-core-research.ts` — hardcoded prompt for domain/AUM/strategy/contacts | Prompt *generator* built from each EntityType's fields flagged "AI-researchable" + a hint string (§4 of build spec v2) |
| **Dashboard entity labels** | Hardcoded "Firms Database," "Organizations" | Generic labels (Records/Entities) or dynamically reflecting the project's EntityType name |
| **Project↔entity linking** | `ProjectFirm` — join table, but always linking to the one global `Firm` table (projects today are really just *filtered views* over one shared firm list, not independent schemas) | True project-scoped Entities, with the cross-project reuse/scope-mismatch-alert logic from §2.4 of build spec v2 |

---

## The one structural gap in the current code, worth naming explicitly

Today's `Project`/`ProjectMember`/`ProjectFirm` already look like a multi-project system,
but they're not what they appear to be: every project draws from the **same single global
`Firm` table** and the **same single global `CrmStage` enum** — a project is just a saved
filter/grouping, not an independently-schemed container. The v2 rebuild's core lift is
making `Project` an actual schema boundary (its own EntityTypes, its own pipeline), not
just a label applied to rows in a shared table.

---

## Quick mental model

- **Skeleton = the building.** Walls, wiring, plumbing — auth, tenancy, email, calendar,
  tasks, notifications, the research/enrichment machinery, reporting engine. One design,
  reused by every tenant and every project.
- **Dynamic = the floor plan.** What rooms exist, what they're called, how they connect —
  EntityTypes, fields, taxonomy, pipeline stages, research targets. A different project
  draws a completely different floor plan on the same building.
