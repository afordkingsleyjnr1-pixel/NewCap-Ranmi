import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { runCompletion, extractJson, isAnthropicConfigured } from "@/lib/anthropic";
import { getTaxonomy } from "@/lib/services/taxonomy-store";
import type { TaxonomyKind } from "@/generated/prisma";

// Settings → Classification & Taxonomy — "Generate" button for a parent
// group (new or existing): proposes child categories from the group name
// alone plus the rest of the taxonomy for context, so e.g. adding a "Funds"
// parent group doesn't need to be hand-typed. Suggestion only — the admin
// reviews/edits before saving via PATCH /api/taxonomy.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  if (!isAnthropicConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 400 });

  const body = await req.json();
  const kind = body.kind as TaxonomyKind;
  const parentName = String(body.parentName ?? "").trim();
  if (kind !== "strategy" && kind !== "focus_area") return NextResponse.json({ error: "kind must be strategy or focus_area" }, { status: 400 });
  if (!parentName) return NextResponse.json({ error: "parentName is required" }, { status: 400 });

  const existing = await getTaxonomy(kind);
  const kindLabel = kind === "strategy" ? "Strategies" : "Focus Areas";

  const raw = await runCompletion({
    system: `You are a taxonomy designer for an institutional capital-introduction CRM's ${kindLabel} taxonomy. Given a parent group name and the rest of the existing taxonomy for context, propose 4 to 12 specific, non-overlapping child categories for that parent group.

Respond with strict JSON only: {"children": ["Child 1", "Child 2", ...]}`,
    user: `Existing ${kindLabel} taxonomy (for context, do not repeat categories that belong elsewhere):\n${JSON.stringify(existing, null, 2)}\n\nPropose child categories for the parent group: "${parentName}"`,
    maxTokens: 1024,
  });
  const parsed = extractJson<{ children?: string[] }>(raw);
  const children = Array.isArray(parsed?.children) ? parsed.children.filter((c) => typeof c === "string" && c.trim()) : [];
  if (children.length === 0) return NextResponse.json({ error: "Could not generate child categories — try a more specific parent group name." }, { status: 502 });

  return NextResponse.json({ children });
}
