-- TK-89 (lot 2a) : espace Idée. Additif : deux enums, quatre tables (pages, publications, contributeurs, présence), puis les
-- 10 pages du gabarit « cadrage par défaut » (vides, jamais de contenu inventé) pour chaque projet existant. Les CHECK sont
-- hors Prisma : `migrate diff` les ignore.
-- CreateEnum
CREATE TYPE "idea_page_origin" AS ENUM ('template', 'user', 'agent');

-- CreateEnum
CREATE TYPE "idea_page_status" AS ENUM ('empty', 'draft', 'review', 'stable');

-- CreateTable
CREATE TABLE "idea_pages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "origin" "idea_page_origin" NOT NULL,
    "template_key" TEXT,
    "status" "idea_page_status" NOT NULL DEFAULT 'empty',
    "content_md" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_publications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "batch_id" UUID,
    "commit_sha" TEXT NOT NULL,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "pages_versions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_page_contributors" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_added_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_page_contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_presence" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "page_id" UUID,
    "seen_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idea_presence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idea_pages_organization_id_idx" ON "idea_pages"("organization_id");

-- CreateIndex
CREATE INDEX "idea_pages_project_id_deleted_at_position_idx" ON "idea_pages"("project_id", "deleted_at", "position");

-- CreateIndex
CREATE UNIQUE INDEX "idea_pages_project_id_slug_key" ON "idea_pages"("project_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "idea_pages_organization_id_id_key" ON "idea_pages"("organization_id", "id");

-- CreateIndex
CREATE INDEX "idea_publications_organization_id_idx" ON "idea_publications"("organization_id");

-- CreateIndex
CREATE INDEX "idea_publications_project_id_published_at_idx" ON "idea_publications"("project_id", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "idea_publications_project_id_batch_id_key" ON "idea_publications"("project_id", "batch_id");

-- CreateIndex
CREATE INDEX "idea_page_contributors_organization_id_idx" ON "idea_page_contributors"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_page_contributors_page_id_user_id_key" ON "idea_page_contributors"("page_id", "user_id");

-- CreateIndex
CREATE INDEX "idea_presence_organization_id_idx" ON "idea_presence"("organization_id");

-- CreateIndex
CREATE INDEX "idea_presence_project_id_seen_at_idx" ON "idea_presence"("project_id", "seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "idea_presence_project_id_user_id_key" ON "idea_presence"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "idea_pages" ADD CONSTRAINT "idea_pages_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_publications" ADD CONSTRAINT "idea_publications_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_page_contributors" ADD CONSTRAINT "idea_page_contributors_organization_id_page_id_fkey" FOREIGN KEY ("organization_id", "page_id") REFERENCES "idea_pages"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_page_contributors" ADD CONSTRAINT "idea_page_contributors_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "members"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_presence" ADD CONSTRAINT "idea_presence_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "idea_presence" ADD CONSTRAINT "idea_presence_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "members"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CHECK (hors Prisma) : bornes de la décision 3 et du contenu ; une page requise ne part jamais en corbeille.
ALTER TABLE "idea_pages" ADD CONSTRAINT "idea_pages_content_md_check" CHECK (char_length("content_md") <= 50000);
ALTER TABLE "idea_pages" ADD CONSTRAINT "idea_pages_required_not_deleted_check" CHECK (NOT ("required" AND "deleted_at" IS NOT NULL));
ALTER TABLE "idea_pages" ADD CONSTRAINT "idea_pages_position_check" CHECK ("position" >= 0);
ALTER TABLE "idea_pages" ADD CONSTRAINT "idea_pages_version_check" CHECK ("version" >= 1);
ALTER TABLE "idea_pages" ADD CONSTRAINT "idea_pages_title_check" CHECK (char_length("title") BETWEEN 1 AND 120);
ALTER TABLE "idea_pages" ADD CONSTRAINT "idea_pages_slug_check" CHECK ("slug" ~ '^[a-z0-9-]{1,40}$');
ALTER TABLE "idea_publications" ADD CONSTRAINT "idea_publications_commit_sha_check" CHECK ("commit_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
ALTER TABLE "idea_publications" ADD CONSTRAINT "idea_publications_pages_versions_check" CHECK (jsonb_typeof("pages_versions") = 'object');

-- Données : le gabarit « cadrage par défaut » (miroir de `apps/api/src/idea/idea-template.ts`, vérifié par un test) pour
-- chaque projet existant. Positions 0 à 9 ; Vision, Problème, Utilisateurs et Périmètre sont requises.
INSERT INTO "idea_pages" ("id", "organization_id", "project_id", "slug", "title", "position", "required", "origin", "template_key", "status", "content_md", "version", "created_at", "updated_at")
SELECT gen_random_uuid(), p."organization_id", p."id", t."slug", t."title", t."position", t."required", 'template', t."slug", 'empty', '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN (VALUES
    (0, 'vision', 'Vision', true),
    (1, 'probleme', 'Problème', true),
    (2, 'utilisateurs', 'Utilisateurs', true),
    (3, 'proposition-valeur', 'Proposition de valeur', false),
    (4, 'parcours', 'Parcours', false),
    (5, 'perimetre', 'Périmètre', true),
    (6, 'contraintes', 'Contraintes', false),
    (7, 'mesure', 'Mesure', false),
    (8, 'hypotheses-risques', 'Hypothèses et risques', false),
    (9, 'glossaire', 'Glossaire', false)
) AS t("position", "slug", "title", "required");
