-- Retour exact à 20261101120000_notifications. Les notifications sont conservées ; l'état d'envoi se perd.
DROP INDEX "public"."notifications_email_pending_idx";
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_emailed_at_check";
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_email_state_check";
ALTER TABLE "public"."notifications" DROP COLUMN "emailed_at";
ALTER TABLE "public"."notifications" DROP COLUMN "email_state";
