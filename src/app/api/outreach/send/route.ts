import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { sendOutreachToFirm, OutreachError } from "@/lib/services/outreach";

// Section 5.7 — Send Email / Send Follow-Up / Send Term Sheet: thin route
// wrapper around the shared sendOutreachToFirm pipeline (also used by the
// Projects module's bulk-send endpoint).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "send_outreach");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { firmId, contactId, adHocName, adHocEmail, subject, message, isFollowUp } = body as {
    firmId: string;
    contactId?: string;
    adHocName?: string;
    adHocEmail?: string;
    subject: string;
    message: string;
    isFollowUp?: boolean;
  };
  const kind: "email" | "follow_up" | "term_sheet" = body.kind ?? (isFollowUp ? "follow_up" : "email");

  try {
    const result = await sendOutreachToFirm({ userId: user!.id, firmId, contactId, adHocName, adHocEmail, subject, message, kind });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OutreachError) {
      const status = e.code === "NEEDS_REAUTH" ? 409 : e.code === "DO_NOT_CONTACT" ? 403 : e.code === "NO_RECIPIENT" ? 400 : 500;
      return NextResponse.json(e.code === "NEEDS_REAUTH" ? { error: "NEEDS_REAUTH", message: e.message } : { error: e.message }, { status });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}
