-- Retour exact à 20261112090000_deliverable_overrides : les entités génériques et les hachages disparaissent, les reviews
-- des quatre nouvelles cibles sont supprimées (le journal est en ajout seul : son trigger est suspendu le temps de ce retour),
-- puis le type est recréé sans les quatre valeurs (un enum ne perd pas de valeur autrement).
DROP TRIGGER "review_versions_no_truncate" ON "public"."review_versions";
DROP TRIGGER "review_versions_no_update_delete" ON "public"."review_versions";
DROP FUNCTION "public"."review_versions_immutable"();
DROP TABLE "public"."review_versions";
DROP TABLE "public"."spec_entities";
ALTER TABLE "public"."spec_snapshots" DROP COLUMN "entities_indexed_at";

ALTER TABLE "public"."reviews" DISABLE TRIGGER "reviews_no_update_delete";
DELETE FROM "public"."reviews" WHERE "target_kind" IN ('flow', 'rules', 'roles', 'deliverable');
ALTER TABLE "public"."reviews" ENABLE TRIGGER "reviews_no_update_delete";

-- Les deux CHECK qui comparent `target_kind` à un littéral sont posés à nouveau après le changement de type.
ALTER TABLE "public"."reviews" DROP CONSTRAINT "reviews_feature_ref_check", DROP CONSTRAINT "reviews_baseline_ref_check";
ALTER TYPE "public"."review_target_kind" RENAME TO "review_target_kind_old";
CREATE TYPE "public"."review_target_kind" AS ENUM ('feature', 'screen', 'baseline');
ALTER TABLE "public"."reviews" ALTER COLUMN "target_kind" TYPE "public"."review_target_kind" USING "target_kind"::text::"public"."review_target_kind";
DROP TYPE "public"."review_target_kind_old";
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_feature_ref_check" CHECK ("target_kind" <> 'feature' OR "target_ref" ~ '^F-[0-9]{3,}$');
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_baseline_ref_check" CHECK ("target_kind" <> 'baseline' OR "target_ref" ~ '^baseline-(0|[1-9][0-9]*)$');
