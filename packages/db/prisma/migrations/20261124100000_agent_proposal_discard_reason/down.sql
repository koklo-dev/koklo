-- Retour exact à 20261121120000_agent_launch_report : contraintes puis colonne du motif retirées ; les propositions restent,
-- sans leur motif (une déjà présente reste rejetée).
ALTER TABLE "public"."agent_proposals" DROP CONSTRAINT "agent_proposals_discard_reason_status_check";
ALTER TABLE "public"."agent_proposals" DROP CONSTRAINT "agent_proposals_discard_reason_check";
ALTER TABLE "public"."agent_proposals" DROP COLUMN "discard_reason";
