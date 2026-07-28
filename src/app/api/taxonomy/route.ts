import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { getBothTaxonomies, saveTaxonomy } from "@/lib/services/taxonomy-store";
import type { TaxonomyKind } from "@/generated/prisma";

// Every taxonomy picker in the app (Entity Database filters, Add Entity,
// Populate, Project Add Entities) reads the live, editable taxonomy from here
// instead of importing the static defaults directly.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { strategies, focusAreas } = await getBothTaxonomies();
  return NextResponse.json({ strategies, focusAreas });
}

// Settings → Classification & Taxonomy — full replace of one kind's data
// after the admin has added/renamed/deleted/reordered categories.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const body = await req.json();
  const kind = body.kind as TaxonomyKind;
  const data = body.data as Record<string, string[]>;
  if (kind !== "strategy" && kind !== "focus_area") return NextResponse.json({ error: "kind must be strategy or focus_area" }, { status: 400 });
  if (!data || typeof data !== "object") return NextResponse.json({ error: "data is required" }, { status: 400 });

  for (const [parent, children] of Object.entries(data)) {
    if (!parent.trim()) return NextResponse.json({ error: "Category names cannot be empty" }, { status: 400 });
    if (!Array.isArray(children) || children.some((c) => typeof c !== "string" || !c.trim())) {
      return NextResponse.json({ error: `"${parent}" has an invalid subcategory` }, { status: 400 });
    }
  }

  const row = await saveTaxonomy(kind, data);
  return NextResponse.json({ ok: true, updatedAt: row.updatedAt });
}
