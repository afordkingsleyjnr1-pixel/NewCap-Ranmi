-- AlterTable
ALTER TABLE "projects"
  ADD COLUMN "taxonomy" JSONB,
  ADD COLUMN "taxonomy_description" TEXT,
  ADD COLUMN "taxonomy_confirmed_at" TIMESTAMP(3);
