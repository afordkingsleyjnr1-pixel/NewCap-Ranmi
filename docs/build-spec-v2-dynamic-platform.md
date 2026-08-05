# Ranmi — Multi-Tenant Dynamic BD/CRM & Research Platform

## Build Spec v2 (supersedes the fixed real-estate/firm model in v1)

### Core mandate & promise

> Ranmi helps organizations find the right opportunities, identify the right people,
> build relationships, and execute growth activities — all in one intelligent workspace.

Every part of this spec should trace back to one of these four pillars — **Find
Opportunities, Identify People, Build Relationships, Execute Growth** — rather than to
any one industry's workflow (capital introduction, recruiting, partnerships, sales, etc.
are all just different projects running on the same four pillars).

### 0. Why this rebuild exists

The current platform (NewCap Ranmi / "RE Manager Capital-Introduction BD & CRM") hardcodes
its data model to one use case: institutional real-estate investment managers, tracked by
AUM, strategy, and domain, moving through a fixed capital-raising pipeline
(Not Contacted → Outreach → Replied → Meeting → Term Sheet → Closed).

This rebuild turns Ranmi into a **multi-tenant SaaS platform** where each organization
(tenant) creates **projects**, and each project defines **its own entity types, fields,
taxonomy, and pipeline** — a project could track investment managers, or job candidates,
or conference speakers, or anything else, without any code change. This is a clean-slate
rebuild, not a migration of existing data.

---

### 1. Tenancy

- **Multi-tenant from day one.** Top-level entity is an **Organization** (the customer
  buying Ranmi), which owns Users, Projects, and all data beneath them.
- Full data isolation per organization — no cross-org data visibility, ever, including in
  shared infra (search indexes, background jobs, AI research queues).
- Roles are org-scoped (Owner, Admin, Member, etc. — reuse the existing role concept from
  `team-roles-tab.tsx` but scope it to Organization instead of globally).
- **Billing/plans are explicitly out of scope for this build.** The schema should not
  actively conflict with adding billing later (e.g., don't hardcode "unlimited" assumptions
  that are hard to retrofit with limits), but do not build Stripe, plan tiers, usage
  metering, or seat limits now — that spec will be provided separately.
- Auth: keep the current session-based auth approach, scoped to Organization membership.

---

### 2. Core object model

```
Organization
 └─ Project
     ├─ EntityType (dynamic, project-defined; e.g. "Firm", "Person", "Company")
     │    └─ FieldDefinition[]  (dynamic custom fields on that EntityType)
     ├─ Entity (an instance of an EntityType — the generic replacement for "Firm")
     │    └─ FieldValue[]  (values for that entity's EntityType's FieldDefinitions)
     ├─ PipelineDefinition (dynamic, project-defined stage list)
     ├─ Opportunity (an Entity's position in the project's pipeline; replaces "CRM stage on Firm")
     ├─ Contact (linked to one or more Entities)
     ├─ Task
     └─ ResearchJob (AI research runs, see §5)
```

#### 2.1 Mandatory core fields (every EntityType, regardless of project)

To keep cross-project rollups, global search, and the dashboard possible, every Entity —
no matter what EntityType or project — carries these fixed core fields in addition to its
custom fields:

- `name` (string, required)
- `status` (string — free text or linked to project's pipeline stage)
- `owner` (User reference)
- `createdAt` / `updatedAt`
- `entityTypeId` (which dynamic type this instance is)
- `projectId`

Everything else (AUM, strategy, domain, years of experience, whatever) is a
project-defined custom field, not a schema column.

#### 2.2 FieldDefinition types (v1 of the custom field engine)

Support at minimum: `text`, `long_text`, `number`, `currency`, `date`, `boolean`,
`single_select`, `multi_select`, `url`, `email`, `relation` (link to another Entity, same
or different EntityType), `taxonomy_tag` (link into the project's dynamic taxonomy tree —
replaces the current fixed `taxonomy.ts`).

FieldDefinitions must support: required/optional, default value, help text, display order,
and (for select types) an editable option list. Taxonomy generation (the current
`generate-children` AI-assisted taxonomy builder) becomes a per-project tool instead of
operating on the single global taxonomy.

#### 2.3 Dynamic pipeline

- `PipelineDefinition` is an ordered list of named stages, defined per project (replacing
  the fixed six-stage CRM pipeline). Each stage has a name, order, and optional color.
- New projects get a **default starter pipeline** template (e.g., Found → Qualified →
  Contacted → Engaged → Won) which the project owner can freely rename, reorder, add to,
  or replace — it is a starting point, not a constraint.
- `Opportunity` = an Entity's current stage + history of stage transitions within one
  project's pipeline (stage-transition history is what powers Pipeline Velocity in the
  Growth Score, §6).

#### 2.4 Cross-project entity reuse & scope-mismatch alerting

When a user adds an entity to a project, the system checks whether a matching entity
already exists (by name + other core-field matching heuristics) in another project owned
by the same organization:

- **If the matching entity's EntityType is schema-compatible** (same EntityType, or an
  EntityType whose custom fields are a superset/subset match) — offer to **link/reuse**
  the existing entity's record (shared identity, one record referenced from both
  projects), rather than creating a duplicate.
