import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient | any };

let prisma: any;

if (!process.env.DATABASE_URL) {
  const missingError = new Error(
    "Missing DATABASE_URL environment variable. Set DATABASE_URL in your environment (see .env.example)."
  );

  // Create a proxy that throws on any property access (so attempts to query fail with a clear message)
  prisma = new Proxy(
    {},
    {
      get() {
        throw missingError;
      },
      apply() {
        throw missingError;
      },
    }
  );
} else {
  prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
}

export { prisma };
