-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "ticket_type" AS ENUM ('feature', 'bug', 'task', 'chore');

-- CreateEnum
CREATE TYPE "ticket_priority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ticket_package" AS ENUM ('web', 'api', 'worker', 'contract', 'db', 'domain', 'schema', 'github', 'rules', 'delivery', 'cli', 'ui', 'config', 'e2e', 'infra');

-- CreateEnum
CREATE TYPE "sensitivity" AS ENUM ('safe', 'sensitive');

-- CreateEnum
CREATE TYPE "holder_kind" AS ENUM ('member', 'runner');

-- CreateEnum
CREATE TYPE "dependency_type" AS ENUM ('blocks', 'related');

-- CreateEnum
CREATE TYPE "sprint_status" AS ENUM ('planned', 'active', 'closed');

-- CreateEnum
CREATE TYPE "proof_status" AS ENUM ('pending', 'proven', 'failed');

-- CreateEnum
CREATE TYPE "comment_target_kind" AS ENUM ('ticket', 'feature', 'screen', 'change_request');

-- CreateEnum
CREATE TYPE "comment_author_kind" AS ENUM ('human', 'agent', 'client', 'system');

-- CreateEnum
CREATE TYPE "audit_actor_kind" AS ENUM ('human', 'agent', 'runner', 'system');

-- CreateEnum
CREATE TYPE "counter_name" AS ENUM ('ticket', 'sprint');

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ticket_type" NOT NULL,
    "status" "ticket_status" NOT NULL,
    "priority" "ticket_priority" NOT NULL,
    "sprint_id" UUID,
    "assignee_kind" "holder_kind",
    "assignee_id" TEXT,
    "pkg" "ticket_package" NOT NULL,
    "sensitivity" "sensitivity" NOT NULL,
    "estimate_hours" DECIMAL(6,2),
    "branch" TEXT,
    "pull_request" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "review_rounds" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_labels" (
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ticket_labels_pkey" PRIMARY KEY ("ticket_id","label")
);

-- CreateTable
CREATE TABLE "ticket_features" (
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "feature_ref" TEXT NOT NULL,

    CONSTRAINT "ticket_features_pkey" PRIMARY KEY ("ticket_id","feature_ref")
);

-- CreateTable
CREATE TABLE "acceptance_criteria" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "spec_ref" TEXT,
    "proof_status" "proof_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "acceptance_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_dependencies" (
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "depends_on_id" UUID NOT NULL,
    "type" "dependency_type" NOT NULL,

    CONSTRAINT "ticket_dependencies_pkey" PRIMARY KEY ("ticket_id","depends_on_id","type")
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "sprint_status" NOT NULL,
    "definition_of_done" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_states" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "holder_kind" "holder_kind" NOT NULL,
    "holder_id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "worktree" TEXT NOT NULL,
    "acquired_at" TIMESTAMPTZ(3) NOT NULL,
    "heartbeat_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ttl_ms" INTEGER NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "target_kind" "comment_target_kind" NOT NULL,
    "target_id" UUID NOT NULL,
    "author_kind" "comment_author_kind" NOT NULL,
    "author_id" TEXT,
    "body" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_kind" "audit_actor_kind" NOT NULL,
    "actor_id" TEXT,
    "token_id" TEXT,
    "action" TEXT NOT NULL,
    "target_kind" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "ticket_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_counters" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" "counter_name" NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_counters_pkey" PRIMARY KEY ("project_id","name")
);

-- CreateIndex
CREATE INDEX "tickets_organization_id_idx" ON "tickets"("organization_id");

-- CreateIndex
CREATE INDEX "tickets_project_id_status_idx" ON "tickets"("project_id", "status");

