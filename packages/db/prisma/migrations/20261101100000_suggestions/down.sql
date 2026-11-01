-- Retour exact à 20261101090000_llm_provider_credentials. Les suggestions et les compteurs `suggestion` sont
-- supprimés (la table, les enums, puis `counter_name` recréé) ; les autres compteurs sont conservés.
DROP TABLE "public"."suggestions";
DROP TYPE "public"."suggestion_status";
DROP TYPE "public"."suggestion_target_kind";

DELETE FROM "public"."project_counters" WHERE "name"::text = 'suggestion';
ALTER TYPE "public"."counter_name" RENAME TO "counter_name_old";
CREATE TYPE "public"."counter_name" AS ENUM ('ticket', 'sprint', 'feature');
ALTER TABLE "public"."project_counters"
  ALTER COLUMN "name" TYPE "public"."counter_name" USING "name"::text::"public"."counter_name";
DROP TYPE "public"."counter_name_old";
