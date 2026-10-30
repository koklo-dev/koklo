-- CreateEnum
CREATE TYPE "provider" AS ENUM ('github');

-- CreateEnum
CREATE TYPE "installation_status" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "owner_kind" AS ENUM ('organization', 'user');

-- CreateEnum
CREATE TYPE "repo_role" AS ENUM ('spec', 'front', 'back', 'monorepo', 'mobile');

-- CreateEnum
CREATE TYPE "repo_mode" AS ENUM ('new', 'adopted');

-- CreateEnum
CREATE TYPE "webhook_event" AS ENUM ('installation', 'push', 'pull_request', 'pull_request_review', 'check_suite', 'check_run', 'workflow_run', 'deployment_status');

-- CreateEnum
CREATE TYPE "webhook_delivery_status" AS ENUM ('received', 'processing', 'processed', 'ignored', 'failed');

-- CreateEnum
CREATE TYPE "spec_index_status" AS ENUM ('building', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "feature_status" AS ENUM ('brouillon', 'specifiee', 'implementee', 'adoptee');

-- CreateEnum
CREATE TYPE "feature_priority" AS ENUM ('must', 'should', 'could', 'wont');

-- CreateEnum
CREATE TYPE "endpoint_method" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "write_batch_status" AS ENUM ('queued', 'committing', 'committed', 'failed', 'conflict');

-- CreateTable
CREATE TABLE "provider_installations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" "provider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "owner_kind" "owner_kind" NOT NULL,
    "owner_login" TEXT NOT NULL,
    "status" "installation_status" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_repos" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "role" "repo_role" NOT NULL,
    "mode" "repo_mode" NOT NULL,
    "external_id" TEXT NOT NULL,
    "owner_login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL,
    "spec_path" TEXT,
    "last_reconciled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "repo_id" UUID NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "status" "spec_index_status" NOT NULL,
    "error_code" TEXT,
    "indexed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_heads" (
    "organization_id" UUID NOT NULL,
    "repo_id" UUID NOT NULL,
    "branch" TEXT NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_heads_pkey" PRIMARY KEY ("repo_id","branch")
);

-- CreateTable
CREATE TABLE "spec_features" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "spec_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "feature_status" NOT NULL,
    "priority" "feature_priority" NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_criteria" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "spec_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_tables" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "spec_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_endpoints" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "spec_id" TEXT NOT NULL,
    "method" "endpoint_method" NOT NULL,
    "path" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_feature_tables" (
    "organization_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "target_spec_id" TEXT NOT NULL,

    CONSTRAINT "spec_feature_tables_pkey" PRIMARY KEY ("feature_id","target_spec_id")
);

-- CreateTable
CREATE TABLE "spec_feature_endpoints" (
    "organization_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "target_spec_id" TEXT NOT NULL,

    CONSTRAINT "spec_feature_endpoints_pkey" PRIMARY KEY ("feature_id","target_spec_id")
);

-- CreateTable
CREATE TABLE "spec_write_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "repo_id" UUID NOT NULL,
    "branch" TEXT NOT NULL,
    "author_user_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "base_sha" TEXT,
    "commit_sha" TEXT,
    "status" "write_batch_status" NOT NULL,
    "error_code" TEXT,
    "enqueued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_write_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_write_operations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "target_spec_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_write_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "provider" "provider" NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event" "webhook_event" NOT NULL,
    "action" TEXT,
    "installation_external_id" TEXT,
    "repo_external_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "webhook_delivery_status" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_installations_organization_id_idx" ON "provider_installations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_installations_provider_external_id_key" ON "provider_installations"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_installations_organization_id_id_key" ON "provider_installations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "project_repos_organization_id_idx" ON "project_repos"("organization_id");

-- CreateIndex
CREATE INDEX "project_repos_project_id_idx" ON "project_repos"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_repos_installation_id_external_id_key" ON "project_repos"("installation_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_repos_organization_id_id_key" ON "project_repos"("organization_id", "id");

-- CreateIndex
CREATE INDEX "spec_snapshots_organization_id_idx" ON "spec_snapshots"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_snapshots_repo_id_commit_sha_key" ON "spec_snapshots"("repo_id", "commit_sha");

-- CreateIndex
CREATE UNIQUE INDEX "spec_snapshots_organization_id_id_key" ON "spec_snapshots"("organization_id", "id");

-- CreateIndex
CREATE INDEX "spec_heads_organization_id_idx" ON "spec_heads"("organization_id");

-- CreateIndex
CREATE INDEX "spec_heads_snapshot_id_idx" ON "spec_heads"("snapshot_id");

