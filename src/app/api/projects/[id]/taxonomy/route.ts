import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requirePermission, ForbiddenError } from "@/lib/authz";
import { runCompletion, extractJson, isAnthropicConfigured } from "@/lib/anthropic";
import { Prisma } from "@/generated/prisma";

// PATCH — confirm/save the (possibly user-edited) taxonomy the user has
// reviewed. Stored only on this project — the global Strategies/Focus Areas
// taxonomy in lib/taxonomy.ts is never touched by this.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  const body = await req.json();
  const taxonomy = body.taxonomy as Record<string, string[]>;
  if (!taxonomy || typeof taxonomy !== "object") return NextResponse.json({ error: "taxonomy is required" }, { status: 400 });

  const project = await prisma.project.update({
    where: { id },
    data: {
      taxonomy: taxonomy as object,
      taxonomyDescription: body.description ?? undefined,
      taxonomyConfirmedAt: new Date(),
    },
  });

  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const { id } = await params;
  await prisma.project.update({ where: { id }, data: { taxonomy: Prisma.JsonNull, taxonomyConfirmedAt: null } });
  return NextResponse.json({ ok: true });
}

function taxonomyPrompt(): string {
  return `You are a taxonomy designer for an institutional capital-introduction CRM. Given a natural-language description of a project's focus, propose a classification structure to organize the firms tracked within this one project.

Respond with strict JSON only, no prose:
{"taxonomy": {"Parent Group Name": ["Child Category 1", "Child Category 2"], "Another Parent Group": ["Child A", "Child B"]}}

Rules:
- 3 to 8 parent groups, each with 2 to 8 child categories.
- Parent groups should be the major dimensions relevant to the brief (e.g. by strategy, by geography, by stage — whatever the brief implies).
- Child categories must be specific and non-overlapping within their parent.
- Do not invent unrelated categories not implied by the brief.`;
}

// POST — generate a candidate taxonomy from a natural-language brief. Does
// NOT save anything; the caller reviews/edits the result and PATCHes to
// confirm, or POSTs again (optionally with refinement notes) to regenerate.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  try {
    await requirePermission(user, "manage_settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  await params;
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 400 });
  }

  const body = await req.json();
  const description = String(body.description ?? "").trim();
  if (!description) return NextResponse.json({ error: "A description is required" }, { status: 400 });

  const refinement = body.refinement ? `\n\nRefinement notes from the user for this regeneration: ${body.refinement}` : "";

  // The Claude call can throw (rate limit, auth error, network blip) — without
  // this catch, the exception propagates as an unhandled 500 with no
  // guaranteed JSON body, which surfaces to the client as a raw
  // "Unexpected end of JSON input" parse error instead of a real message.
  let raw: string;
  try {
    raw = await runCompletion({
      system: taxonomyPrompt(),
      user: `Project brief: ${description}${refinement}`,
      maxTokens: 1536,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Taxonomy generation failed: ${message}` }, { status: 502 });
  }

  const parsed = extractJson<{ taxonomy?: Record<string, string[]> }>(raw);
  if (!parsed?.taxonomy || typeof parsed.taxonomy !== "object") {
    return NextResponse.json({ error: "Could not generate a taxonomy from that description — try rephrasing it." }, { status: 502 });
  }

  return NextResponse.json({ taxonomy: parsed.taxonomy });
}
