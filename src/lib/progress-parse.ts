// Maps the freeform progress strings emitted by runFirmResearchPipeline /
// runPopulate (see lib/services/firm-pipeline.ts, populate.ts) onto a fixed
// set of steps for the StepProgress tick UI. The backend only emits text
// checkpoints (one Claude call covers several of these at once), so this is
// necessarily a best-effort mapping, not per-step telemetry — good enough to
// make the wait feel like it's moving instead of a blank spinner.
export const ADD_FIRM_STEPS = ["Research", "Save Record", "Contacts & Emails", "Done"];

export function parseAddFirmProgress(message: string, prevFirm: string | null): { firm: string | null; stepIndex: number } {
  const colonIdx = message.indexOf(": ");
  const firm = colonIdx > -1 ? message.slice(0, colonIdx) : prevFirm;
  const m = message.toLowerCase();

  if (m.includes("researching domain")) return { firm, stepIndex: 0 };
  if (
    m.includes("domain resolved") ||
    m.includes("domain ambiguous") ||
    m.includes("domain unresolved") ||
    m.includes("research failed") ||
    m.includes("saving firm record")
  ) {
    return { firm, stepIndex: 1 };
  }
  if (m.includes("found") && m.includes("contact")) return { firm, stepIndex: 2 };
  if (m.includes("hunter.io is not configured") || m.includes("hunter.io lookup failed")) return { firm, stepIndex: 2 };
  if (m.includes("no anthropic api key")) return { firm, stepIndex: ADD_FIRM_STEPS.length };
  if (m.trim().endsWith("done.")) return { firm, stepIndex: ADD_FIRM_STEPS.length };
  if (m.includes("already in the database") || m.includes("failed —")) return { firm, stepIndex: ADD_FIRM_STEPS.length };
  if (m.includes("searching for candidate")) return { firm: null, stepIndex: 0 };
  if (m.startsWith("found") && m.includes("candidate")) return { firm: null, stepIndex: 0 };

  return { firm, stepIndex: 0 };
}
