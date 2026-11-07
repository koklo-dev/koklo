-- Retour exact à 20261107150000_project_visits : les deux tables et l'unicité ajoutée sur invitations disparaissent
-- (les invitations, membres et projets survivent).
DROP TABLE "public"."invitation_projects";
DROP TABLE "public"."notification_preferences";
DROP INDEX "public"."invitations_organization_id_id_key";
