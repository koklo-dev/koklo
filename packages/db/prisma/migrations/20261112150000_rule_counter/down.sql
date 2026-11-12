-- Retour exact à 20261112120000_spec_entities_review_versions. PostgreSQL ne retire pas une valeur d'enum : les compteurs
-- `rule` sont supprimés puis `counter_name` est recréé sans `rule` ; les autres compteurs sont conservés.
DELETE FROM "public"."project_counters" WHERE "name"::text = 'rule';
ALTER TYPE "public"."counter_name" RENAME TO "counter_name_old";
CREATE TYPE "public"."counter_name" AS ENUM ('ticket', 'sprint', 'feature', 'suggestion');
ALTER TABLE "public"."project_counters"
  ALTER COLUMN "name" TYPE "public"."counter_name" USING "name"::text::"public"."counter_name";
DROP TYPE "public"."counter_name_old";
