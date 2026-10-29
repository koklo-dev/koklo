-- Triggers et fonctions (les tables supprimées emportent leurs triggers, les fonctions restent).
DROP TRIGGER "project_counters_no_decrease" ON "public"."project_counters";
DROP TRIGGER "audit_log_no_truncate" ON "public"."audit_log";
DROP TRIGGER "audit_log_no_update_delete" ON "public"."audit_log";

-- Index partiels, CHECK : supprimés avec leurs tables ci-dessous.

-- DropForeignKey
ALTER TABLE "public"."tickets" DROP CONSTRAINT "tickets_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tickets" DROP CONSTRAINT "tickets_project_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tickets" DROP CONSTRAINT "tickets_sprint_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_labels" DROP CONSTRAINT "ticket_labels_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_labels" DROP CONSTRAINT "ticket_labels_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_features" DROP CONSTRAINT "ticket_features_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_features" DROP CONSTRAINT "ticket_features_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."acceptance_criteria" DROP CONSTRAINT "acceptance_criteria_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."acceptance_criteria" DROP CONSTRAINT "acceptance_criteria_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_dependencies" DROP CONSTRAINT "ticket_dependencies_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_dependencies" DROP CONSTRAINT "ticket_dependencies_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_dependencies" DROP CONSTRAINT "ticket_dependencies_depends_on_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."sprints" DROP CONSTRAINT "sprints_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."sprints" DROP CONSTRAINT "sprints_project_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_states" DROP CONSTRAINT "project_states_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_states" DROP CONSTRAINT "project_states_project_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."leases" DROP CONSTRAINT "leases_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."leases" DROP CONSTRAINT "leases_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ticket_comments" DROP CONSTRAINT "ticket_comments_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."audit_log" DROP CONSTRAINT "audit_log_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_counters" DROP CONSTRAINT "project_counters_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_counters" DROP CONSTRAINT "project_counters_project_id_fkey";

-- DropTable
DROP TABLE "public"."tickets";

-- DropTable
DROP TABLE "public"."ticket_labels";

-- DropTable
DROP TABLE "public"."ticket_features";

-- DropTable
DROP TABLE "public"."acceptance_criteria";

-- DropTable
DROP TABLE "public"."ticket_dependencies";

-- DropTable
DROP TABLE "public"."sprints";

-- DropTable
DROP TABLE "public"."project_states";

-- DropTable
DROP TABLE "public"."leases";

-- DropTable
DROP TABLE "public"."ticket_comments";

-- DropTable
DROP TABLE "public"."audit_log";

-- DropTable
DROP TABLE "public"."project_counters";

-- DropEnum
DROP TYPE "public"."ticket_status";

-- DropEnum
DROP TYPE "public"."ticket_type";

-- DropEnum
DROP TYPE "public"."ticket_priority";

-- DropEnum
DROP TYPE "public"."ticket_package";

-- DropEnum
DROP TYPE "public"."sensitivity";

-- DropEnum
DROP TYPE "public"."holder_kind";

-- DropEnum
DROP TYPE "public"."dependency_type";

-- DropEnum
DROP TYPE "public"."sprint_status";

-- DropEnum
DROP TYPE "public"."proof_status";

-- DropEnum
DROP TYPE "public"."comment_target_kind";

-- DropEnum
DROP TYPE "public"."comment_author_kind";

-- DropEnum
DROP TYPE "public"."audit_actor_kind";

-- DropEnum
DROP TYPE "public"."counter_name";


-- DropFunction
DROP FUNCTION "public"."project_counters_monotonic"();
DROP FUNCTION "public"."audit_log_immutable"();
