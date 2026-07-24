ALTER TABLE "tasks" ADD COLUMN "batch_id" TEXT;
CREATE INDEX "tasks_batch_id_idx" ON "tasks"("batch_id");
