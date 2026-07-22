import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

// Section 2: "deprioritized for initial build ... single hardcoded/no-login
// session; add real auth once functionality is working." Real login (Section
// 5.13) is implemented in /login + /api/auth/*; this resolves the current
// user from a signed session cookie, falling back to the seeded account
// owner so the rest of the app has someone to attribute actions to before
// a real login happens.
const SESSION_COOKIE = "newcap_session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  isAccountOwner: boolean;
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, process.env.AUTH_SECRET ?? "dev-secret", { expiresIn: "30d" });
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.AUTH_SECRET ?? "dev-secret") as { sub: string };
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (user && user.status === "active") {
        return { id: user.id, name: user.name, email: user.email, roleId: user.roleId, isAccountOwner: user.isAccountOwner };
      }
    } catch {
      // fall through to bootstrap user
    }
  }

  const owner = await prisma.user.findFirst({ where: { isAccountOwner: true } });
  if (owner) {
    return { id: owner.id, name: owner.name, email: owner.email, roleId: owner.roleId, isAccountOwner: owner.isAccountOwner };
  }

  const bootstrapped = await bootstrapDefaultAccount();
  return bootstrapped;
}

/**
 * Section 2 — single hardcoded/no-login session for initial build. If no
 * account owner exists yet (fresh database, seed never run), create one
 * on the fly so the platform is usable immediately without a login step.
 * Real multi-user login (Section 5.13) still works via /login for anyone
 * who wants credentials later — this only fills the gap before that.
 */
async function bootstrapDefaultAccount(): Promise<SessionUser> {
  const adminRole = await prisma.role.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Admin",
      permissions: [
        "edit_firms",
        "manage_contacts",
        "send_outreach",
        "manage_meetings",
        "manage_tasks",
        "run_populate",
        "export_data",
        "manage_settings",
        "manage_team",
      ],
      dataScope: "all_firms",
      isSystemDefault: true,
    },
    update: {},
  });

  await prisma.role.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    create: { id: "00000000-0000-0000-0000-000000000002", name: "Viewer", permissions: [], dataScope: "all_firms", isSystemDefault: true },
    update: {},
  });

  let owner;
  try {
    owner = await prisma.user.create({
      data: {
        email: "kweli@adcapitalpartners.com",
        name: "Kweli",
        roleId: adminRole.id,
        isAccountOwner: true,
        status: "active",
        joinedAt: new Date(),
      },
    });
  } catch {
    // Another concurrent request already created it — read it back instead.
    owner = await prisma.user.findUniqueOrThrow({ where: { email: "kweli@adcapitalpartners.com" } });
  }

  return { id: owner.id, name: owner.name, email: owner.email, roleId: owner.roleId, isAccountOwner: owner.isAccountOwner };
}

export { SESSION_COOKIE };
