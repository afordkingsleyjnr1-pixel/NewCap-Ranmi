-- Project Tasks/Actions workflow: priority + related contact per task.

CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high');

ALTER TABLE "tasks" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'medium';
ALTER TABLE "tasks" ADD COLUMN "contact_id" TEXT;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
