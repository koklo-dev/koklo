-- TK-93 (B301, B304) : données en UE par projet et création du dépôt de spec par le worker. Additif : une colonne
-- (faux par défaut, donc les projets existants gardent leur comportement) et une table, sans enum, fonction ni trigger.
-- Les listes fermées (statut, code d'erreur, modèle d'idée) sont des CHECK écrits à la main : Prisma ne les modélise pas.
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "eu_only" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "project_creations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "retry_after_ms" INTEGER,
    "repo_name" TEXT NOT NULL,
    "installation_id" UUID,
    "idea_template" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "requested_by" UUID NOT NULL,
    "invitation_failed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_creations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_creations_status_check" CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
    CONSTRAINT "project_creations_error_code_check" CHECK ("error_code" IS NULL OR "error_code" IN ('no_account', 'name_taken', 'user_token_required', 'auth_expired_user', 'auth_expired_installation', 'resource_not_accessible', 'provider_unavailable', 'rate_limited', 'account_unavailable', 'invalid_name', 'forbidden', 'unknown')),
    CONSTRAINT "project_creations_idea_template_check" CHECK ("idea_template" IN ('default', 'empty')),
    CONSTRAINT "project_creations_retry_after_ms_check" CHECK ("retry_after_ms" IS NULL OR "retry_after_ms" >= 0),
    CONSTRAINT "project_creations_repo_name_check" CHECK (char_length("repo_name") <= 100)
);

-- CreateIndex
CREATE INDEX "project_creations_organization_id_project_id_created_at_idx" ON "project_creations"("organization_id", "project_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "project_creations_organization_id_idempotency_key_key" ON "project_creations"("organization_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "project_creations" ADD CONSTRAINT "project_creations_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
