-- TK-91 (lot A) : versions figées de l'idée (`idea-vN`) et Synthèse. Additif : deux tables. Les CHECK sont hors Prisma :
-- `migrate diff` les ignore.
-- CreateTable
CREATE TABLE "idea_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    "batch_id" UUID,
    "commit_sha" TEXT,
    "pages_versions" JSONB NOT NULL,
    "frozen_by" UUID,
    "frozen_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_synthesis" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "content_md" TEXT NOT NULL,
    "source" TEXT,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_synthesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idea_versions_organization_id_idx" ON "idea_versions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_versions_project_id_number_key" ON "idea_versions"("project_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "idea_versions_project_id_batch_id_key" ON "idea_versions"("project_id", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_synthesis_project_id_key" ON "idea_synthesis"("project_id");

-- CreateIndex
CREATE INDEX "idea_synthesis_organization_id_idx" ON "idea_synthesis"("organization_id");

-- AddForeignKey
ALTER TABLE "idea_versions" ADD CONSTRAINT "idea_versions_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_synthesis" ADD CONSTRAINT "idea_synthesis_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CHECK (hors Prisma) : numéro de 1 à 9999, étiquette `idea-v<numéro>` cohérente, empreinte de pages en objet JSON ;
-- Synthèse : 1 à 50 000 caractères, source vide ou `idea-v<numéro>`.
ALTER TABLE "idea_versions" ADD CONSTRAINT "idea_versions_number_check" CHECK ("number" BETWEEN 1 AND 9999);
ALTER TABLE "idea_versions" ADD CONSTRAINT "idea_versions_tag_check" CHECK ("tag" = 'idea-v' || "number"::text);
ALTER TABLE "idea_versions" ADD CONSTRAINT "idea_versions_pages_versions_check" CHECK (jsonb_typeof("pages_versions") = 'object');
ALTER TABLE "idea_synthesis" ADD CONSTRAINT "idea_synthesis_content_md_check" CHECK (char_length("content_md") BETWEEN 1 AND 50000);
ALTER TABLE "idea_synthesis" ADD CONSTRAINT "idea_synthesis_source_check" CHECK ("source" IS NULL OR "source" ~ '^idea-v[1-9][0-9]{0,3}$');
