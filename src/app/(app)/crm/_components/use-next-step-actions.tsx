"use client";

import { useState } from "react";
import { ComposeEmailModal, type ComposeKind } from "./compose-email-modal";
import { ScheduleMeetingModal } from "./schedule-meeting-modal";
import { ReviewReplyModal } from "./review-reply-modal";
import { MeetingOutcomeModal } from "./meeting-outcome-modal";
import { CloseDealModal } from "./close-deal-modal";
import type { StageAction } from "@/lib/crm-stages";

/**
 * Centralizes the five Next Step action modals (Send Email/Follow-Up/Term
 * Sheet, Schedule Meeting, Review Reply, Meeting Outcome, Close Deal) so
 * every page that shows a Next Step button (Firms Database, CRM Pipeline,
 * Contacts) drives them through one handleAction call instead of each
 * re-implementing its own modal wiring.
 */
export function useNextStepActions(onChanged: () => void) {
  const [compose, setCompose] = useState<{ firmId: string; firmName: string; kind: ComposeKind } | null>(null);
  const [scheduleMeeting, setScheduleMeeting] = useState<{ firmId: string; firmName: string } | null>(null);
  const [reviewReply, setReviewReply] = useState<{ firmId: string; firmName: string } | null>(null);
  const [meetingOutcome, setMeetingOutcome] = useState<{ meetingId: string; firmName: string } | null>(null);
  const [closeDeal, setCloseDeal] = useState<{ firmId: string; firmName: string } | null>(null);

  function handleAction(firmId: string, action: NonNullable<StageAction>, meetingId?: string, firmName = "") {
    switch (action) {
      case "send_email":
        setCompose({ firmId, firmName, kind: "email" });
        break;
      case "send_follow_up":
        setCompose({ firmId, firmName, kind: "follow_up" });
        break;
      case "send_term_sheet":
        setCompose({ firmId, firmName, kind: "term_sheet" });
        break;
      case "schedule_meeting":
        setScheduleMeeting({ firmId, firmName });
        break;
      case "review_reply":
        setReviewReply({ firmId, firmName });
        break;
      case "meeting_outcome":
        if (meetingId) setMeetingOutcome({ meetingId, firmName });
        break;
      case "close_deal":
        setCloseDeal({ firmId, firmName });
        break;
    }
  }

  const modals = (
    <>
      <ComposeEmailModal
        open={!!compose}
        onOpenChange={(o) => !o && setCompose(null)}
        firmId={compose?.firmId ?? null}
        firmName={compose?.firmName}
        kind={compose?.kind}
        onSent={onChanged}
      />
      <ScheduleMeetingModal
        open={!!scheduleMeeting}
        onOpenChange={(o) => !o && setScheduleMeeting(null)}
        firmId={scheduleMeeting?.firmId ?? null}
        firmName={scheduleMeeting?.firmName}
        onScheduled={onChanged}
      />
      <ReviewReplyModal
        open={!!reviewReply}
        onOpenChange={(o) => !o && setReviewReply(null)}
        firmId={reviewReply?.firmId ?? null}
        firmName={reviewReply?.firmName}
        onDone={onChanged}
      />
      <MeetingOutcomeModal
        open={!!meetingOutcome}
        onOpenChange={(o) => !o && setMeetingOutcome(null)}
        meetingId={meetingOutcome?.meetingId ?? null}
        firmName={meetingOutcome?.firmName}
        onDone={onChanged}
      />
      <CloseDealModal
        open={!!closeDeal}
        onOpenChange={(o) => !o && setCloseDeal(null)}
        firmId={closeDeal?.firmId ?? null}
        firmName={closeDeal?.firmName}
        onDone={onChanged}
      />
    </>
  );

  return { handleAction, modals };
}
