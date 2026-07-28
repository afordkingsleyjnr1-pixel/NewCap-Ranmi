import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { firmScopeWhere } from "@/lib/authz";
import { syncAllRepliesThrottled } from "@/lib/services/reply-sync";
import { Prisma } from "@/generated/prisma";

// Messages section — every email thread in one place, whether it came from
// the CRM outreach pipeline (tied to a firm/stage) or a free-form message
// sent straight from here. Unlinked (no firm) threads are visible to everyone
// since they aren't scoped to a firm's owner.
//
// ?folder= inbox (default) | sent | bin. A thread can appear in both Inbox
// and Sent — same as Gmail, where a conversation shows in Sent if you sent
// anything in it and in Inbox if it has an unarchived inbound message.
// Drafts aren't EmailThreads at all — see /api/messages/drafts.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Best-effort: pull in any new replies from the connected mailbox(es)
  // before returning threads, so opening/refreshing Messages is enough to
  // see a reply that landed in the inbox — no push-notification
  // infrastructure required. A sync failure shouldn't break the page.
  await syncAllRepliesThrottled().catch(() => {});

  const folder = req.nextUrl.searchParams.get("folder") ?? "inbox";
  const projectId = req.nextUrl.searchParams.get("projectId");
  const firmId = req.nextUrl.searchParams.get("firmId");
  const contactId = req.nextUrl.searchParams.get("contactId");
  const ownerId = req.nextUrl.searchParams.get("ownerId");
  const status = req.nextUrl.searchParams.get("status");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");
  const scope = await firmScopeWhere(user);

  const baseScope: Prisma.EmailThreadWhereInput = { OR: [{ firmId: null }, { firm: { deletedAt: null, ...scope } }] };
  const folderFilter: Prisma.EmailThreadWhereInput =
    folder === "bin"
      ? { deletedAt: { not: null } }
      : folder === "sent"
        ? { deletedAt: null, messages: { some: { direction: "outbound" } } }
        : folder === "all"
          ? { deletedAt: null }
          : { deletedAt: null, messages: { some: { direction: "inbound" } } };

  // A thread is "in project X" purely by its firm's project membership — no
  // manual tagging, matching every other project-scoped view in the app
  // (Firm Database's projectId filter, the Actions tab, etc). Owner filter
  // reuses the firm's CRM stage owner, the closest thing to an "assignee"
  // a message thread has.
  const firmConditions: Prisma.FirmWhereInput = {};
  if (projectId) firmConditions.projectFirms = { some: { projectId } };
  if (ownerId) firmConditions.crmStage = { ownerId };

  const extraFilter: Prisma.EmailThreadWhereInput = {
    ...(firmId ? { firmId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(status ? { status: status as Prisma.EnumThreadStatusFilter["equals"] } : {}),
    ...(Object.keys(firmConditions).length ? { firm: firmConditions } : {}),
    ...(dateFrom || dateTo
      ? { lastActivityAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
      : {}),
  };

  const threads = await prisma.emailThread.findMany({
    where: { AND: [baseScope, folderFilter, extraFilter] },
    include: {
      firm: { select: { id: true, name: true, projectFirms: { include: { project: { select: { id: true, name: true } } } }, crmStage: { include: { owner: { select: { id: true, name: true } } } } } },
      contact: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { sentAt: "asc" } },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  return NextResponse.json({ threads });
}
