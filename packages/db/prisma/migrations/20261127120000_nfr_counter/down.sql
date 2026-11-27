-- Retour exact à 20261127110000_technical_launch_modes. PostgreSQL ne retire pas une valeur d'enum : les compteurs `nfr`
-- sont supprimés puis `counter_name` est recréé sans `nfr` ; les autres compteurs sont conservés.
DELETE FROM "public"."project_counters" WHERE "name"::text = 'nfr';
ALTER TYPE "public"."counter_name" RENAME TO "counter_name_old";
CREATE TYPE "public"."counter_name" AS ENUM ('ticket', 'sprint', 'feature', 'suggestion', 'rule', 'adr');
ALTER TABLE "public"."project_counters"
  ALTER COLUMN "name" TYPE "public"."counter_name" USING "name"::text::"public"."counter_name";
DROP TYPE "public"."counter_name_old";
