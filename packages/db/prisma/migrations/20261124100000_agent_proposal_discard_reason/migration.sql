-- TK-114g lot A (B697) : motif d'écart d'une proposition. Additif : colonne facultative et deux CHECK, aucune ligne modifiée,
-- aucune ligne de décision ni d'audit. `already_present` : création déjà présente dans la spec, état terminal d'une rejetée.
ALTER TABLE "agent_proposals" ADD COLUMN "discard_reason" TEXT;

ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_discard_reason_check" CHECK ("discard_reason" IN ('already_present'));
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_discard_reason_status_check" CHECK ("discard_reason" IS NULL OR "status" = 'rejected');
