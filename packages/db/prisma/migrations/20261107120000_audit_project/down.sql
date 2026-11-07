-- Retour exact à 20261107090000_ai_providers : le projet des entrées d'audit n'est plus journalisé (les lignes survivent).
DROP INDEX "public"."audit_log_organization_id_project_id_occurred_at_idx";
ALTER TABLE "public"."audit_log" DROP COLUMN "project_id";
