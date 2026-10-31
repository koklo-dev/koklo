-- TK-48a1 : états d'autorisation OAuth (usage unique, 10 minutes au plus). Additif : une table.
-- CreateTable
CREATE TABLE "provider_auth_states" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "installation_id" UUID,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_auth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_auth_states_nonce_key" ON "provider_auth_states"("nonce");

-- CreateIndex
CREATE INDEX "provider_auth_states_organization_id_idx" ON "provider_auth_states"("organization_id");

-- CreateIndex
CREATE INDEX "provider_auth_states_expires_at_idx" ON "provider_auth_states"("expires_at");

-- AddForeignKey
ALTER TABLE "provider_auth_states" ADD CONSTRAINT "provider_auth_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_auth_states" ADD CONSTRAINT "provider_auth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_auth_states" ADD CONSTRAINT "provider_auth_states_organization_id_installation_id_fkey" FOREIGN KEY ("organization_id", "installation_id") REFERENCES "provider_installations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index partiel (hors Prisma) : états en attente d'un utilisateur, pour le plafond par utilisateur.
CREATE INDEX "provider_auth_states_pending_user_idx" ON "provider_auth_states"("user_id") WHERE "consumed_at" IS NULL;

-- Durée de vie : strictement positive, dix minutes au plus.
ALTER TABLE "provider_auth_states" ADD CONSTRAINT "provider_auth_states_ttl_check" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + interval '10 minutes');
