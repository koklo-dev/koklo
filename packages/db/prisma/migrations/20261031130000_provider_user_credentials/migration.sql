-- TK-48a1 : jetons utilisateur chiffrés (AES-256-GCM, ADR 0009). Additif : une table.
-- CreateTable
CREATE TABLE "provider_user_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "refresh_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_user_credentials_organization_id_idx" ON "provider_user_credentials"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_user_credentials_user_id_installation_id_key" ON "provider_user_credentials"("user_id", "installation_id");

-- AddForeignKey
ALTER TABLE "provider_user_credentials" ADD CONSTRAINT "provider_user_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_user_credentials" ADD CONSTRAINT "provider_user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_user_credentials" ADD CONSTRAINT "provider_user_credentials_organization_id_installation_id_fkey" FOREIGN KEY ("organization_id", "installation_id") REFERENCES "provider_installations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK (hors Prisma) : nonce GCM de 12 octets, version de clé >= 1, chiffré = au moins 1 octet + tag de 16.
ALTER TABLE "provider_user_credentials" ADD CONSTRAINT "provider_user_credentials_nonce_check" CHECK (octet_length("nonce") = 12);
ALTER TABLE "provider_user_credentials" ADD CONSTRAINT "provider_user_credentials_key_version_check" CHECK ("key_version" >= 1);
ALTER TABLE "provider_user_credentials" ADD CONSTRAINT "provider_user_credentials_ciphertext_check" CHECK (octet_length("ciphertext") > 16);
