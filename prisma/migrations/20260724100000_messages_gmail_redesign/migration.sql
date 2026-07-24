-- Messages module Gmail-style redesign: folders (Inbox/Sent/Drafts/Bin), CC/BCC.

-- Bin (soft-delete a thread) / Restore.
ALTER TABLE "email_threads" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CC/BCC recorded per message (each message can have its own, same as real email headers).
ALTER TABLE "email_messages" ADD COLUMN "cc_emails" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "email_messages" ADD COLUMN "bcc_emails" TEXT[] NOT NULL DEFAULT '{}';

-- Drafts folder.
CREATE TABLE "message_drafts" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "firm_id" TEXT,
    "contact_id" TEXT,
    "reply_to_thread_id" TEXT,
    "to_name" TEXT,
    "to_email" TEXT,
    "cc_emails" TEXT[] NOT NULL DEFAULT '{}',
    "bcc_emails" TEXT[] NOT NULL DEFAULT '{}',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_drafts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
