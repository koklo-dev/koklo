-- Retour exact à 20261030120000_provider_spec_index. Les compteurs `feature` sont supprimés
-- (l'énumération est recréée) ; les lots et les autres compteurs sont conservés.
ALTER TABLE "public"."spec_write_batches" DROP CONSTRAINT "spec_write_batches_report_object_check";
ALTER TABLE "public"."spec_write_batches" DROP CONSTRAINT "spec_write_batches_commit_sha_status_check";
ALTER TABLE "public"."spec_write_batches" DROP CONSTRAINT "spec_write_batches_error_code_check";

ALTER TABLE "public"."spec_write_batches" DROP COLUMN "author_role",
DROP COLUMN "message",
DROP COLUMN "report";

DELETE FROM "public"."project_counters" WHERE "name"::text = 'feature';
ALTER TYPE "public"."counter_name" RENAME TO "counter_name_old";
CREATE TYPE "public"."counter_name" AS ENUM ('ticket', 'sprint');
ALTER TABLE "public"."project_counters"
  ALTER COLUMN "name" TYPE "public"."counter_name" USING "name"::text::"public"."counter_name";
DROP TYPE "public"."counter_name_old";
