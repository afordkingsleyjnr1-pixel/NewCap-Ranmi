-- Add the new CRM stage values alongside the existing ones. Nothing uses
-- them yet in this migration — that happens in the next migration, once
-- these are committed (Postgres requires ADD VALUE to be committed before
-- the new value can be referenced).
ALTER TYPE "CrmStage" ADD VALUE IF NOT EXISTS 'email_sent';
ALTER TYPE "CrmStage" ADD VALUE IF NOT EXISTS 'follow_up_sent';
ALTER TYPE "CrmStage" ADD VALUE IF NOT EXISTS 'responded';
ALTER TYPE "CrmStage" ADD VALUE IF NOT EXISTS 'term_sheet_sent';
ALTER TYPE "CrmStage" ADD VALUE IF NOT EXISTS 'nurture';

-- New notification type for the follow-up-due workflow event.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'follow_up_due';
