// Section 4.3 — the 14-stage pipeline, in lifecycle order.
export const CRM_STAGES = [
  "not_contacted",
  "researched_ready_for_outreach",
  "outreach_sent",
  "follow_up_due",
  "no_response",
  "responded_interested",
  "responded_not_interested",
  "meeting_scheduled",
  "in_discussion_diligence",
  "term_sheet_loi",
  "closed_won",
  "closed_lost",
  "on_hold_nurture",
  "do_not_contact",
] as const;

export type CrmStageKey = (typeof CRM_STAGES)[number];

export const STAGE_LABELS: Record<CrmStageKey, string> = {
  not_contacted: "Not Contacted",
  researched_ready_for_outreach: "Researched — Ready for Outreach",
  outreach_sent: "Outreach Sent",
  follow_up_due: "Follow-Up Due",
  no_response: "No Response",
  responded_interested: "Responded — Interested",
  responded_not_interested: "Responded — Not Interested / Declined",
  meeting_scheduled: "Meeting/Call Scheduled",
  in_discussion_diligence: "In Discussion / Diligence",
  term_sheet_loi: "Term Sheet / LOI",
  closed_won: "Closed — Won",
  closed_lost: "Closed — Lost",
  on_hold_nurture: "On Hold / Nurture",
  do_not_contact: "Do Not Contact",
};

// Section 3 — status colors: green/amber/red/blue, used sparingly as pills.
export type StageColor = "green" | "amber" | "red" | "blue" | "gray";

export const STAGE_COLORS: Record<CrmStageKey, StageColor> = {
  not_contacted: "gray",
  researched_ready_for_outreach: "blue",
  outreach_sent: "blue",
  follow_up_due: "amber",
  no_response: "red",
  responded_interested: "green",
  responded_not_interested: "red",
  meeting_scheduled: "blue",
  in_discussion_diligence: "blue",
  term_sheet_loi: "amber",
  closed_won: "green",
  closed_lost: "red",
  on_hold_nurture: "amber",
  do_not_contact: "red",
};

// Section 5.6 — Action Column: the one next step the stage implies.
export type StageAction = "send_email" | "send_follow_up" | "schedule_meeting" | null;

export const STAGE_ACTIONS: Record<CrmStageKey, StageAction> = {
  not_contacted: "send_email",
  researched_ready_for_outreach: "send_email",
  outreach_sent: null,
  follow_up_due: "send_follow_up",
  no_response: null,
  responded_interested: "schedule_meeting",
  responded_not_interested: null,
  meeting_scheduled: null,
  in_discussion_diligence: null,
  term_sheet_loi: null,
  closed_won: null,
  closed_lost: null,
  on_hold_nurture: null,
  do_not_contact: null,
};

export const ACTION_LABELS: Record<NonNullable<StageAction>, string> = {
  send_email: "Send Email",
  send_follow_up: "Send Follow-Up",
  schedule_meeting: "Schedule Meeting",
};

// Section 5.9 — auto-generated closing checklist on Term Sheet / LOI entry.
export const CLOSING_CHECKLIST_TEMPLATE = [
  "NDA executed",
  "DDQ sent",
  "DDQ received",
  "Legal review complete",
  "Capital call scheduled",
  "Funds received",
];
