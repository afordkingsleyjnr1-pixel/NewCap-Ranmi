import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { classifyFirmHybrid, applyClassification } from "@/lib/services/classification-engine";

// Limit concurrency to avoid overwhelming the system
const MAX_CONCURRENT = 5;

async function processFirmsWithConcurrency(
  firms: Array<any>,
  maxConcurrent: number
): Promise<{ changed: number; processed: number; failed: number }> {
  let changed = 0;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < firms.length; i += maxConcurrent) {
    const batch = firms.slice(i, i + maxConcurrent);
    
    const results = await Promise.allSettled(
      batch.map(async (firm) => {
        try {
          const before = JSON.stringify({ s: firm.strategies, f: firm.focusAreas });
          const result = await classifyFirmHybrid({ 
            firmName: firm.name, 
            domain: firm.domain, 
            strategyDetail: firm.strategyDetail 
          });
          await applyClassification(firm.id, result, { isReclassify: true });
          const after = await prisma.firm.findUniqueOrThrow({ where: { id: firm.id } });
          if (JSON.stringify({ s: after.strategies, f: after.focusAreas }) !== before) {
            changed++;
          }
          processed++;
          return { success: true };
        } catch (e) {
          console.error(`Failed to classify firm ${firm.name}:`, e);
          failed++;
          return { success: false };
        }
      })
    );

    console.log(`[reclassify-all] Processed batch ${i / maxConcurrent + 1}/${Math.ceil(firms.length / maxConcurrent)}`);
  }

  return { changed, processed, failed };
}

export async function POST() {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  console.log("[reclassify-all] Starting batch reclassification with parallel processing");
  const firms = await prisma.firm.findMany({ where: { deletedAt: null } });
  console.log(`[reclassify-all] Found ${firms.length} firms to reclassify`);

  const { changed, processed, failed } = await processFirmsWithConcurrency(firms, MAX_CONCURRENT);

  console.log(`[reclassify-all] Complete. Changed: ${changed}, Processed: ${processed}, Failed: ${failed}`);

  return NextResponse.json({ totalFirms: firms.length, changed, processed, failed });
}
