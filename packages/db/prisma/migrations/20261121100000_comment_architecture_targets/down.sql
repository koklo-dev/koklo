-- Retour exact à 20261114120000_architecture_launch_modes. PostgreSQL ne retire pas une valeur d'enum : les commentaires de
-- composant, de décision et de flux sont supprimés (ceux des tickets et des tables restent intacts), puis `comment_target_kind`
-- est recréé sans ces trois valeurs. L'index de lecture est reconstruit par le changement de type.
DELETE FROM "public"."ticket_comments" WHERE "target_kind"::text IN ('component', 'adr', 'archflow');
ALTER TYPE "public"."comment_target_kind" RENAME TO "comment_target_kind_old";
CREATE TYPE "public"."comment_target_kind" AS ENUM ('ticket', 'feature', 'screen', 'change_request', 'table');
ALTER TABLE "public"."ticket_comments" ALTER COLUMN "target_kind" TYPE "public"."comment_target_kind" USING "target_kind"::text::"public"."comment_target_kind";
DROP TYPE "public"."comment_target_kind_old";
