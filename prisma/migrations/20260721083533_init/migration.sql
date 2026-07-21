-- CreateEnum
CREATE TYPE "DomainResolutionStatus" AS ENUM ('resolved', 'ambiguous', 'unresolved');

-- CreateEnum
CREATE TYPE "AumConfidence" AS ENUM ('confirmed', 'dated', 'unconfirmed');

-- CreateEnum
CREATE TYPE "WithinMandate" AS ENUM ('yes', 'no', 'unconfirmed');

-- CreateEnum
CREATE TYPE "ClassificationStatus" AS ENUM ('unclassified', 'classified', 'needs_review');

-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM ('engine', 'manual_override', 'engine_then_edited');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('seed', 'manual_add', 'comparable');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('verified', 'inferred', 'unknown');

-- CreateEnum
CREATE TYPE "CrmStage" AS ENUM ('not_contacted', 'researched_ready_for_outreach', 'outreach_sent', 'follow_up_due', 'no_response', 'responded_interested', 'responded_not_interested', 'meeting_scheduled', 'in_discussion_diligence', 'term_sheet_loi', 'closed_won', 'closed_lost', 'on_hold_nurture', 'do_not_contact');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('email_sent', 'email_received', 'call', 'meeting', 'note', 'stage_change');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'pending_invite', 'deactivated');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('gmail', 'outlook');

-- CreateEnum
CREATE TYPE "EmailConnectionStatus" AS ENUM ('connected', 'needs_reauth', 'disconnected');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('awaiting_reply', 'replied', 'no_response');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'done');

-- CreateEnum
CREATE TYPE "PopulateMode" AS ENUM ('similar_to_firm', 'by_criteria', 'database_wide');

-- CreateEnum
CREATE TYPE "DataScope" AS ENUM ('all_firms', 'owned_firms_only');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('reply_received', 'role_changed', 'firms_reassigned', 'email_needs_reauth', 'meeting_reminder');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "data_scope" "DataScope" NOT NULL DEFAULT 'all_firms',
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "role_id" TEXT NOT NULL,
    "is_account_owner" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'pending_invite',
    "invited_by" TEXT,
    "invited_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "domain_resolution_status" "DomainResolutionStatus",
    "hq_location" TEXT,
    "target_markets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aum_value" DECIMAL(20,2),
    "aum_display" TEXT,
    "aum_as_of" DATE,
    "aum_confidence" "AumConfidence",
    "within_mandate" "WithinMandate" NOT NULL DEFAULT 'unconfirmed',
    "within_mandate_manual" BOOLEAN NOT NULL DEFAULT false,
    "strategies" JSONB NOT NULL DEFAULT '{}',
    "focus_areas" JSONB NOT NULL DEFAULT '{}',
    "strategy_detail" TEXT,
    "classification_status" "ClassificationStatus" NOT NULL DEFAULT 'unclassified',
    "classification_source" "ClassificationSource",
    "classified_at" TIMESTAMP(3),
    "source_type" "SourceType" NOT NULL DEFAULT 'manual_add',
    "similar_to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "populate_run_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "email_status" "EmailStatus" NOT NULL DEFAULT 'unknown',
    "email_source" TEXT,
    "linkedin_url" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "is_primary_bd_contact" BOOLEAN NOT NULL DEFAULT false,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_stages" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "stage" "CrmStage" NOT NULL DEFAULT 'not_contacted',
    "stage_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner" TEXT,
    "next_follow_up_date" DATE,
    "deal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "type" "ActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "deletable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_sources" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "source_url_or_description" TEXT NOT NULL,
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandate_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "aum_min" DECIMAL(20,2) NOT NULL DEFAULT 1000000000,
    "aum_max" DECIMAL(20,2) NOT NULL DEFAULT 15000000000,

    CONSTRAINT "mandate_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "hunter_api_key_encrypted" TEXT,
    "follow_up_threshold_days" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "oauth_token_ref" TEXT NOT NULL,
    "connected_email" TEXT NOT NULL,
    "status" "EmailConnectionStatus" NOT NULL DEFAULT 'connected',
    "watch_expires_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "ad_hoc_recipient_name" TEXT,
    "ad_hoc_recipient_email" TEXT,
    "subject" TEXT NOT NULL,
    "provider_thread_id" TEXT,
    "status" "ThreadStatus" NOT NULL DEFAULT 'awaiting_reply',
    "follow_up_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "is_follow_up" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "ad_hoc_recipient_name" TEXT,
    "ad_hoc_recipient_email" TEXT,
    "title" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "location_or_link" TEXT,
    "agenda_notes" TEXT,
    "provider_event_id" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'scheduled',
    "notes_logged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "is_from_template" BOOLEAN NOT NULL DEFAULT false,
    "owner" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "populate_runs" (
    "id" TEXT NOT NULL,
    "mode" "PopulateMode" NOT NULL,
    "seed_firm_id" TEXT,
    "criteria" JSONB,
    "triggered_by" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firms_found" INTEGER NOT NULL DEFAULT 0,
    "firms_added" INTEGER NOT NULL DEFAULT 0,
    "firms_skipped_duplicate" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "populate_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "related_firm_id" TEXT,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "crm_stages_firm_id_key" ON "crm_stages"("firm_id");

-- CreateIndex
CREATE INDEX "research_sources_entity_type_entity_id_idx" ON "research_sources"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_connections_user_id_key" ON "email_connections"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firms" ADD CONSTRAINT "firms_populate_run_id_fkey" FOREIGN KEY ("populate_run_id") REFERENCES "populate_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firms" ADD CONSTRAINT "firms_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_firm_fkey" FOREIGN KEY ("entity_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "populate_runs" ADD CONSTRAINT "populate_runs_seed_firm_id_fkey" FOREIGN KEY ("seed_firm_id") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "populate_runs" ADD CONSTRAINT "populate_runs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