-- CreateIndex
CREATE INDEX "spec_features_organization_id_idx" ON "spec_features"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_features_snapshot_id_spec_id_key" ON "spec_features"("snapshot_id", "spec_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_features_organization_id_id_key" ON "spec_features"("organization_id", "id");

-- CreateIndex
CREATE INDEX "spec_criteria_organization_id_idx" ON "spec_criteria"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_criteria_feature_id_spec_id_key" ON "spec_criteria"("feature_id", "spec_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_criteria_feature_id_position_key" ON "spec_criteria"("feature_id", "position");

-- CreateIndex
CREATE INDEX "spec_tables_organization_id_idx" ON "spec_tables"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_tables_snapshot_id_spec_id_key" ON "spec_tables"("snapshot_id", "spec_id");

-- CreateIndex
CREATE INDEX "spec_endpoints_organization_id_idx" ON "spec_endpoints"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_endpoints_snapshot_id_spec_id_key" ON "spec_endpoints"("snapshot_id", "spec_id");

-- CreateIndex
CREATE INDEX "spec_feature_tables_organization_id_idx" ON "spec_feature_tables"("organization_id");

-- CreateIndex
CREATE INDEX "spec_feature_endpoints_organization_id_idx" ON "spec_feature_endpoints"("organization_id");

-- CreateIndex
CREATE INDEX "spec_write_batches_organization_id_idx" ON "spec_write_batches"("organization_id");

