-- Retour exact à 20261101100000_suggestions. Les reviews et les baselines sont supprimées avec leurs tables.
DROP TABLE "public"."baselines";
DROP TRIGGER "reviews_no_truncate" ON "public"."reviews";
DROP TRIGGER "reviews_no_update_delete" ON "public"."reviews";
DROP TABLE "public"."reviews";
DROP FUNCTION "public"."reviews_immutable"();
DROP TYPE "public"."baseline_status";
DROP TYPE "public"."review_status";
DROP TYPE "public"."review_target_kind";