-- CreateIndex
CREATE INDEX "tickets_sprint_id_idx" ON "tickets"("sprint_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_project_id_key_key" ON "tickets"("project_id", "key");

-- CreateIndex
CREATE INDEX "ticket_labels_organization_id_idx" ON "ticket_labels"("organization_id");

-- CreateIndex
CREATE INDEX "ticket_features_organization_id_idx" ON "ticket_features"("organization_id");

-- CreateIndex
CREATE INDEX "acceptance_criteria_organization_id_idx" ON "acceptance_criteria"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "acceptance_criteria_ticket_id_position_key" ON "acceptance_criteria"("ticket_id", "position");

-- CreateIndex
CREATE INDEX "ticket_dependencies_organization_id_idx" ON "ticket_dependencies"("organization_id");

-- CreateIndex
CREATE INDEX "ticket_dependencies_depends_on_id_idx" ON "ticket_dependencies"("depends_on_id");

-- CreateIndex
CREATE INDEX "sprints_organization_id_idx" ON "sprints"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_project_id_number_key" ON "sprints"("project_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "project_states_project_id_key" ON "project_states"("project_id");

-- CreateIndex
CREATE INDEX "project_states_organization_id_idx" ON "project_states"("organization_id");

-- CreateIndex
CREATE INDEX "leases_organization_id_idx" ON "leases"("organization_id");

-- CreateIndex
CREATE INDEX "leases_ticket_id_idx" ON "leases"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_comments_organization_id_idx" ON "ticket_comments"("organization_id");

-- CreateIndex
CREATE INDEX "ticket_comments_target_kind_target_id_idx" ON "ticket_comments"("target_kind", "target_id");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_idx" ON "audit_log"("organization_id");

-- CreateIndex
CREATE INDEX "audit_log_ticket_id_idx" ON "audit_log"("ticket_id");

-- CreateIndex
CREATE INDEX "project_counters_organization_id_idx" ON "project_counters"("organization_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_labels" ADD CONSTRAINT "ticket_labels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_labels" ADD CONSTRAINT "ticket_labels_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_features" ADD CONSTRAINT "ticket_features_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_features" ADD CONSTRAINT "ticket_features_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criteria" ADD CONSTRAINT "acceptance_criteria_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance_criteria" ADD CONSTRAINT "acceptance_criteria_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_states" ADD CONSTRAINT "project_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_states" ADD CONSTRAINT "project_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_counters" ADD CONSTRAINT "project_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_counters" ADD CONSTRAINT "project_counters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Objets SQL non exprimables dans schema.prisma (index partiels, CHECK, triggers).
-- Prisma les ignore : `migrate diff` reste vide (vérifié par test/tickets-migration.test.ts).
-- ---------------------------------------------------------------------------------------------

-- Un seul bail non libéré par ticket. Un index partiel ne peut pas dépendre de now() : un bail
-- expiré bloque tant qu'il n'est pas marqué libéré (l'acquisition le libère dans sa transaction).
CREATE UNIQUE INDEX "leases_active_ticket_key" ON "leases"("ticket_id") WHERE "released_at" IS NULL;

-- Un seul sprint actif par projet.
CREATE UNIQUE INDEX "sprints_one_active_per_project_key" ON "sprints"("project_id") WHERE "status" = 'active';

-- CHECK
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_review_rounds_check" CHECK ("review_rounds" >= 0);
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_estimate_hours_check" CHECK ("estimate_hours" IS NULL OR "estimate_hours" >= 0);
ALTER TABLE "acceptance_criteria" ADD CONSTRAINT "acceptance_criteria_position_check" CHECK ("position" >= 1);
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_no_self_check" CHECK ("ticket_id" <> "depends_on_id");
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_dates_check" CHECK ("ends_on" >= "starts_on");
ALTER TABLE "project_states" ADD CONSTRAINT "project_states_version_check" CHECK ("version" >= 1);
ALTER TABLE "project_states" ADD CONSTRAINT "project_states_content_object_check" CHECK (jsonb_typeof("content") = 'object');
ALTER TABLE "leases" ADD CONSTRAINT "leases_ttl_ms_check" CHECK ("ttl_ms" > 0);
ALTER TABLE "project_counters" ADD CONSTRAINT "project_counters_last_value_check" CHECK ("last_value" >= 0);

-- audit_log immuable : aucune modification, aucune suppression, aucun TRUNCATE.
-- Seule exception : la suppression en cascade d'une organisation (la ligne parente a déjà disparu).
CREATE FUNCTION "audit_log_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM "organizations" WHERE "id" = OLD."organization_id") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_immutable"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_immutable"();

-- Le compteur de clés ne recule jamais (même après suppression logique ou annulation d'un ticket).
-- Incrément atomique : UPDATE "project_counters" SET "last_value" = "last_value" + 1
--   WHERE "project_id" = $1 AND "name" = 'ticket' RETURNING "last_value" (verrou de ligne).
CREATE FUNCTION "project_counters_monotonic"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."last_value" < OLD."last_value" THEN
    RAISE EXCEPTION 'project_counters.last_value never decreases (% -> %)', OLD."last_value", NEW."last_value"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_counters_no_decrease"
  BEFORE UPDATE ON "project_counters"
  FOR EACH ROW EXECUTE FUNCTION "project_counters_monotonic"();
