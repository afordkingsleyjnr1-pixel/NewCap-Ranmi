import { prisma } from "@/lib/db";
import { researchFirmCore } from "./firm-core-research";
import { findEmail, isHunterConfigured } from "./hunter";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { getMandateSettings, deriveWithinMandate } from "./mandate";
import { createPendingTask } from "./pipeline-tasks";
import type { SourceType } from "@/generated/prisma";

export interface PipelineOutcome {
  firmId: string;
  name: string;
  domainResolutionStatus: "resolved" | "ambiguous" | "unresolved";
  classificationStatus: "classified" | "needs_review";
  primaryContactFound: boolean;
  /** Non-null if an AI/Hunter call failed partway through — the firm is still
   * created with whatever succeeded, but the caller can surface this so a
   * billing/rate-limit/API error doesn't look like a silent no-op. */
  researchWarning: string | null;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

/**
 * The single shared research pipeline behind Add Firm (5.1) and every candidate
 * Populate surfaces (5.10): one combined domain+AUM+classification+contacts
 * research call → Hunter email enrichment. Writes research_sources rows
 * throughout so every field stays traceable (Section 4.5).
 *
 * Domain/AUM/classification/contacts are one Claude call (see
 * firm-core-research.ts) rather than four, to share a single web_search
 * budget instead of each step paying for its own — search calls are billed
 * per-use independent of token cost, so this is the main cost lever.
 *
 * `onProgress` is optional — the streaming Add Firm endpoint passes it to
 * surface live status to the UI; callers that don't care (Populate,
 * reclassify) simply omit it.
 *
 * Each AI-dependent step still degrades independently — a billing error,
 * rate limit, or transient API failure never blocks the others or crashes
 * the whole pipeline; the firm is still created with whatever succeeded,
 * flagged needs_review/unresolved where it didn't, and the first failure
 * message is returned as `researchWarning` so it's visible instead of
 * looking like the firm was silently researched with blank data.
 */
export async function runFirmResearchPipeline(params: {
  name: string;
  sourceType: SourceType;
  populateRunId?: string | null;
  similarToFirmId?: string | null;
  onProgress?: (message: string) => void;
}): Promise<PipelineOutcome> {
  const emit = params.onProgress ?? (() => {});

  if (!isAnthropicConfigured()) {
    emit(`${params.name}: no Anthropic API key configured — adding without research.`);
    const firm = await prisma.firm.create({
      data: {
        name: params.name,
        sourceType: params.sourceType,
        domainResolutionStatus: "unresolved",
        classificationStatus: "needs_review",
        populateRunId: params.populateRunId ?? null,
        similarTo: params.similarToFirmId ? [params.similarToFirmId] : [],
        crmStage: { create: { stage: "not_contacted" } },
      },
    });
    await createPendingTask(firm.id, firm.name, "send_email");
    return {
      firmId: firm.id,
      name: firm.name,
      domainResolutionStatus: "unresolved",
      classificationStatus: "needs_review",
      primaryContactFound: false,
      researchWarning: "ANTHROPIC_API_KEY is not set — added without research.",
    };
  }

  let researchWarning: string | null = null;

  // 1-4. Domain resolution + AUM research + Classification + Contacts, combined into one call.
  emit(`${params.name}: researching domain, AUM, strategy classification, and contacts…`);
  let core: Awaited<ReturnType<typeof researchFirmCore>> = {
    domain: null,
    domainStatus: "unresolved",
    hqLocation: null,
    aumValue: null,
    aumDisplay: "NA",
    aumAsOf: null,
    aumConfidence: "unconfirmed",
    aumSourceDescription: null,
    strategies: {},
    focusAreas: {},
    classificationStatus: "needs_review",
    droppedTags: [],
    contacts: [],
  };
  try {
    core = await researchFirmCore({ firmName: params.name });
    emit(
      `${params.name}: domain ${core.domainStatus === "resolved" ? `resolved (${core.domain})` : core.domainStatus}, ` +
        `AUM ${core.aumDisplay}, ${Object.keys(core.strategies).length + Object.keys(core.focusAreas).length ? "classified" : "needs review"}.`
    );
    if (core.domainStatus !== "resolved") {
      researchWarning = `Domain could not be confidently resolved (${core.domainStatus}) — contacts and email lookup were skipped. Confirm the domain manually in the firm drawer, then run Find Contact.`;
    } else if (core.contacts.length === 0) {
      researchWarning = "No public contact information was found for this firm. Use Add Contact in the firm drawer to enter one manually.";
    }
  } catch (e) {
    researchWarning = `Research failed: ${errorMessage(e)}`;
    emit(`${params.name}: research failed — ${errorMessage(e)}`);
  }

  const band = await getMandateSettings();
  const withinMandate = deriveWithinMandate(core.aumValue, { aumMin: Number(band.aumMin), aumMax: Number(band.aumMax) });

  emit(`${params.name}: saving firm record…`);
  const firm = await prisma.firm.create({
    data: {
      name: params.name,
      domain: core.domain,
      domainResolutionStatus: core.domainStatus,
      hqLocation: core.hqLocation,
      aumValue: core.aumValue,
      aumDisplay: core.aumDisplay,
      aumAsOf: core.aumAsOf ? new Date(core.aumAsOf) : null,
      aumConfidence: core.aumConfidence,
      withinMandate,
      strategies: core.strategies,
      focusAreas: core.focusAreas,
      classificationStatus: core.classificationStatus,
      classificationSource: "engine",
      classifiedAt: new Date(),
      sourceType: params.sourceType,
      populateRunId: params.populateRunId ?? null,
      similarTo: params.similarToFirmId ? [params.similarToFirmId] : [],
      crmStage: { create: { stage: "not_contacted" } },
    },
  });

  await createPendingTask(firm.id, firm.name, "send_email");

  if (core.aumSourceDescription) {
    await prisma.researchSource.create({
      data: { entityType: "firm", entityId: firm.id, fieldName: "aum_value", sourceUrlOrDescription: core.aumSourceDescription },
    });
  }

  for (const [parent, children] of Object.entries(core.strategies)) {
    for (const child of children) {
      await prisma.researchSource.create({
        data: {
          entityType: "firm",
          entityId: firm.id,
          fieldName: `strategies.${parent}.${child}`,
          sourceUrlOrDescription: `Classification Engine — ${parent} / ${child}`,
        },
      });
    }
  }
  for (const [parent, children] of Object.entries(core.focusAreas)) {
    for (const child of children) {
      await prisma.researchSource.create({
        data: {
          entityType: "firm",
          entityId: firm.id,
          fieldName: `focus_areas.${parent}.${child}`,
          sourceUrlOrDescription: `Classification Engine — ${parent} / ${child}`,
        },
      });
    }
  }

  // 5. Save contacts found by the combined research call + Hunter email enrichment.
  let primaryContactFound = false;
  if (core.contacts.length > 0) {
    emit(`${params.name}: found ${core.contacts.length} contact(s), looking up email${core.contacts.length > 1 ? "s" : ""}…`);
  }
  try {
    for (const c of core.contacts) {
      const contact = await prisma.contact.create({
        data: {
          firmId: firm.id,
          name: c.name,
          title: c.title,
          linkedinUrl: c.linkedinUrl,
          rank: c.rank,
          isPrimaryBdContact: c.rank === 1,
        },
      });
      if (c.sourceDescription) {
        await prisma.researchSource.create({
          data: { entityType: "contact", entityId: contact.id, fieldName: "name_title", sourceUrlOrDescription: c.sourceDescription },
        });
      }
      primaryContactFound = primaryContactFound || c.rank === 1;

      // Hunter.io email enrichment — deterministic lookup, not an AI call.
      if (core.domain) {
        if (await isHunterConfigured()) {
          const [first, ...rest] = c.name.split(" ");
          const last = rest.join(" ") || first;
          try {
            const emailResult = await findEmail({ domain: core.domain, firstName: first, lastName: last });
            if (emailResult.email) {
              await prisma.contact.update({
                where: { id: contact.id },
                data: { email: emailResult.email, emailStatus: emailResult.status, emailSource: emailResult.source },
              });
              await prisma.researchSource.create({
                data: { entityType: "contact", entityId: contact.id, fieldName: "email", sourceUrlOrDescription: emailResult.source },
              });
            }
          } catch (e) {
            // A Hunter failure on one contact shouldn't fail the whole pipeline —
            // the contact stays email_status=unknown — but it must still be
            // visible instead of looking identical to "no email found".
            researchWarning ??= `Hunter.io lookup failed for ${c.name}: ${errorMessage(e)}`;
            emit(`${params.name}: Hunter.io lookup failed for ${c.name} — ${errorMessage(e)}`);
          }
        } else {
          emit(`${params.name}: Hunter.io is not configured — skipping email lookup for ${c.name}.`);
        }
      }
    }
  } catch (e) {
    researchWarning ??= `Saving contacts failed: ${errorMessage(e)}`;
  }

  emit(`${params.name}: done.`);

  return {
    firmId: firm.id,
    name: firm.name,
    domainResolutionStatus: core.domainStatus,
    classificationStatus: core.classificationStatus,
    primaryContactFound,
    researchWarning,
  };
}
