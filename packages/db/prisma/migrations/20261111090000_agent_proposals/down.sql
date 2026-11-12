-- Retour exact à 20261109120000_project_creations : les CHECK de notifications retrouvent leurs listes d'origine
-- (les lignes `proposal.ready` éventuelles sont retirées d'abord), puis les trois tables disparaissent.
DELETE FROM "public"."notifications" WHERE "type" = 'proposal.ready' OR "subject_kind" = 'agent_launch';
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('suggestion.created', 'suggestion.decided', 'review.submitted', 'baseline.proposed', 'baseline.validated', 'baseline.tagged', 'ticket.blocked'));
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_subject_kind_check";
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_subject_kind_check" CHECK ("subject_kind" IN ('suggestion', 'review', 'baseline', 'ticket'));
DROP TABLE "public"."agent_proposal_decisions";
DROP TABLE "public"."agent_proposals";
DROP TABLE "public"."agent_launches";
