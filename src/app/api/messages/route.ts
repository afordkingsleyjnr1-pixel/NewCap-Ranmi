import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { firmScopeWhere } from "@/lib/authz";
import { syncAllRepliesThrottled } from "@/lib/services/reply-sync";

// Messages section — every email thread in one place, whether it came from
// the CRM outreach pipeline (tied to a firm/stage) or a free-form message
// sent straight from here. Unlinked (no firm) threads are visible to everyone
// since they aren't scoped to a firm's owner.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Best-effort: pull in any new replies from the connected mailbox(es)
  // before returning threads, so opening/refreshing Messages is enough to
  // see a reply that landed in the inbox — no push-notification
  // infrastructure required. A sync failure shouldn't break the page.
  await syncAllRepliesThrottled().catch(() => {});

  const scope = await firmScopeWhere(user);

  const threads = await prisma.emailThread.findMany({
    where: { OR: [{ firmId: null }, { firm: { deletedAt: null, ...scope } }] },
    include: {
      firm: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { sentAt: "asc" } },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  return NextResponse.json({ threads });
}