-- CreateIndex
CREATE INDEX "spec_write_batches_repo_id_idx" ON "spec_write_batches"("repo_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_write_batches_project_id_idempotency_key_key" ON "spec_write_batches"("project_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "spec_write_batches_organization_id_id_key" ON "spec_write_batches"("organization_id", "id");

-- CreateIndex
CREATE INDEX "spec_write_operations_organization_id_idx" ON "spec_write_operations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "spec_write_operations_batch_id_position_key" ON "spec_write_operations"("batch_id", "position");

-- CreateIndex
CREATE INDEX "webhook_deliveries_received_at_idx" ON "webhook_deliveries"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_provider_delivery_id_key" ON "webhook_deliveries"("provider", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_id_key" ON "projects"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "provider_installations" ADD CONSTRAINT "provider_installations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_organization_id_installation_id_fkey" FOREIGN KEY ("organization_id", "installation_id") REFERENCES "provider_installations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_snapshots" ADD CONSTRAINT "spec_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_snapshots" ADD CONSTRAINT "spec_snapshots_organization_id_repo_id_fkey" FOREIGN KEY ("organization_id", "repo_id") REFERENCES "project_repos"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_heads" ADD CONSTRAINT "spec_heads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_heads" ADD CONSTRAINT "spec_heads_organization_id_repo_id_fkey" FOREIGN KEY ("organization_id", "repo_id") REFERENCES "project_repos"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_heads" ADD CONSTRAINT "spec_heads_organization_id_snapshot_id_fkey" FOREIGN KEY ("organization_id", "snapshot_id") REFERENCES "spec_snapshots"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_features" ADD CONSTRAINT "spec_features_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_features" ADD CONSTRAINT "spec_features_organization_id_snapshot_id_fkey" FOREIGN KEY ("organization_id", "snapshot_id") REFERENCES "spec_snapshots"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_criteria" ADD CONSTRAINT "spec_criteria_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_criteria" ADD CONSTRAINT "spec_criteria_organization_id_feature_id_fkey" FOREIGN KEY ("organization_id", "feature_id") REFERENCES "spec_features"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_tables" ADD CONSTRAINT "spec_tables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_tables" ADD CONSTRAINT "spec_tables_organization_id_snapshot_id_fkey" FOREIGN KEY ("organization_id", "snapshot_id") REFERENCES "spec_snapshots"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_endpoints" ADD CONSTRAINT "spec_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_endpoints" ADD CONSTRAINT "spec_endpoints_organization_id_snapshot_id_fkey" FOREIGN KEY ("organization_id", "snapshot_id") REFERENCES "spec_snapshots"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_feature_tables" ADD CONSTRAINT "spec_feature_tables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_feature_tables" ADD CONSTRAINT "spec_feature_tables_organization_id_feature_id_fkey" FOREIGN KEY ("organization_id", "feature_id") REFERENCES "spec_features"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_feature_endpoints" ADD CONSTRAINT "spec_feature_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_feature_endpoints" ADD CONSTRAINT "spec_feature_endpoints_organization_id_feature_id_fkey" FOREIGN KEY ("organization_id", "feature_id") REFERENCES "spec_features"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_write_batches" ADD CONSTRAINT "spec_write_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_write_batches" ADD CONSTRAINT "spec_write_batches_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_write_batches" ADD CONSTRAINT "spec_write_batches_organization_id_repo_id_fkey" FOREIGN KEY ("organization_id", "repo_id") REFERENCES "project_repos"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_write_operations" ADD CONSTRAINT "spec_write_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spec_write_operations" ADD CONSTRAINT "spec_write_operations_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "spec_write_batches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------
-- Objets SQL non exprimables dans schema.prisma (index partiels, CHECK).
-- Prisma les ignore : `migrate diff` reste vide (vérifié par test/spec-index-migration.test.ts).
-- ---------------------------------------------------------------------------------------------

-- Au plus un repo porteur de la spec par projet : un repo de spec dédié, ou un monorepo qui
-- porte la spec dans un dossier (`spec_path` non nul).
CREATE UNIQUE INDEX "project_repos_one_spec_carrier_key" ON "project_repos"("project_id")
  WHERE "role" = 'spec' OR "spec_path" IS NOT NULL;

-- Retrouver le lot d'un commit (réconciliation) : un SHA appartient à un seul lot.
CREATE UNIQUE INDEX "spec_write_batches_commit_sha_key" ON "spec_write_batches"("repo_id", "commit_sha")
  WHERE "commit_sha" IS NOT NULL;

-- Reprise de la file par branche (la sérialisation elle-même reste dans pg-boss).
CREATE INDEX "spec_write_batches_pending_idx" ON "spec_write_batches"("repo_id", "branch", "enqueued_at")
  WHERE "status" IN ('queued', 'committing');

-- Rattrapage des livraisons non terminées.
CREATE INDEX "webhook_deliveries_pending_idx" ON "webhook_deliveries"("status", "received_at")
  WHERE "status" IN ('received', 'processing', 'failed');

-- CHECK de cohérence. Les formats d'identifiants reprennent ceux de `@koklo/schema` ; les `position`
-- et `attempts` bornés, le `payload` objet et le lot `committed` complet évitent des états que le
-- code ne produit jamais (défense en profondeur, pas de règle métier nouvelle).

-- Repo : `spec_path` relatif, sans `..` ; un repo dédié (`spec`) n'a pas de sous-dossier.
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_spec_path_check" CHECK (
  "spec_path" IS NULL OR (
    "spec_path" <> ''
    AND "spec_path" !~ '^/'
    AND "spec_path" !~ '(^|/)\.\.(/|$)'
  )
);
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_spec_role_check" CHECK ("role" <> 'spec' OR "spec_path" IS NULL);

-- Format des identifiants de spec.
ALTER TABLE "spec_features" ADD CONSTRAINT "spec_features_spec_id_check" CHECK ("spec_id" ~ '^F-[0-9]{3,}$');
ALTER TABLE "spec_criteria" ADD CONSTRAINT "spec_criteria_spec_id_check" CHECK ("spec_id" ~ '^AC-[0-9]+$');
ALTER TABLE "spec_tables" ADD CONSTRAINT "spec_tables_spec_id_check" CHECK ("spec_id" ~ '^T-[a-z0-9][a-z0-9-]*$');
ALTER TABLE "spec_endpoints" ADD CONSTRAINT "spec_endpoints_spec_id_check" CHECK ("spec_id" ~ '^E-[a-z0-9][a-z0-9-]*$');

-- Lots d'écriture : positions à partir de 1, lot validé = commit connu, opérations bien formées.
ALTER TABLE "spec_criteria" ADD CONSTRAINT "spec_criteria_position_check" CHECK ("position" >= 1);
ALTER TABLE "spec_write_batches" ADD CONSTRAINT "spec_write_batches_committed_check" CHECK (
  "status" <> 'committed' OR ("commit_sha" IS NOT NULL AND "committed_at" IS NOT NULL)
);
ALTER TABLE "spec_write_operations" ADD CONSTRAINT "spec_write_operations_kind_check" CHECK ("kind" ~ '^[a-z][a-z0-9_.-]*$');
ALTER TABLE "spec_write_operations" ADD CONSTRAINT "spec_write_operations_position_check" CHECK ("position" >= 1);
ALTER TABLE "spec_write_operations" ADD CONSTRAINT "spec_write_operations_payload_object_check" CHECK (jsonb_typeof("payload") = 'object');

-- Journal de webhooks : payload objet, compteur d'essais non négatif.
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_payload_object_check" CHECK (jsonb_typeof("payload") = 'object');
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_attempts_check" CHECK ("attempts" >= 0);
