-- Map every existing firm's stage onto the new, simplified taxonomy before
-- the obsolete enum values are dropped, so no firm's pipeline position is
-- lost in the transition.
UPDATE "crm_stages" SET "stage" = 'not_contacted' WHERE "stage" = 'researched_ready_for_outreach';
UPDATE "crm_stages" SET "stage" = 'email_sent' WHERE "stage" = 'outreach_sent';
UPDATE "crm_stages" SET "stage" = 'responded' WHERE "stage" = 'responded_interested';
UPDATE "crm_stages" SET "stage" = 'nurture' WHERE "stage" IN ('responded_not_interested', 'on_hold_nurture');
UPDATE "crm_stages" SET "stage" = 'term_sheet_sent' WHERE "stage" = 'term_sheet_loi';

-- Recreate the CrmStage enum without the now-obsolete values (Postgres has
-- no DROP VALUE, so this is the standard swap-and-rename pattern).
CREATE TYPE "CrmStage_new" AS ENUM (
  'not_contacted',
  'email_sent',
  'follow_up_due',
  'follow_up_sent',
  'no_response',
  'responded',
  'meeting_scheduled',
  'in_discussion_diligence',
  'term_sheet_sent',
  'closed_won',
  'closed_lost',
  'nurture',
  'do_not_contact'
);

ALTER TABLE "crm_stages" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "crm_stages" ALTER COLUMN "stage" TYPE "CrmStage_new" USING ("stage"::text::"CrmStage_new");
ALTER TABLE "crm_stages" ALTER COLUMN "stage" SET DEFAULT 'not_contacted';
DROP TYPE "CrmStage";
ALTER TYPE "CrmStage_new" RENAME TO "CrmStage";
