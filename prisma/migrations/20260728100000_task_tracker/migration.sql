-- CreateEnum
CREATE TYPE "TaskTrackerStatus" AS ENUM ('not_started', 'in_progress', 'under_review', 'completed', 'blocked');

-- AlterTable
ALTER TABLE "tasks"
  ADD COLUMN "tracker_status" "TaskTrackerStatus" NOT NULL DEFAULT 'not_started',
  ADD COLUMN "progress_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "time_spent_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completion_verified_by" TEXT,
  ADD COLUMN "completion_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_comments_task_id_idx" ON "task_comments"("task_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completion_verified_by_fkey" FOREIGN KEY ("completion_verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
