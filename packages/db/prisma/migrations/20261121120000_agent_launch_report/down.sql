-- Retour exact à 20261121100000_comment_architecture_targets : contraintes puis colonnes du bilan retirées ; les lancements
-- restent, sans leur bilan.
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_stop_reason_check";
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_coverage_check";
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_discard_reasons_check";
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_segment_check";
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_coverage_calls_check";
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_zone_counts_check";
ALTER TABLE "public"."agent_launches" DROP CONSTRAINT "agent_launches_zones_check";
ALTER TABLE "public"."agent_launches" DROP COLUMN "stop_reason",
DROP COLUMN "handoff_at",
DROP COLUMN "coverage_after",
DROP COLUMN "coverage_before",
DROP COLUMN "segment",
DROP COLUMN "coverage_stalled",
DROP COLUMN "coverage_calls",
DROP COLUMN "discard_reasons",
DROP COLUMN "zones_discarded",
DROP COLUMN "zones_done",
DROP COLUMN "zones";
