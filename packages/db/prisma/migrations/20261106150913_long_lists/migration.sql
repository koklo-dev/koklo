-- TK-94 : listes longues (passation 07 §3). Additif : cinq colonnes générées, cinq index.
-- Aucune table, aucune donnée touchée : les colonnes sont calculées par Postgres pour les lignes
-- existantes comme pour les nouvelles. Générée par `prisma migrate dev --create-only`, puis les
-- colonnes `DEFAULT` que Prisma déduit du schéma sont remplacées par `GENERATED ALWAYS ... STORED`
-- (un DEFAULT ne suit pas les mises à jour de la ligne) et les deux index partiels sont ajoutés.

-- AlterTable : `spec_number` trie F-999 avant F-1000 ; `search` couvre l'identifiant et le titre.
-- Le tiret est remplacé par une espace : le tiret collé à un nombre est lu comme un signe moins
-- (« F-187 » donnerait « -187 »), l'identifiant ne serait alors plus cherchable.
ALTER TABLE "spec_features" ADD COLUMN     "spec_number" INTEGER GENERATED ALWAYS AS ((SUBSTRING("spec_id" FROM 3))::integer) STORED,
ADD COLUMN     "search" tsvector GENERATED ALWAYS AS (to_tsvector('french'::regconfig, replace("spec_id", '-', ' ') || ' ' || "title")) STORED;

-- AlterTable : `priority_rank` (critical 0 ... low 3) et `key_number` (numéro de la clé : TK-10 après
-- TK-9) portent l'ordre par défaut des tickets, priorité décroissante puis clé (B42) ; `search` couvre
-- la clé, le titre et la description.
ALTER TABLE "tickets" ADD COLUMN     "priority_rank" INTEGER GENERATED ALWAYS AS (CASE "priority" WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END) STORED,
ADD COLUMN     "key_number" INTEGER GENERATED ALWAYS AS (COALESCE((SUBSTRING("key" FROM '[0-9]+$'))::integer, 0)) STORED,
ADD COLUMN     "search" tsvector GENERATED ALWAYS AS (to_tsvector('french'::regconfig, replace("key", '-', ' ') || ' ' || "title" || ' ' || "description")) STORED;

-- CreateIndex : tri numérique des fonctionnalités, `(snapshot_id, tri, id)`.
CREATE INDEX "spec_features_snapshot_id_spec_number_id_idx" ON "spec_features"("snapshot_id", "spec_number", "id");

-- CreateIndex : recherche plein texte.
CREATE INDEX "spec_features_search_idx" ON "spec_features" USING GIN ("search");

-- CreateIndex
CREATE INDEX "tickets_search_idx" ON "tickets" USING GIN ("search");

-- Index partiels (hors Prisma) : tickets non supprimés, ordre par défaut de la liste
-- `(project_id, priority_rank, key_number, id)` et de la colonne du kanban avec `status` (B42).
CREATE INDEX "tickets_project_id_priority_rank_key_number_id_idx" ON "tickets"("project_id", "priority_rank", "key_number", "id") WHERE "deleted_at" IS NULL;
CREATE INDEX "tickets_project_id_status_priority_rank_key_number_id_idx" ON "tickets"("project_id", "status", "priority_rank", "key_number", "id") WHERE "deleted_at" IS NULL;
