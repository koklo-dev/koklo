-- Retour exact à 20261127180000_threat_counter. PostgreSQL ne retire pas une valeur d'enum : les commentaires du résumé
-- sont supprimés (les autres restent intacts), puis `comment_target_kind` est recréé sans cette valeur. L'index de
-- lecture est reconstruit par le changement de type.
DELETE FROM "public"."ticket_comments" WHERE "target_kind"::text = 'security_summary';
ALTER TYPE "public"."comment_target_kind" RENAME TO "comment_target_kind_old";
CREATE TYPE "public"."comment_target_kind" AS ENUM ('ticket', 'feature', 'screen', 'change_request', 'table', 'component', 'adr', 'archflow', 'stack', 'environments', 'tech_section', 'operation', 'requirements');
ALTER TABLE "public"."ticket_comments" ALTER COLUMN "target_kind" TYPE "public"."comment_target_kind" USING "target_kind"::text::"public"."comment_target_kind";
DROP TYPE "public"."comment_target_kind_old";
