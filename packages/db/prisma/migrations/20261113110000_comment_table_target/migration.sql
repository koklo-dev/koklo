-- TK-109 lot A (B444) : commentaires de table de données. Additif : nouvelle valeur d'enum `table`, colonne `target_ref`
-- (identifiant lisible `T-<slug>`, NULL pour les commentaires de ticket) et index de lecture. Aucune ligne modifiée.
ALTER TYPE "comment_target_kind" ADD VALUE 'table';
ALTER TABLE "ticket_comments" ADD COLUMN "target_ref" TEXT;
CREATE INDEX "ticket_comments_target_kind_target_id_target_ref_idx" ON "ticket_comments"("target_kind", "target_id", "target_ref");
