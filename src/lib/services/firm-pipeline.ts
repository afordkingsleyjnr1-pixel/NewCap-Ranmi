import { prisma } from "@/lib/db";
import { resolveDomain } from "./domain-resolution";
import { researchAum } from "./aum-research";
import { classifyFirm } from "./classification-engine";
import { discoverContacts } from "./contact-discovery";
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
 * Populate surfaces (5.10): resolve domain → AUM research → Classification Engine
 * → Contact Discovery → Hunter email enrichment. Writes research_sources rows
 * throughout so every field stays traceable (Section 4.5).
 *
 * Each AI-dependent step degrades independently — a billing error, rate limit,
 * or transient API failure on one step (e.g. AUM research) never blocks the
 * others or crashes the whole pipeline; the firm is still created with
 * whatever succeeded, flagged needs_review/unresolved where it didn't, and
 * the first failure message is returned as `researchWarning` so it's visible
 * instead of looking like the firm was silently researched with blank data.
 */
export async function runFirmResearchPipeline(params: {
  name: string;
  sourceType: SourceType;
  populateRunId?: string | null;
  similarToFirmId?: string | null;
}): Promise<PipelineOutcome> {
  if (!isAnthropicConfigured()) {
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

  // 1. Domain resolution
  let domainResult: Awaited<ReturnType<typeof resolveDomain>> = {
    domain: null,
    status: "unresolved",
    hqLocation: null,
    reasoning: null,
  };
  try {
    domainResult = await resolveDomain(params.name);
  } catch (e) {
    researchWarning = `Domain resolution failed: ${errorMessage(e)}`;
  }

  // 2. AUM research (runs even without a resolved domain — search can still work off the name)
  let aum: Awaited<ReturnType<typeof researchAum>> = {
    aumValue: null,
    aumDisplay: "NA",
    aumAsOf: null,
    aumConfidence: "unconfirmed",
    sourceDescription: null,
  };
  try {
    aum = await researchAum({ firmName: params.name, domain: domainResult.domain });
  } catch (e) {
    researchWarning ??= `AUM research failed: ${errorMessage(e)}`;
  }

  // 3. Classification Engine
  let classification: Awaited<ReturnType<typeof classifyFirm>> = {
    strategies: {},
    focusAreas: {},
    status: "needs_review",
    droppedTags: [],
    raw: "",
  };
  try {
    classification = await classifyFirm({ firmName: params.name, domain: domainResult.domain, strategyDetail: null });
  } catch (e) {
    researchWarning ??= `Classification failed: ${errorMessage(e)}`;
  }

  const band = await getMandateSettings();
  const withinMandate = deriveWithinMandate(aum.aumValue, { aumMin: Number(band.aumMin), aumMax: Number(band.aumMax) });

  const firm = await prisma.firm.create({
    data: {
      name: params.name,
      domain: domainResult.domain,
      domainResolutionStatus: domainResult.status,
      hqLocation: domainResult.hqLocation,
      aumValue: aum.aumValue,
      aumDisplay: aum.aumDisplay,
      aumAsOf: aum.aumAsOf ? new Date(aum.aumAsOf) : null,
      aumConfidence: aum.aumConfidence,
      withinMandate,
      strategies: classification.strategies,
      focusAreas: classification.focusAreas,
      classificationStatus: classification.status,
      classificationSource: "engine",
      classifiedAt: new Date(),
      sourceType: params.sourceType,
      populateRunId: params.populateRunId ?? null,
      similarTo: params.similarToFirmId ? [params.similarToFirmId] : [],
      crmStage: { create: { stage: "not_contacted" } },
    },
  });

  await createPendingTask(firm.id, firm.name, "send_email");

  if (aum.sourceDescription) {
    await prisma.researchSource.create({
      data: { entityType: "firm", entityId: firm.id, fieldName: "aum_value", sourceUrlOrDescription: aum.sourceDescription },
    });
  }

  for (const [parent, children] of Object.entries(classification.strategies)) {
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
  for (const [parent, children] of Object.entries(classification.focusAreas)) {
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

  // 4. Contact Discovery
  let primaryContactFound = false;
  if (domainResult.status === "resolved") {
    try {
      const contacts = await discoverContacts({ firmName: params.name, domain: domainResult.domain });
      for (const c of contacts) {
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

        // 5. Hunter.io email enrichment
        if (isHunterConfigured() && domainResult.domain) {
          const [first, ...rest] = c.name.split(" ");
          const last = rest.join(" ") || first;
          try {
            const emailResult = await findEmail({ domain: domainResult.domain, firstName: first, lastName: last });
            if (emailResult.email) {
              await prisma.contact.update({
                where: { id: contact.id },
                data: { email: emailResult.email, emailStatus: emailResult.status, emailSource: emailResult.source },
              });
              await prisma.researchSource.create({
                data: { entityType: "contact", entityId: contact.id, fieldName: "email", sourceUrlOrDescription: emailResult.source },
              });
            }
          } catch {
            // Hunter failure shouldn't fail the whole pipeline — contact stays email_status=unknown.
          }
        }
      }
    } catch (e) {
      researchWarning ??= `Contact discovery failed: ${errorMessage(e)}`;
    }
  }

  return {
    firmId: firm.id,
    name: firm.name,
    domainResolutionStatus: domainResult.status,
    classificationStatus: classification.status,
    primaryContactFound,
    researchWarning,
  };
}
