// The CRM pipeline stage machine. Every firm sits in exactly one of these
// stages; the Next Step engine below derives the one required action from
// (stage, open pending-action tasks, whether a scheduled meeting has passed).
export const CRM_STAGES = [
  "not_contacted",
  "email_sent",
  "follow_up_due",
  "follow_up_sent",
  "no_response",
  "responded",
  "meeting_scheduled",
  "in_discussion_diligence",
  "term_sheet_sent",
  "closed_won",
  "closed_lost",
  "nurture",
  "do_not_contact",
] as const;

export type CrmStageKey = (typeof CRM_STAGES)[number];

export const STAGE_LABELS: Record<CrmStageKey, string> = {
  not_contacted: "Not Contacted",
  email_sent: "Email Sent",
  follow_up_due: "Follow-Up Due",
  follow_up_sent: "Follow-Up Sent",
  no_response: "No Response",
  responded: "Responded",
  meeting_scheduled: "Meeting Scheduled",
  in_discussion_diligence: "In Discussion / Due Diligence",
  term_sheet_sent: "Term Sheet / LOI Sent",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  nurture: "Nurture",
  do_not_contact: "Do Not Contact",
};

export type StageColor = "green" | "amber" | "red" | "blue" | "gray";

export const STAGE_COLORS: Record<CrmStageKey, StageColor> = {
  not_contacted: "gray",
  email_sent: "blue",
  follow_up_due: "amber",
  follow_up_sent: "blue",
  no_response: "red",
  responded: "green",
  meeting_scheduled: "blue",
  in_discussion_diligence: "blue",
  term_sheet_sent: "amber",
  closed_won: "green",
  closed_lost: "red",
  nurture: "amber",
  do_not_contact: "red",
};

// The distinct next-step actions the UI can prompt for.
export type StageAction =
  | "send_email"
  | "send_follow_up"
  | "review_reply"
  | "schedule_meeting"
  | "meeting_outcome"
  | "send_term_sheet"
  | "close_deal"
  | null;

export const ACTION_LABELS: Record<NonNullable<StageAction>, string> = {
  send_email: "Send Email",
  send_follow_up: "Send Follow-Up",
  review_reply: "Review Reply",
  schedule_meeting: "Set Meeting",
  meeting_outcome: "Update Meeting Outcome",
  send_term_sheet: "Send Term Sheet / LOI",
  close_deal: "Mark Closed",
};

// System-generated pending-action tasks (Task Management requirement) —
// titles are the shared key between "there's a pending task" and "this is
// the Next Step to show," so completing the real action and completing the
// task are the same operation.
export const TASK_TITLES = {
  send_email: (firmName: string) => `Send Email — ${firmName}`,
  send_follow_up: (firmName: string) => `Send Follow-Up — ${firmName}`,
  schedule_meeting: (firmName: string) => `Schedule Meeting — ${firmName}`,
  send_term_sheet: (firmName: string) => `Send Term Sheet / LOI — ${firmName}`,
} as const;

export interface OpenTaskRef {
  title: string;
}

export interface NextStepInfo {
  label: string;
  action: StageAction;
}

/**
 * The Next Step engine. Every stage implies exactly one next action, except
 * "Responded" — which shows "Review Reply" until the user marks the firm
 * Interested (at which point a "Schedule Meeting" task exists and the next
 * step becomes "Set Meeting"), and "Meeting Scheduled," which shows nothing
 * until the meeting's end time has passed, then asks for the outcome.
 */
export function computeNextStep(
  stage: CrmStageKey,
  openTasks: OpenTaskRef[],
  meetingOverdue: boolean
): NextStepInfo {
  switch (stage) {
    case "not_contacted":
      return { label: "Send Email", action: "send_email" };
    case "email_sent":
      return { label: "Awaiting Response", action: null };
    case "follow_up_due":
      return { label: "Send Follow-Up", action: "send_follow_up" };
    case "follow_up_sent":
      return { label: "Awaiting Response", action: null };
    case "no_response":
      return { label: "No Response", action: null };
    case "responded": {
      const readyToSchedule = openTasks.some((t) => t.title.startsWith("Schedule Meeting"));
      return readyToSchedule ? { label: "Set Meeting", action: "schedule_meeting" } : { label: "Review Reply", action: "review_reply" };
    }
    case "meeting_scheduled":
      return meetingOverdue ? { label: "Update Meeting Outcome", action: "meeting_outcome" } : { label: "Attend Meeting", action: null };
    case "in_discussion_diligence":
      return { label: "Send Term Sheet / LOI", action: "send_term_sheet" };
    case "term_sheet_sent":
      return { label: "Mark Closed Won / Lost", action: "close_deal" };
    case "closed_won":
    case "closed_lost":
      return { label: "Deal Closed", action: null };
    case "nurture":
      return { label: "Recontact Later", action: null };
    case "do_not_contact":
      return { label: "—", action: null };
    default:
      return { label: "—", action: null };
  }
}

/** Convenience wrapper: derives meetingOverdue from a firm's most recent scheduled meeting. */
export function nextStepForFirm(
  stage: CrmStageKey,
  openTasks: OpenTaskRef[],
  meetings: Array<{ endTime: string; status: string }>
): NextStepInfo {
  const scheduled = meetings.find((m) => m.status === "scheduled");
  const meetingOverdue = !!scheduled && new Date(scheduled.endTime) < new Date();
  return computeNextStep(stage, openTasks, meetingOverdue);
}

// Section 5.9 — auto-generated closing checklist on Term Sheet / LOI entry.
export const CLOSING_CHECKLIST_TEMPLATE = [
  "NDA executed",
  "DDQ sent",
  "DDQ received",
  "Legal review complete",
  "Capital call scheduled",
  "Funds received",
];
