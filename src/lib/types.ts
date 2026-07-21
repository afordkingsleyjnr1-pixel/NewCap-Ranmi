import type { CrmStageKey } from "@/lib/crm-stages";

export interface FirmListItem {
  id: string;
  name: string;
  domain: string | null;
  hqLocation: string | null;
  aumDisplay: string | null;
  aumConfidence: string | null;
  withinMandate: "yes" | "no" | "unconfirmed";
  strategies: Record<string, string[]>;
  focusAreas: Record<string, string[]>;
  sourceType: "seed" | "manual_add" | "comparable";
  classificationStatus: "unclassified" | "classified" | "needs_review";
  domainResolutionStatus: "resolved" | "ambiguous" | "unresolved" | null;
  crmStage: {
    stage: CrmStageKey;
    nextFollowUpDate: string | null;
    owner: { id: string; name: string } | null;
  } | null;
  contacts: Array<{ id: string; name: string; email: string | null; emailStatus: string }>;
  deletedAt: string | null;
}
