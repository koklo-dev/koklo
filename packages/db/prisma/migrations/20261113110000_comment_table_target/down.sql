-- Retour exact à 20261113100000_proposal_data_kinds. PostgreSQL ne retire pas une valeur d'enum : les commentaires de table
-- sont supprimés (ceux des tickets restent intacts), l'index et la colonne `target_ref` partent, puis `comment_target_kind`
-- est recréé sans `table`.
DELETE FROM "public"."ticket_comments" WHERE "target_kind"::text = 'table';
DROP INDEX "public"."ticket_comments_target_kind_target_id_target_ref_idx";
ALTER TABLE "public"."ticket_comments" DROP COLUMN "target_ref";
ALTER TYPE "public"."comment_target_kind" RENAME TO "comment_target_kind_old";
CREATE TYPE "public"."comment_target_kind" AS ENUM ('ticket', 'feature', 'screen', 'change_request');
ALTER TABLE "public"."ticket_comments" ALTER COLUMN "target_kind" TYPE "public"."comment_target_kind" USING "target_kind"::text::"public"."comment_target_kind";
DROP TYPE "public"."comment_target_kind_old";
