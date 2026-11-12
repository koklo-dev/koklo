-- TK-104 (B349, B352) : « Annuler » une décision et relance du client. Additif : une valeur d'enum, un type de notification.
-- `ADD VALUE` ne peut pas être suivi d'un usage de la valeur dans la même transaction : aucune ligne n'est écrite ici.
ALTER TYPE "review_status" ADD VALUE 'withdrawn';

-- Notifications : nouveau type `review.reminded` (le CHECK est refait en entier).
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('suggestion.created', 'suggestion.decided', 'review.submitted', 'baseline.proposed', 'baseline.validated', 'baseline.tagged', 'ticket.blocked', 'proposal.ready', 'review.reminded'));
