-- TK-58a : état d'envoi de l'e-mail de notification. Additif : deux colonnes, deux CHECK, un index partiel.
-- Aucune table, aucune donnée touchée ; les lignes existantes passent 'pending' (la fenêtre de 24 h du
-- balayage évite tout envoi rétroactif).
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "email_state" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "emailed_at" TIMESTAMPTZ(3);

-- CHECK (hors Prisma) : liste fermée des états, et emailed_at posé si et seulement si l'état est 'sent'.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_email_state_check" CHECK ("email_state" IN ('pending', 'sent', 'skipped', 'failed'));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_emailed_at_check" CHECK (("email_state" = 'sent') = ("emailed_at" IS NOT NULL));

-- Index partiel (hors Prisma) : balayage des lignes à envoyer, la plus ancienne d'abord.
CREATE INDEX "notifications_email_pending_idx" ON "notifications"("created_at") WHERE "email_state" = 'pending';
