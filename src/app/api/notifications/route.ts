import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { syncAllRepliesThrottled } from "@/lib/services/reply-sync";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ notifications: [] });

  // So reply-received notifications show up even if the user never opens
  // Messages — see reply-sync.ts for why this can't rely on push webhooks.
  await syncAllRepliesThrottled().catch(() => {});

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ notifications });
}

// Clear All — dismisses every currently unread notification (Section 5.14 step 4).
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
