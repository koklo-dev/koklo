-- TK-114b lot A : bilan d'un lancement d'agent (B617, B618). Additif : colonnes avec valeur par défaut et CHECK, aucune
-- table, aucune ligne modifiée. Zones validées (12 au plus), compteurs de zones, motifs fermés comptés, appels de couverture
-- (30 au plus) et appels consécutifs sans trou comblé (une passe complète sans progrès arrête la couverture, d'un segment à
-- l'autre), segment enchaîné (8 au plus), couverture avant et après, passage de relais en cours, motif d'arrêt.
ALTER TABLE "agent_launches" ADD COLUMN "zones" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "zones_done" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "zones_discarded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discard_reasons" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "coverage_calls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "coverage_stalled" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "segment" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "coverage_before" JSONB,
ADD COLUMN "coverage_after" JSONB,
ADD COLUMN "handoff_at" TIMESTAMPTZ(3),
ADD COLUMN "stop_reason" TEXT;

ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_zones_check" CHECK (jsonb_typeof("zones") = 'array' AND jsonb_array_length("zones") <= 12);
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_zone_counts_check" CHECK ("zones_done" BETWEEN 0 AND 12 AND "zones_discarded" BETWEEN 0 AND 12);
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_coverage_calls_check" CHECK ("coverage_calls" BETWEEN 0 AND 30 AND "coverage_stalled" BETWEEN 0 AND 30);
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_segment_check" CHECK ("segment" BETWEEN 0 AND 8);
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_discard_reasons_check" CHECK (jsonb_typeof("discard_reasons") = 'object');
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_coverage_check" CHECK (("coverage_before" IS NULL OR jsonb_typeof("coverage_before") = 'object') AND ("coverage_after" IS NULL OR jsonb_typeof("coverage_after") = 'object'));
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_stop_reason_check" CHECK ("stop_reason" IS NULL OR "stop_reason" IN ('completed', 'cap', 'deadline', 'cancelled'));
