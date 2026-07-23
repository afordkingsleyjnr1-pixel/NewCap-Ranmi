-- Contacts: allow a second/alternate email address per contact.
ALTER TABLE "contacts" ADD COLUMN "alternate_emails" TEXT[] NOT NULL DEFAULT '{}';

-- Email threads: unread flag for Gmail-style bold/unread treatment in the
-- Messages thread list, set on inbound reply and cleared when opened.
ALTER TABLE "email_threads" ADD COLUMN "has_unread_reply" BOOLEAN NOT NULL DEFAULT false;

-- Email messages: attachment metadata (filename/mimeType/size), not the
-- binary content -- shown as a chip in the thread view.
ALTER TABLE "email_messages" ADD COLUMN "attachments" JSONB;
