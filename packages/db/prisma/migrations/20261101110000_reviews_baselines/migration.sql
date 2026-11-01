-- TK-51c : reviews client (journal immuable) et baselines. Additif : trois enums, deux tables, une fonction, deux triggers.
-- CreateEnum
CREATE TYPE "review_target_kind" AS ENUM ('feature', 'screen', 'baseline');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('approved', 'changes_requested');

-- CreateEnum
CREATE TYPE "baseline_status" AS ENUM ('proposed', 'validated', 'tagged');

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "repo_id" UUID NOT NULL,
    "target_kind" "review_target_kind" NOT NULL,
    "target_ref" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "status" "review_status" NOT NULL,
    "author_user_id" UUID NOT NULL,
    "author_role" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baselines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "repo_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "baseline_status" NOT NULL DEFAULT 'proposed',
    "proposed_sha" TEXT NOT NULL,
    "proposed_by_user_id" UUID,
    "review_id" UUID,
    "validated_at" TIMESTAMPTZ(3),
    "tag_sha" TEXT,
    "tagged_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_organization_id_idx" ON "reviews"("organization_id");

-- CreateIndex
CREATE INDEX "reviews_project_id_target_kind_target_ref_created_at_idx" ON "reviews"("project_id", "target_kind", "target_ref", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_organization_id_id_key" ON "reviews"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_organization_id_project_id_id_key" ON "reviews"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "baselines_organization_id_idx" ON "baselines"("organization_id");

-- CreateIndex
CREATE INDEX "baselines_organization_id_project_id_review_id_idx" ON "baselines"("organization_id", "project_id", "review_id");

-- CreateIndex
CREATE UNIQUE INDEX "baselines_project_id_number_key" ON "baselines"("project_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "baselines_organization_id_id_key" ON "baselines"("organization_id", "id");

-- Au plus une baseline non taguée par projet.
CREATE UNIQUE INDEX "baselines_one_untagged_per_project_key" ON "baselines"("project_id") WHERE "status" <> 'tagged';

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_repo_id_fkey" FOREIGN KEY ("organization_id", "repo_id") REFERENCES "project_repos"("organization_id", "id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_organization_id_repo_id_fkey" FOREIGN KEY ("organization_id", "repo_id") REFERENCES "project_repos"("organization_id", "id") ON DELETE CASCADE;

-- AddForeignKey (NO ACTION : une review référencée par une baseline ne peut pas disparaître seule)
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_organization_id_project_id_review_id_fkey" FOREIGN KEY ("organization_id", "project_id", "review_id") REFERENCES "reviews"("organization_id", "project_id", "id");

-- CHECK (hors Prisma) : formats SHA, cible, longueurs, états d'une baseline.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_sha_check" CHECK ("sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_ref_length_check" CHECK (char_length("target_ref") BETWEEN 1 AND 64);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_feature_ref_check" CHECK ("target_kind" <> 'feature' OR "target_ref" ~ '^F-[0-9]{3,}$');
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_baseline_ref_check" CHECK ("target_kind" <> 'baseline' OR "target_ref" ~ '^baseline-(0|[1-9][0-9]*)$');
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_comment_check" CHECK ("comment" IS NULL OR char_length("comment") <= 2000);
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_number_check" CHECK ("number" >= 0);
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_proposed_sha_check" CHECK ("proposed_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_tag_sha_check" CHECK ("tag_sha" IS NULL OR "tag_sha" ~ '^([0-9a-f]{40}|[0-9a-f]{64})$');
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_status_fields_check" CHECK (
  ("status" = 'proposed' AND "review_id" IS NULL AND "validated_at" IS NULL AND "tag_sha" IS NULL AND "tagged_at" IS NULL)
  OR ("status" = 'validated' AND "review_id" IS NOT NULL AND "validated_at" IS NOT NULL AND "tag_sha" IS NULL AND "tagged_at" IS NULL)
  OR ("status" = 'tagged' AND "review_id" IS NOT NULL AND "validated_at" IS NOT NULL AND "tag_sha" IS NOT NULL AND "tagged_at" IS NOT NULL)
);

-- reviews immuable : aucun UPDATE, aucun TRUNCATE, aucun DELETE direct.
-- Seule exception : la suppression en cascade (le projet ou le repo de la ligne a déjà disparu).
CREATE FUNCTION "reviews_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND (NOT EXISTS (SELECT 1 FROM "projects" WHERE "id" = OLD."project_id")
          OR NOT EXISTS (SELECT 1 FROM "project_repos" WHERE "id" = OLD."repo_id")) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reviews is append-only (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "reviews_no_update_delete"
  BEFORE UPDATE OR DELETE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION "reviews_immutable"();

CREATE TRIGGER "reviews_no_truncate"
  BEFORE TRUNCATE ON "reviews"
  FOR EACH STATEMENT EXECUTE FUNCTION "reviews_immutable"();
