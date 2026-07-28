// Maps the freeform progress strings emitted by runFirmResearchPipeline /
// runPopulate (see lib/services/entity-pipeline.ts, populate.ts) onto a fixed
// set of steps for the StepProgress tick UI. The backend only emits text
// checkpoints (one Claude call covers several of these at once), so this is
// necessarily a best-effort mapping, not per-step telemetry — good enough to
// make the wait feel like it's moving instead of a blank spinner.
export const ADD_FIRM_STEPS = ["Research", "Save Record", "Contacts & Emails", "Done"];

export function parseAddFirmProgress(message: string, prevFirm: string | null): { entity: string | null; stepIndex: number } {
  const colonIdx = message.indexOf(": ");
  const entity = colonIdx > -1 ? message.slice(0, colonIdx) : prevFirm;
  const m = message.toLowerCase();

  if (m.includes("researching domain")) return { entity, stepIndex: 0 };
  if (
    m.includes("domain resolved") ||
    m.includes("domain ambiguous") ||
    m.includes("domain unresolved") ||
    m.includes("research failed") ||
    m.includes("saving entity record")
  ) {
    return { entity, stepIndex: 1 };
  }
  if (m.includes("found") && m.includes("contact")) return { entity, stepIndex: 2 };
  if (m.includes("hunter.io is not configured") || m.includes("hunter.io lookup failed")) return { entity, stepIndex: 2 };
  if (m.includes("no anthropic api key")) return { entity, stepIndex: ADD_FIRM_STEPS.length };
  if (m.trim().endsWith("done.")) return { entity, stepIndex: ADD_FIRM_STEPS.length };
  if (m.includes("already in the database") || m.includes("failed —")) return { entity, stepIndex: ADD_FIRM_STEPS.length };
  if (m.includes("searching for candidate")) return { entity: null, stepIndex: 0 };
  if (m.startsWith("found") && m.includes("candidate")) return { entity: null, stepIndex: 0 };

  return { entity, stepIndex: 0 };
}
