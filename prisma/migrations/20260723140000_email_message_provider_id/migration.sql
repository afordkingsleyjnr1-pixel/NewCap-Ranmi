-- Lets the polling reply-sync dedupe messages it's already pulled in against
-- ones it hasn't seen yet, without relying on push-notification infrastructure.
ALTER TABLE "email_messages" ADD COLUMN "provider_message_id" TEXT;
CREATE INDEX "email_messages_thread_id_provider_message_id_idx" ON "email_messages"("thread_id", "provider_message_id");
