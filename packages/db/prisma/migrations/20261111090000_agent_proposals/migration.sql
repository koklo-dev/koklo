-- TK-99a (B314) : propositions et lancements d'agent. Additif : trois tables (lancements, propositions, journal des
-- décisions), sans enum, fonction ni trigger. Les listes fermées et les bornes sont des CHECK écrits à la main (Prisma
-- ne les modélise pas, `migrate diff` les ignore). Le verrou « un lancement actif par livrable et par projet » est un
-- index unique partiel écrit à la main ; sa violation (23505) est rendue par l'API en 409 PROPOSAL_IN_PROGRESS.
-- Les CHECK de `notifications` gagnent le type `proposal.ready` et le sujet `agent_launch` (notification de fin de
-- lancement, sans e-mail).

-- CreateTable
CREATE TABLE "agent_launches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "deliverable" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "instruction" TEXT,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "requested_by" UUID NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "base_version" INTEGER,
    "discarded_count" INTEGER NOT NULL DEFAULT 0,
    "proposed_count" INTEGER NOT NULL DEFAULT 0,
    "heartbeat_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_launches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_launches_deliverable_check" CHECK ("deliverable" IN ('functional', 'data', 'architecture', 'technical', 'security', 'design', 'quality')),
    CONSTRAINT "agent_launches_mode_check" CHECK ("mode" IN ('complete', 'criteria', 'update', 'all')),
    CONSTRAINT "agent_launches_status_check" CHECK ("status" IN ('queued', 'running', 'done', 'failed', 'canceled')),
    CONSTRAINT "agent_launches_instruction_check" CHECK ("instruction" IS NULL OR char_length("instruction") <= 500),
    CONSTRAINT "agent_launches_error_code_check" CHECK ("error_code" IS NULL OR ("status" = 'failed' AND "error_code" ~ '^[a-z][a-z0-9_]{0,63}$')),
    CONSTRAINT "agent_launches_sources_check" CHECK (jsonb_typeof("sources") = 'array'),
    CONSTRAINT "agent_launches_counts_check" CHECK ("discarded_count" >= 0 AND "proposed_count" >= 0),
    CONSTRAINT "agent_launches_base_version_check" CHECK ("base_version" IS NULL OR "base_version" >= 1)
);

-- CreateTable
CREATE TABLE "agent_proposals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "launch_id" UUID NOT NULL,
    "deliverable" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "applied_batch_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_proposals_deliverable_check" CHECK ("deliverable" IN ('functional', 'data', 'architecture', 'technical', 'security', 'design', 'quality')),
    CONSTRAINT "agent_proposals_kind_check" CHECK ("kind" IN ('feature', 'criteria', 'rule', 'role', 'flow')),
    CONSTRAINT "agent_proposals_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected')),
    CONSTRAINT "agent_proposals_zone_check" CHECK (char_length("zone") BETWEEN 1 AND 120),
    CONSTRAINT "agent_proposals_title_check" CHECK (char_length("title") BETWEEN 1 AND 200),
    CONSTRAINT "agent_proposals_rationale_check" CHECK (char_length("rationale") <= 500),
    CONSTRAINT "agent_proposals_position_check" CHECK ("position" >= 0),
    CONSTRAINT "agent_proposals_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "agent_proposals_applied_batch_check" CHECK ("applied_batch_id" IS NULL OR "status" = 'accepted')
);

-- CreateTable
CREATE TABLE "agent_proposal_decisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_by" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "agent_proposal_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_proposal_decisions_decision_check" CHECK ("decision" IN ('accept', 'reject', 'reset'))
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_launches_organization_id_id_key" ON "agent_launches"("organization_id", "id");

-- CreateIndex
CREATE INDEX "agent_launches_organization_id_project_id_deliverable_creat_idx" ON "agent_launches"("organization_id", "project_id", "deliverable", "created_at" DESC);

-- Verrou : un seul lancement actif par (projet, livrable). Index partiel, hors Prisma.
CREATE UNIQUE INDEX "agent_launches_one_active" ON "agent_launches"("project_id", "deliverable") WHERE "status" IN ('queued', 'running');

-- CreateIndex
CREATE UNIQUE INDEX "agent_proposals_organization_id_id_key" ON "agent_proposals"("organization_id", "id");

-- CreateIndex
CREATE INDEX "agent_proposals_organization_id_launch_id_position_id_idx" ON "agent_proposals"("organization_id", "launch_id", "position", "id");

-- CreateIndex
CREATE INDEX "agent_proposals_list_idx" ON "agent_proposals"("project_id", "deliverable", "status", "kind", "zone", "id");

-- CreateIndex
CREATE INDEX "agent_proposal_decisions_organization_id_proposal_id_decide_idx" ON "agent_proposal_decisions"("organization_id", "proposal_id", "decided_at");

-- AddForeignKey
ALTER TABLE "agent_launches" ADD CONSTRAINT "agent_launches_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_proposals" ADD CONSTRAINT "agent_proposals_organization_id_launch_id_fkey" FOREIGN KEY ("organization_id", "launch_id") REFERENCES "agent_launches"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_proposal_decisions" ADD CONSTRAINT "agent_proposal_decisions_organization_id_proposal_id_fkey" FOREIGN KEY ("organization_id", "proposal_id") REFERENCES "agent_proposals"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Notifications : nouveau type et nouveau sujet (le CHECK est refait en entier).
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('suggestion.created', 'suggestion.decided', 'review.submitted', 'baseline.proposed', 'baseline.validated', 'baseline.tagged', 'ticket.blocked', 'proposal.ready'));
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_subject_kind_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_kind_check" CHECK ("subject_kind" IN ('suggestion', 'review', 'baseline', 'ticket', 'agent_launch'));
