-- Retour exact à 20261114100000_architecture_proposal_kinds. PostgreSQL ne retire pas une valeur d'enum : les compteurs `adr`
-- sont supprimés puis `counter_name` est recréé sans `adr` ; les autres compteurs sont conservés.
DELETE FROM "public"."project_counters" WHERE "name"::text = 'adr';
ALTER TYPE "public"."counter_name" RENAME TO "counter_name_old";
CREATE TYPE "public"."counter_name" AS ENUM ('ticket', 'sprint', 'feature', 'suggestion', 'rule');
ALTER TABLE "public"."project_counters"
  ALTER COLUMN "name" TYPE "public"."counter_name" USING "name"::text::"public"."counter_name";
DROP TYPE "public"."counter_name_old";
