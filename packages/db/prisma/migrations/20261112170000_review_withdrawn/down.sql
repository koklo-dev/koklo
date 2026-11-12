-- Retour exact à 20261112150000_rule_counter. Les notifications `review.reminded` sont supprimées puis le CHECK retrouve sa liste.
-- PostgreSQL ne retire pas une valeur d'enum : les reviews `withdrawn` sont supprimées (le journal est en ajout seul, son
-- trigger est suspendu le temps de ce retour), puis `review_status` est recréé sans `withdrawn`.
DELETE FROM "public"."notifications" WHERE "type" = 'review.reminded';
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('suggestion.created', 'suggestion.decided', 'review.submitted', 'baseline.proposed', 'baseline.validated', 'baseline.tagged', 'ticket.blocked', 'proposal.ready'));

ALTER TABLE "public"."reviews" DISABLE TRIGGER "reviews_no_update_delete";
DELETE FROM "public"."reviews" WHERE "status"::text = 'withdrawn';
ALTER TABLE "public"."reviews" ENABLE TRIGGER "reviews_no_update_delete";

ALTER TYPE "public"."review_status" RENAME TO "review_status_old";
CREATE TYPE "public"."review_status" AS ENUM ('approved', 'changes_requested');
ALTER TABLE "public"."reviews" ALTER COLUMN "status" TYPE "public"."review_status" USING "status"::text::"public"."review_status";
DROP TYPE "public"."review_status_old";
