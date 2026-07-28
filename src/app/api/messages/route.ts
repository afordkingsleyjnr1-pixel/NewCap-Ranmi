import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { firmScopeWhere } from "@/lib/authz";
import { syncAllRepliesThrottled } from "@/lib/services/reply-sync";
import { Prisma } from "@/generated/prisma";

// Messages section — every email thread in one place, whether it came from
// the CRM outreach pipeline (tied to a entity/stage) or a free-form message
// sent straight from here. Unlinked (no entity) threads are visible to everyone
// since they aren't scoped to a entity's owner.
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
  const entityId = req.nextUrl.searchParams.get("entityId");
  const contactId = req.nextUrl.searchParams.get("contactId");
  const ownerId = req.nextUrl.searchParams.get("ownerId");
  const status = req.nextUrl.searchParams.get("status");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");
  const scope = await firmScopeWhere(user);

  const baseScope: Prisma.EmailThreadWhereInput = { OR: [{ entityId: null }, { entity: { deletedAt: null, ...scope } }] };
  const folderFilter: Prisma.EmailThreadWhereInput =
    folder === "bin"
      ? { deletedAt: { not: null } }
      : folder === "sent"
        ? { deletedAt: null, messages: { some: { direction: "outbound" } } }
        : folder === "all"
          ? { deletedAt: null }
          : { deletedAt: null, messages: { some: { direction: "inbound" } } };

  // A thread is "in project X" purely by its entity's project membership — no
  // manual tagging, matching every other project-scoped view in the app
  // (Entity Database's projectId filter, the Actions tab, etc). Owner filter
  // reuses the entity's CRM stage owner, the closest thing to an "assignee"
  // a message thread has.
  const firmConditions: Prisma.FirmWhereInput = {};
  if (projectId) firmConditions.projectFirms = { some: { projectId } };
  if (ownerId) firmConditions.stage = { ownerId };

  const extraFilter: Prisma.EmailThreadWhereInput = {
    ...(entityId ? { entityId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(status ? { status: status as Prisma.EnumThreadStatusFilter["equals"] } : {}),
    ...(Object.keys(firmConditions).length ? { entity: firmConditions } : {}),
    ...(dateFrom || dateTo
      ? { lastActivityAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
      : {}),
  };

  const threads = await prisma.emailThread.findMany({
    where: { AND: [baseScope, folderFilter, extraFilter] },
    include: {
      entity: { select: { id: true, name: true, projectFirms: { include: { project: { select: { id: true, name: true } } } }, stage: { include: { owner: { select: { id: true, name: true } } } } } },
      contact: { select: { id: true, name: true, email: true } },
      messages: { orderBy: { sentAt: "asc" } },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  return NextResponse.json({ threads });
}
