-- Retour exact à 20261102100000_notification_email_state. Aucune ligne n'est touchée : les colonnes
-- générées se recalculent à la remontée.
DROP INDEX "public"."tickets_project_id_status_priority_rank_key_number_id_idx";
DROP INDEX "public"."tickets_project_id_priority_rank_key_number_id_idx";
DROP INDEX "public"."tickets_search_idx";
DROP INDEX "public"."spec_features_search_idx";
DROP INDEX "public"."spec_features_snapshot_id_spec_number_id_idx";
ALTER TABLE "public"."tickets" DROP COLUMN "search";
ALTER TABLE "public"."tickets" DROP COLUMN "key_number";
ALTER TABLE "public"."tickets" DROP COLUMN "priority_rank";
ALTER TABLE "public"."spec_features" DROP COLUMN "search";
ALTER TABLE "public"."spec_features" DROP COLUMN "spec_number";
