-- TK-97 (B98, B101) : projets proposés à une invitation et préférences d'e-mail. Additif : deux tables, sans enum,
-- sans fonction, sans trigger, sans colonne générée. Le CHECK de `key` est la liste fermée de
-- `NOTIFICATION_PREFERENCE_KEYS` (contrat) ; Prisma ne sait pas l'exprimer, `migrate diff` l'ignore.
-- CreateTable
CREATE TABLE "invitation_projects" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitation_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_preferences_key_check" CHECK ("key" IN ('client_validation', 'pr_to_review', 'agent_silent', 'ai_budget', 'weekly_digest', 'deliverable_to_validate', 'feature_ready', 'comment_reply'))
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_organization_id_id_key" ON "invitations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "invitation_projects_organization_id_idx" ON "invitation_projects"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_projects_invitation_id_project_id_key" ON "invitation_projects"("invitation_id", "project_id");

-- CreateIndex
CREATE INDEX "notification_preferences_organization_id_idx" ON "notification_preferences"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_organization_id_key_key" ON "notification_preferences"("user_id", "organization_id", "key");

-- AddForeignKey
ALTER TABLE "invitation_projects" ADD CONSTRAINT "invitation_projects_organization_id_invitation_id_fkey" FOREIGN KEY ("organization_id", "invitation_id") REFERENCES "invitations"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invitation_projects" ADD CONSTRAINT "invitation_projects_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "members"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE NO ACTION;
