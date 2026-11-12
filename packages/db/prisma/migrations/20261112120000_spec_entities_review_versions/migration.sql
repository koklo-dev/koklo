-- TK-100 lot B (B11, B325 b, c) : index d'entités générique, hachage du contenu validé, marqueur de réindexation et
-- quatre nouvelles cibles de validation. Additif. Une valeur d'enum ajoutée ne peut pas servir dans la transaction qui
-- l'ajoute : aucun CHECK ni aucune ligne n'utilise ici `flow`, `rules`, `roles` ni `deliverable` (la cible est validée
-- par l'API). `reviews` et son trigger `reviews_immutable` ne sont pas touchés.

-- AlterEnum
ALTER TYPE "review_target_kind" ADD VALUE 'flow';
ALTER TYPE "review_target_kind" ADD VALUE 'rules';
ALTER TYPE "review_target_kind" ADD VALUE 'roles';
ALTER TYPE "review_target_kind" ADD VALUE 'deliverable';

-- AlterTable : nul = entités génériques pas encore écrites pour ce snapshot (la réconciliation le réindexe).
ALTER TABLE "spec_snapshots" ADD COLUMN "entities_indexed_at" TIMESTAMPTZ(3);

-- CreateTable : `search` couvre l'identifiant et le titre (le tiret devient une espace, comme `spec_features`).
CREATE TABLE "spec_entities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "spec_id" TEXT NOT NULL,
    "zone" TEXT,
    "path" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('french'::regconfig, replace("spec_id", '-', ' ') || ' ' || COALESCE("data" ->> 'titre', ''))) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spec_entities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "spec_entities_kind_check" CHECK ("kind" IN ('feature', 'rule', 'roles', 'flow', 'relations', 'table', 'endpoint', 'screen', 'test')),
    CONSTRAINT "spec_entities_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$')
);

-- CreateTable
CREATE TABLE "review_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_versions_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$')
);

-- CreateIndex
CREATE INDEX "spec_entities_organization_id_idx" ON "spec_entities"("organization_id");
CREATE INDEX "spec_entities_snapshot_id_kind_sort_id_idx" ON "spec_entities"("snapshot_id", "kind", "sort", "id");
CREATE INDEX "spec_entities_search_idx" ON "spec_entities" USING GIN ("search");
CREATE UNIQUE INDEX "spec_entities_organization_id_id_key" ON "spec_entities"("organization_id", "id");
CREATE UNIQUE INDEX "spec_entities_snapshot_id_kind_spec_id_key" ON "spec_entities"("snapshot_id", "kind", "spec_id");
CREATE INDEX "review_versions_organization_id_idx" ON "review_versions"("organization_id");
CREATE UNIQUE INDEX "review_versions_organization_id_id_key" ON "review_versions"("organization_id", "id");
CREATE UNIQUE INDEX "review_versions_organization_id_review_id_key" ON "review_versions"("organization_id", "review_id");

-- AddForeignKey
ALTER TABLE "spec_entities" ADD CONSTRAINT "spec_entities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spec_entities" ADD CONSTRAINT "spec_entities_organization_id_snapshot_id_fkey" FOREIGN KEY ("organization_id", "snapshot_id") REFERENCES "spec_snapshots"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_versions" ADD CONSTRAINT "review_versions_organization_id_review_id_fkey" FOREIGN KEY ("organization_id", "review_id") REFERENCES "reviews"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- review_versions en ajout seul, comme `reviews` : aucun UPDATE, aucun DELETE direct. Seule exception : la suppression en
-- cascade d'une review disparue avec son projet (la review n'existe déjà plus quand la cascade arrive ici).
CREATE FUNCTION "public"."review_versions_immutable"() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM "public"."reviews" WHERE "id" = OLD."review_id") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'review_versions is append-only (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "review_versions_no_update_delete"
  BEFORE UPDATE OR DELETE ON "review_versions"
  FOR EACH ROW EXECUTE FUNCTION "review_versions_immutable"();

CREATE TRIGGER "review_versions_no_truncate"
  BEFORE TRUNCATE ON "review_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION "review_versions_immutable"();
