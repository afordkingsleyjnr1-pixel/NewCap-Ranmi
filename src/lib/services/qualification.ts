// Generic qualification-rule engine — replaces the old hardcoded
// MandateSettings singleton (fixed AUM min/max). A project can define any
// number of QualificationRule rows, each gating a numeric range on one of
// its own FieldDefinition keys (not just AUM). Qualification is computed on
// read from an entity's current field values rather than persisted as a
// single yes/no flag, since a project may have zero, one, or many rules
// touching different fields.
import { prisma } from "@/lib/db";
import type { QualificationRule } from "@/generated/prisma";

export function getQualificationRules(projectId: string) {
  return prisma.qualificationRule.findMany({ where: { projectId } });
}

export type QualificationStatus = "yes" | "no" | "unconfirmed";

export interface RuleResult {
  rule: QualificationRule;
  status: QualificationStatus;
}

function evaluateOne(value: number | null, rule: QualificationRule): QualificationStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return "unconfirmed";
  const min = rule.min !== null ? Number(rule.min) : -Infinity;
  const max = rule.max !== null ? Number(rule.max) : Infinity;
  return value >= min && value <= max ? "yes" : "no";
}

/** Evaluates every rule against an entity's field data. */
export function evaluateQualification(data: Record<string, unknown>, rules: QualificationRule[]): RuleResult[] {
  return rules.map((rule) => {
    const raw = data[rule.fieldKey];
    const value = typeof raw === "number" ? raw : raw !== undefined && raw !== null ? Number(raw) : null;
    return { rule, status: evaluateOne(value, rule) };
  });
}

/** True only if every rule passes (or there are no rules, i.e. nothing gates qualification). */
export function isWithinAllRules(results: RuleResult[]): boolean {
  return results.every((r) => r.status !== "no");
}
