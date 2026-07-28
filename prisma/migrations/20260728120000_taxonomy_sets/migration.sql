-- CreateEnum
CREATE TYPE "TaxonomyKind" AS ENUM ('strategy', 'focus_area');

-- CreateTable
CREATE TABLE "taxonomy_sets" (
    "id" TEXT NOT NULL,
    "kind" "TaxonomyKind" NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomy_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_sets_kind_key" ON "taxonomy_sets"("kind");
