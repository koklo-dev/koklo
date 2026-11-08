-- TK-90 (lot A) : agent de l'espace Idée. Additif : quatre types, quatre tables (messages, propositions, verrou d'appel
-- d'IA, dernier calcul des manques). Les CHECK sont hors Prisma : `migrate diff` les ignore.
-- CreateEnum
CREATE TYPE "idea_proposal_op" AS ENUM ('insert_after', 'replace', 'append', 'create_page');

-- CreateEnum
CREATE TYPE "idea_proposal_status" AS ENUM ('pending', 'accepted', 'rejected', 'stale');

-- CreateEnum
CREATE TYPE "idea_message_mode" AS ENUM ('interview', 'free');

-- CreateEnum
CREATE TYPE "idea_message_author" AS ENUM ('human', 'agent');

-- CreateTable
CREATE TABLE "idea_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "page_id" UUID,
    "author_user_id" UUID,
    "author" "idea_message_author" NOT NULL,
    "mode" "idea_message_mode" NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_proposals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "page_id" UUID,
    "message_id" UUID NOT NULL,
    "op" "idea_proposal_op" NOT NULL,
    "anchor_block_index" INTEGER,
    "range_end" INTEGER,
    "title" TEXT,
    "after_page_id" UUID,
    "content_md" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "base_version" INTEGER,
    "status" "idea_proposal_status" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "previous_content_md" TEXT,
    "result_version" INTEGER,
    "created_page_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_ai_locks" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_ai_locks_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "idea_gap_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_gap_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idea_messages_organization_id_idx" ON "idea_messages"("organization_id");

-- CreateIndex
CREATE INDEX "idea_messages_project_id_created_at_idx" ON "idea_messages"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idea_messages_organization_id_id_key" ON "idea_messages"("organization_id", "id");

-- CreateIndex
CREATE INDEX "idea_proposals_organization_id_idx" ON "idea_proposals"("organization_id");

-- CreateIndex
CREATE INDEX "idea_proposals_project_id_status_idx" ON "idea_proposals"("project_id", "status");

-- CreateIndex
CREATE INDEX "idea_proposals_project_id_created_at_idx" ON "idea_proposals"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "idea_ai_locks_organization_id_idx" ON "idea_ai_locks"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_gap_runs_project_id_key" ON "idea_gap_runs"("project_id");

-- CreateIndex
CREATE INDEX "idea_gap_runs_organization_id_idx" ON "idea_gap_runs"("organization_id");

-- AddForeignKey
ALTER TABLE "idea_messages" ADD CONSTRAINT "idea_messages_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_organization_id_message_id_fkey" FOREIGN KEY ("organization_id", "message_id") REFERENCES "idea_messages"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_ai_locks" ADD CONSTRAINT "idea_ai_locks_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_gap_runs" ADD CONSTRAINT "idea_gap_runs_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CHECK (hors Prisma) : bornes du texte, de la justification et du contenu ; cohérence de l'opération avec ses colonnes ;
-- un message d'agent n'a pas d'auteur, un message humain en a un.
ALTER TABLE "idea_messages" ADD CONSTRAINT "idea_messages_text_check" CHECK (char_length("text") BETWEEN 1 AND 4000);
ALTER TABLE "idea_messages" ADD CONSTRAINT "idea_messages_author_check" CHECK (("author" = 'agent') = ("author_user_id" IS NULL));
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_content_md_check" CHECK (char_length("content_md") <= 50000);
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_rationale_check" CHECK (char_length("rationale") BETWEEN 1 AND 200);
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_title_check" CHECK ("title" IS NULL OR char_length("title") BETWEEN 1 AND 120);
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_base_version_check" CHECK ("base_version" IS NULL OR "base_version" >= 1);
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_anchor_check" CHECK ("anchor_block_index" IS NULL OR "anchor_block_index" >= 0);
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_range_check" CHECK ("range_end" IS NULL OR ("anchor_block_index" IS NOT NULL AND "range_end" >= "anchor_block_index"));
ALTER TABLE "idea_proposals" ADD CONSTRAINT "idea_proposals_op_check" CHECK (
    CASE "op"
        WHEN 'create_page' THEN "page_id" IS NULL AND "base_version" IS NULL AND "title" IS NOT NULL AND "anchor_block_index" IS NULL
        WHEN 'append' THEN "page_id" IS NOT NULL AND "base_version" IS NOT NULL AND "anchor_block_index" IS NULL
        ELSE "page_id" IS NOT NULL AND "base_version" IS NOT NULL AND "anchor_block_index" IS NOT NULL
    END
);
ALTER TABLE "idea_gap_runs" ADD CONSTRAINT "idea_gap_runs_items_check" CHECK (jsonb_typeof("items") = 'array');
