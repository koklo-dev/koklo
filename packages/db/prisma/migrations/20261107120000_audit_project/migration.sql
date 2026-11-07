-- TK-96 : le journal d'audit porte le projet de l'écriture. Les procédures de pilotage reçoivent `projectId` en
-- entrée (plus de projet « par défaut ») : `audit.list` ne doit montrer que le journal du projet demandé.
-- Colonne nullable : NULL = écriture d'organisation (membre, clé BYOK, projet…), visible de tous les projets de
-- l'organisation. Pas de clé étrangère : audit_log est append-only et ne doit pas disparaître avec un projet.
-- Rattrapage des lignes existantes par leur ressource (ticket, sprint, état de projet, suggestion, validation) ;
-- le déclencheur d'immuabilité est suspendu le temps de ce seul rattrapage, puis rétabli.

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "project_id" UUID;

-- CreateIndex
CREATE INDEX "audit_log_organization_id_project_id_occurred_at_idx" ON "audit_log"("organization_id", "project_id", "occurred_at" DESC);

-- Backfill (déclencheur d'immuabilité suspendu puis rétabli dans la même transaction)
ALTER TABLE "audit_log" DISABLE TRIGGER "audit_log_no_update_delete";
UPDATE "audit_log" AS a SET "project_id" = t."project_id" FROM "tickets" AS t WHERE a."ticket_id" = t."id";
UPDATE "audit_log" AS a SET "project_id" = s."project_id" FROM "sprints" AS s WHERE a."target_kind" = 'sprint' AND a."target_id" = s."id";
UPDATE "audit_log" AS a SET "project_id" = p."project_id" FROM "project_states" AS p WHERE a."target_kind" = 'project_state' AND a."target_id" = p."id";
UPDATE "audit_log" AS a SET "project_id" = s."project_id" FROM "suggestions" AS s WHERE a."target_kind" = 'suggestion' AND a."target_id" = s."id";
UPDATE "audit_log" AS a SET "project_id" = r."project_id" FROM "reviews" AS r WHERE a."target_kind" = 'review' AND a."target_id" = r."id";
ALTER TABLE "audit_log" ENABLE TRIGGER "audit_log_no_update_delete";
