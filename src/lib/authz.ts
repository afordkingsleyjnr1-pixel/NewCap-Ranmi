import { prisma } from "@/lib/db";
import type { Permission } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";

export async function getUserRole(user: SessionUser) {
  return prisma.role.findUniqueOrThrow({ where: { id: user.roleId } });
}

export async function hasPermission(user: SessionUser, permission: Permission): Promise<boolean> {
  const role = await getUserRole(user);
  const perms = (role.permissions as string[]) ?? [];
  return perms.includes(permission);
}

/** Section 5.13 step 8 — data_scope filter applied to firm/contact/task queries. */
export async function firmScopeWhere(user: SessionUser) {
  const role = await getUserRole(user);
  if (role.dataScope === "all_firms") return {};
  return { crmStage: { ownerId: user.id } };
}

/** Same data_scope rule applied to projects: all_firms roles see every project; everyone else sees only projects they own or are a member of. */
export async function projectScopeWhere(user: SessionUser) {
  const role = await getUserRole(user);
  if (role.dataScope === "all_firms") return {};
  return { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requirePermission(user: SessionUser | null, permission: Permission): Promise<SessionUser> {
  if (!user) throw new ForbiddenError("Not authenticated");
  const ok = await hasPermission(user, permission);
  if (!ok) throw new ForbiddenError(`Missing permission: ${permission}`);
  return user;
}
