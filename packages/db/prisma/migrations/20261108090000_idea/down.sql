-- Retour exact à 20261107170000_settings : les pages, publications, contributeurs et présences de l'espace Idée, puis les deux
-- enums, disparaissent (les projets et les membres survivent).
DROP TABLE "public"."idea_presence";
DROP TABLE "public"."idea_page_contributors";
DROP TABLE "public"."idea_publications";
DROP TABLE "public"."idea_pages";
DROP TYPE "public"."idea_page_status";
DROP TYPE "public"."idea_page_origin";