- **If the scope differs** (e.g., Project A tracks the entity as a "Firm," Project B is
  trying to add it as a "Person," or the field schemas don't reconcile) — do **not**
  silently merge or silently duplicate. Show an explicit alert: "This name matches an
  existing entity in [Project A] tracked as [EntityType]. The projects have different
  tracking scopes — create a separate entity for this project, or review the existing
  one." User must explicitly choose: create separate / go review existing.

---

### 3. Dashboard

Replaces the current fixed dashboard. Layout:

- **Growth Score** — headline metric, see §6 for definition. Shown with trend arrow vs.
  prior period and a one-line explanation of what moved it.
- **Summary tiles** (labels are generic/type-agnostic, not "Organizations"):
  - **Records** — count of Entities across the project (or org, if viewing an org-level
    rollup) — replaces "Organizations"
  - **Contacts**
  - **Opportunities**
  - **Tasks Due**
- **Opportunity Pipeline** — visual funnel/kanban using the *project's actual configured
  pipeline stages* (not hardcoded Found/Qualified/Contacted/Engaged/Won — that's just the
  default template a new project starts with, per §2.3).

Because entity types and pipelines are dynamic per project, an org-level dashboard
(rolling up multiple projects) can only chart on the mandatory core fields (§2.1) and
stage-transition history — it cannot show type-specific metrics like "total AUM" unless
every project in the rollup happens to define that field.

---

### 4. AI Research Engine (fully dynamic)

The current `firm-core-research.ts` hardcodes a single research prompt (domain, AUM,
strategy, contacts). This becomes a **prompt generator**:

- Each EntityType's FieldDefinitions can be flagged as "AI-researchable" with a
  short natural-language hint (e.g., field "AUM" → hint "the firm's assets under
  management, in USD"; field "Years active" → hint "how long this person/org has been
  operating in its field").
- At research time, the engine composes a research task from: the EntityType's
  researchable fields + hints, the project's taxonomy (for classification), and any
  project-level research instructions (a free-text field a project owner can set, e.g.
  "focus on institutional-grade sources only").
- Output is mapped back into FieldValues by field key — no field-specific parsing code
  needed per project.
- Contact discovery, domain resolution, and "Populate" (Find Similar) all become
  parameterized by the project's EntityType/taxonomy rather than assuming "firm."
- Keep the existing provider (Anthropic API w/ server-side web_search + web_fetch) and Hunter.io for
  email enrichment; only the prompt construction and result-mapping layer changes.

---

### 5. Growth Score — full definition

Composite, 0–100, recalculated per period (default trailing 30 days vs. prior 30 days),
displayed with trend arrow. Each of the four components maps directly to one pillar of
the core mandate, so the score reads as "how well is this project executing on Ranmi's
promise" rather than a generic deal-pipeline metric:

| Pillar | Component | Weight | Definition |
|---|---|---|---|
| Find Opportunities | Opportunity Discovery Rate | 25% | new Opportunities created this period vs. prior period |
| Identify People | People Identification Rate | 25% | new Contacts identified/linked to Entities this period vs. prior period |
| Build Relationships | Relationship Depth | 25% | % of active Opportunities that have advanced past the pipeline's midpoint (project-relative: stages past the halfway point of the project's defined stage order, not hardcoded names) — i.e. real engagement, not just top-of-funnel volume |
| Execute Growth | Execution Rate | 25% | growth activities completed this period (Tasks completed + Opportunities resolved as Won) / activities due or opportunities active in period |

Each component is normalized to 0–100 before weighting (equal weight by default, since all
four pillars are equally core to the mandate — a project owner may later be allowed to
re-weight, but 25/25/25/25 is the default). Org-level Growth Score (if shown) averages
across the org's active projects, weighted by each project's total activity volume.

---

### 6. Out of scope for this build

- Billing/plans/usage metering (separate spec, to be provided later)
- Data migration from the current fixed firm/taxonomy model (clean build — no migration
  path required)
- Org-level custom branding/white-labeling
- Any hardcoded real-estate/capital-raising terminology anywhere in the UI or backend —
  all such labels must come from project configuration or generic defaults

---

### 7. Tech stack (unchanged from current platform)

- Next.js (App Router), TypeScript, Tailwind CSS
- PostgreSQL + Prisma ORM
- Anthropic API (Claude, server-side web_search + web_fetch) for the dynamic research/classification
  engine
- Hunter.io for email enrichment
- Gmail API / Microsoft Graph for outreach + calendar

---

### 8. Suggested build order

1. Organization/tenancy layer + auth scoping
2. Core Entity/EntityType/FieldDefinition/FieldValue engine (the biggest lift)
3. Dynamic PipelineDefinition + Opportunity stage-history tracking
4. Cross-project entity matching + scope-mismatch alert flow
5. Dashboard (Growth Score + generic tiles + dynamic pipeline widget)
6. AI research prompt generator + field-mapping layer
7. Contacts, Tasks, outreach/email — largely carry over from current platform, repointed
   at generic Entities instead of Firms
