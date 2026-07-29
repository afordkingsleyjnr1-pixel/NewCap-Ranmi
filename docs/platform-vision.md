# Ranmi — Platform Description

## What it is

Ranmi is a BD + CRM + Outreach + Project Management platform, sold to organizations whose
daily work involves finding the right people or companies, reaching them, and managing
that relationship all the way through to a result — capital introduction, recruiting,
partnerships, sales, or anything else built on the same underlying motion: **find, reach,
relate, close.**

What makes Ranmi different from a generic CRM is that the entire platform — research,
classification, outreach, pipeline, tasks, reporting — already exists, fully built and
proven, running today as a real capital-introduction BD tool. That existing platform
doesn't get thrown away or rebuilt per customer. It becomes the **engine every Project runs
on.**

## The core idea: one engine, many projects

A customer doesn't get a blank CRM they have to configure from scratch. They get the whole
Ranmi engine — AI-powered research (Claude with live web search), an outreach pipeline with
automatic follow-up tracking, a Next Step engine that tells the team what to do next,
task/checklist management, Gmail/Outlook-integrated messaging, meeting scheduling, reporting
— sitting ready, waiting on one thing: **what is this project actually looking for, and
how should it be classified?**

That's the one question the platform doesn't answer for them, by design. Everything else —
how outreach works, how a reply gets tracked, how a deal moves through stages, how a report
gets built — is already solved. The only thing left open is the lens: *who or what are we
trying to find, and how do we tell them apart from each other?*

## Onboarding: exactly three things get generated, nothing else changes

When a user starts a new Project, before they add a single contact or send a single email,
onboarding asks them to describe it in their own words — what they're trying to accomplish,
who or what they're looking for. From that description, the platform's AI generates exactly
three things, each of which is fixed/global on the real-estate platform today and becomes
generated-per-Project instead:

1. **Classification** — the qualification criteria that decide whether something is a fit
   (today, a single hardcoded global AUM band — "Within Mandate" — this becomes whatever
   criteria actually matter for this Project, generated from the description rather than
   assumed to be AUM).
2. **Taxonomy** — the classification tree used to organize and tag what's found (the same
   describe → generate → review → confirm flow already live in the product today for
   per-project taxonomy, extended to be the primary configuration step rather than an
   optional override).
3. **CRM Stages** — the pipeline this Project's outreach/relationship-building process moves
   through (today, one fixed global 13-stage list — this becomes a generated stage sequence
   fitted to what the user described).

**Nothing else changes.** The record structure itself (a tracked entity's name, contacts,
activity log, messages, tasks), the research/enrichment engine, the reporting engine, and
every other module described in the current-state documentation stay exactly as built —
this is not a generic field-builder or a rebuild of the entity schema. It's specifically
these three configuration surfaces moving from "one fixed global answer" to "generated per
Project from what the user typed at onboarding." A new Project also starts with a clean,
empty data set — no shared/seeded firms carried over from anywhere else.

Once confirmed, the engine takes over. Research, outreach, task automation, the Next Step
engine, reporting — all of it runs exactly as built, now operating through the classification,
taxonomy, and stages the user just defined. A Project sourcing institutional investment
managers keeps an AUM-based classification and a capital-raising pipeline. A Project sourcing
conference speakers gets entirely different classification criteria and an entirely different
pipeline. Same engine underneath both.

## Why this works

The expensive, hard-to-get-right part of a platform like this was never the CRM mechanics —
send an email, track a reply, remind someone to follow up, schedule a meeting, log an
activity. That's been built, used, and refined already. The part that actually varies from
customer to customer is *what they're looking for and how they think about it* — and that's
the one thing onboarding hands back to them, in plain language, instead of asking them to
configure database fields.

## The mandate

Every project running on Ranmi, regardless of what it's classifying or who it's looking for,
is doing the same four things: **find the right opportunities, identify the right people,
build relationships, and execute growth activities** — one intelligent workspace, whatever
the domain.
