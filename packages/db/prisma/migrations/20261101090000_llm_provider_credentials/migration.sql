-- TK-51a : identifiants BYOK chiffrés (AES-256-GCM, un par organisation et fournisseur). Additif : un enum, une table.
-- CreateEnum
CREATE TYPE "llm_provider" AS ENUM ('anthropic', 'openai', 'google');

-- CreateTable
CREATE TABLE "llm_provider_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" "llm_provider" NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "default_model" TEXT,
    "created_by_user_id" UUID,
    "last_used_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "llm_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_provider_credentials_organization_id_idx" ON "llm_provider_credentials"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_provider_credentials_organization_id_provider_key" ON "llm_provider_credentials"("organization_id", "provider");

-- AddForeignKey
ALTER TABLE "llm_provider_credentials" ADD CONSTRAINT "llm_provider_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK (hors Prisma) : nonce GCM de 12 octets, version de clé >= 1, chiffré = 1 à 2048 octets + tag de 16.
ALTER TABLE "llm_provider_credentials" ADD CONSTRAINT "llm_provider_credentials_nonce_check" CHECK (octet_length("nonce") = 12);
ALTER TABLE "llm_provider_credentials" ADD CONSTRAINT "llm_provider_credentials_key_version_check" CHECK ("key_version" >= 1);
ALTER TABLE "llm_provider_credentials" ADD CONSTRAINT "llm_provider_credentials_ciphertext_check" CHECK (octet_length("ciphertext") BETWEEN 17 AND 2064);
ALTER TABLE "llm_provider_credentials" ADD CONSTRAINT "llm_provider_credentials_default_model_check" CHECK ("default_model" IS NULL OR (char_length("default_model") BETWEEN 1 AND 100 AND position('/' IN "default_model") = 0 AND position('..' IN "default_model") = 0));
