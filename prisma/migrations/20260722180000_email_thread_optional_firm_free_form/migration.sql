-- Messages section: free-form outreach not tied to any firm/CRM stage.
ALTER TABLE "email_threads" ALTER COLUMN "firm_id" DROP NOT NULL;
ALTER TABLE "email_threads" ADD COLUMN "is_free_form" BOOLEAN NOT NULL DEFAULT false;
