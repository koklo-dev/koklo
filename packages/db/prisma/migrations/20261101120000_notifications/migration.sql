-- TK-51d : notifications in-app. Additif : une table, sans enum, sans fonction, sans trigger.
-- Aucune charge utile : l'API relit l'objet via (subject_kind, subject_ref) avec les droits du destinataire.
-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "project_id" UUID,
    "subject_kind" TEXT NOT NULL,
    "subject_ref" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organization_id_idx" ON "notifications"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_user_id_dedupe_key_key" ON "notifications"("recipient_user_id", "dedupe_key");

-- Index partiel (hors Prisma) : liste des non lues d'un destinataire, la plus récente d'abord.
CREATE INDEX "notifications_unread_idx" ON "notifications"("recipient_user_id", "created_at" DESC) WHERE "read_at" IS NULL;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_recipient_user_id_fkey" FOREIGN KEY ("organization_id", "recipient_user_id") REFERENCES "members"("organization_id", "user_id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE CASCADE;

-- CHECK (hors Prisma) : listes fermées (D7, texte contraint) et longueurs.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('suggestion.created', 'suggestion.decided', 'review.submitted', 'baseline.proposed', 'baseline.validated', 'baseline.tagged', 'ticket.blocked'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_kind_check" CHECK ("subject_kind" IN ('suggestion', 'review', 'baseline', 'ticket'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_ref_length_check" CHECK (char_length("subject_ref") BETWEEN 1 AND 64);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dedupe_key_length_check" CHECK (char_length("dedupe_key") BETWEEN 1 AND 120);
