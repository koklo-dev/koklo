-- Index partiels et CHECK : supprimés avec leurs tables ci-dessous (aucune fonction ni trigger créé).

-- DropForeignKey
ALTER TABLE "public"."provider_installations" DROP CONSTRAINT "provider_installations_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_repos" DROP CONSTRAINT "project_repos_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_repos" DROP CONSTRAINT "project_repos_organization_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."project_repos" DROP CONSTRAINT "project_repos_organization_id_installation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_snapshots" DROP CONSTRAINT "spec_snapshots_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_snapshots" DROP CONSTRAINT "spec_snapshots_organization_id_repo_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_heads" DROP CONSTRAINT "spec_heads_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_heads" DROP CONSTRAINT "spec_heads_organization_id_repo_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_heads" DROP CONSTRAINT "spec_heads_organization_id_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_features" DROP CONSTRAINT "spec_features_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_features" DROP CONSTRAINT "spec_features_organization_id_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_criteria" DROP CONSTRAINT "spec_criteria_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_criteria" DROP CONSTRAINT "spec_criteria_organization_id_feature_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_tables" DROP CONSTRAINT "spec_tables_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_tables" DROP CONSTRAINT "spec_tables_organization_id_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_endpoints" DROP CONSTRAINT "spec_endpoints_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_endpoints" DROP CONSTRAINT "spec_endpoints_organization_id_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_feature_tables" DROP CONSTRAINT "spec_feature_tables_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_feature_tables" DROP CONSTRAINT "spec_feature_tables_organization_id_feature_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_feature_endpoints" DROP CONSTRAINT "spec_feature_endpoints_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_feature_endpoints" DROP CONSTRAINT "spec_feature_endpoints_organization_id_feature_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_write_batches" DROP CONSTRAINT "spec_write_batches_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_write_batches" DROP CONSTRAINT "spec_write_batches_organization_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_write_batches" DROP CONSTRAINT "spec_write_batches_organization_id_repo_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_write_operations" DROP CONSTRAINT "spec_write_operations_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."spec_write_operations" DROP CONSTRAINT "spec_write_operations_organization_id_batch_id_fkey";

-- DropIndex
DROP INDEX "public"."projects_organization_id_id_key";

-- DropTable
DROP TABLE "public"."provider_installations";

-- DropTable
DROP TABLE "public"."project_repos";

-- DropTable
DROP TABLE "public"."spec_snapshots";

-- DropTable
DROP TABLE "public"."spec_heads";

-- DropTable
DROP TABLE "public"."spec_features";

-- DropTable
DROP TABLE "public"."spec_criteria";

-- DropTable
DROP TABLE "public"."spec_tables";

-- DropTable
DROP TABLE "public"."spec_endpoints";

-- DropTable
DROP TABLE "public"."spec_feature_tables";

-- DropTable
DROP TABLE "public"."spec_feature_endpoints";

-- DropTable
DROP TABLE "public"."spec_write_batches";

-- DropTable
DROP TABLE "public"."spec_write_operations";

-- DropTable
DROP TABLE "public"."webhook_deliveries";

-- DropEnum
DROP TYPE "public"."provider";

-- DropEnum
DROP TYPE "public"."installation_status";

-- DropEnum
DROP TYPE "public"."owner_kind";

-- DropEnum
DROP TYPE "public"."repo_role";

-- DropEnum
DROP TYPE "public"."repo_mode";

-- DropEnum
DROP TYPE "public"."webhook_event";

-- DropEnum
DROP TYPE "public"."webhook_delivery_status";

-- DropEnum
DROP TYPE "public"."spec_index_status";

-- DropEnum
DROP TYPE "public"."feature_status";

-- DropEnum
DROP TYPE "public"."feature_priority";

-- DropEnum
DROP TYPE "public"."endpoint_method";

-- DropEnum
DROP TYPE "public"."write_batch_status";

