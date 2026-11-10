-- Retour exact à 20261109090000_idea_versions : la table des créations puis la colonne UE disparaissent (les projets survivent).
DROP TABLE "public"."project_creations";
ALTER TABLE "public"."projects" DROP COLUMN "eu_only";
