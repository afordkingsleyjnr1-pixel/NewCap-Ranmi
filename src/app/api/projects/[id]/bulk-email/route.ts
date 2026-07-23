import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { sendOutreachToFirm, OutreachError } from "@/lib/services/outreach";

// Section: Projects Module step 5 — bulk email to multiple firms/contacts,
// using the exact same send-and-track pipeline as a single send (step 6:
// this is never a separate workflow — each recipient's firm still moves
// through the CRM stage machine exactly as if sent one at a time).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  await params; // projectId isn't needed for the send itself — targets are resolved client-side against the project's own firm/contact list.

  const body = await req.json();
  const { targets, subject, message, kind } = body as {
    targets: Array<{ firmId: string; contactId?: string; adHocName?: string; adHocEmail?: string }>;
    subject: string;
    message: string;
    kind?: "email" | "follow_up" | "term_sheet";
  };

  if (!Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json({ error: "Select at least one firm or contact" }, { status: 400 });
  }
  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }

  const results: Array<{ firmId: string; contactId?: string; ok: boolean; error?: string; threadId?: string }> = [];

  for (const target of targets) {
    try {
      const outcome = await sendOutreachToFirm({
        userId: user!.id,
        firmId: target.firmId,
        contactId: target.contactId,
        adHocName: target.adHocName,
        adHocEmail: target.adHocEmail,
        subject,
        message,
        kind: kind ?? "email",
      });
      results.push({ firmId: target.firmId, contactId: target.contactId, ok: true, threadId: outcome.threadId });
    } catch (e) {
      const msg = e instanceof OutreachError ? e.message : e instanceof Error ? e.message : "Send failed";
      results.push({ firmId: target.firmId, contactId: target.contactId, ok: false, error: msg });
    }
  }

  return NextResponse.json({ results, sentCount: results.filter((r) => r.ok).length, failedCount: results.filter((r) => !r.ok).length });
}
