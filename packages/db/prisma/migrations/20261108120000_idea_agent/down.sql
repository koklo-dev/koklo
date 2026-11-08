-- Retour exact à 20261108090000_idea : les messages, propositions, verrous et calculs de manques de l'agent, puis les
-- quatre types, disparaissent (les pages et les projets survivent).
DROP TABLE "public"."idea_proposals";
DROP TABLE "public"."idea_messages";
DROP TABLE "public"."idea_ai_locks";
DROP TABLE "public"."idea_gap_runs";
DROP TYPE "public"."idea_proposal_status";
DROP TYPE "public"."idea_proposal_op";
DROP TYPE "public"."idea_message_mode";
DROP TYPE "public"."idea_message_author";
