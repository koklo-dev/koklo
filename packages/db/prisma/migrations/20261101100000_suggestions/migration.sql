-- TK-51b : suggestions client (`SG-n`). Additif : deux enums, une valeur de `counter_name`, une table.
-- CreateEnum
CREATE TYPE "suggestion_status" AS ENUM ('open', 'accepted', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "suggestion_target_kind" AS ENUM ('feature', 'screen', 'project');

-- AlterEnum (la valeur ne sert pas dans cette transaction : aucun compteur n'est créé ici)
ALTER TYPE "counter_name" ADD VALUE 'suggestion';

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "target_kind" "suggestion_target_kind" NOT NULL,
    "target_ref" TEXT,
    "body" TEXT NOT NULL,
    "author_user_id" UUID,
    "author_role" TEXT,
    "base_sha" TEXT,
    "status" "suggestion_status" NOT NULL DEFAULT 'open',
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suggestions_organization_id_idx" ON "suggestions"("organization_id");

-- CreateIndex
CREATE INDEX "suggestions_project_id_status_created_at_idx" ON "suggestions"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "suggestions_project_id_key_key" ON "suggestions"("project_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "suggestions_organization_id_id_key" ON "suggestions"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE;

-- CHECK (hors Prisma) : clé, cible, longueurs, SHA hexadécimal minuscule, cohérence de la décision.
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_key_check" CHECK ("key" ~ '^SG-[1-9][0-9]*$');
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_target_ref_presence_check" CHECK (("target_kind" = 'project') = ("target_ref" IS NULL));
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_target_ref_length_check" CHECK ("target_ref" IS NULL OR char_length("target_ref") BETWEEN 1 AND 64);
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_feature_ref_check" CHECK ("target_kind" <> 'feature' OR "target_ref" ~ '^F-[0-9]{3,}$');
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_author_role_check" CHECK ("author_role" IS NULL OR char_length("author_role") BETWEEN 1 AND 64);
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_body_check" CHECK (char_length("body") BETWEEN 1 AND 5000);
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_decision_note_check" CHECK ("decision_note" IS NULL OR char_length("decision_note") <= 2000);
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_base_sha_check" CHECK ("base_sha" IS NULL OR "base_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_decided_at_check" CHECK (("status" = 'open') = ("decided_at" IS NULL));
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_open_decision_check" CHECK ("status" <> 'open' OR ("decided_by_user_id" IS NULL AND "decision_note" IS NULL));
