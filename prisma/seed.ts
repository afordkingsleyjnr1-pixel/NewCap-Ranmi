import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Admin",
      permissions: [...PERMISSIONS],
      dataScope: "all_firms",
      isSystemDefault: true,
    },
    update: {},
  });

  await prisma.role.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Viewer",
      permissions: [],
      dataScope: "all_firms",
      isSystemDefault: true,
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash("changeme123", 12);
  await prisma.user.upsert({
    where: { email: "kweli@adcapitalpartners.com" },
    create: {
      email: "kweli@adcapitalpartners.com",
      name: "Kweli",
      passwordHash,
      roleId: adminRole.id,
      isAccountOwner: true,
      status: "active",
      joinedAt: new Date(),
    },
    update: {},
  });

  await prisma.mandateSettings.upsert({
    where: { id: 1 },
    create: { id: 1, aumMin: 1_000_000_000, aumMax: 15_000_000_000 },
    update: {},
  });

  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, followUpThresholdDays: 7 },
    update: {},
  });

  console.log("Seed complete. Login: kweli@adcapitalpartners.com / changeme123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
