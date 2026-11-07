-- TK-95 (lot C) : couche AiProvider. Enum llm_provider élargi, adresse de base des points d'accès compatibles,
-- réglages d'IA par organisation, modèle par usage, consommation mensuelle par fournisseur. Migration de données :
-- la clé Anthropic existante devient Principal et ses 4 usages pointent sur Anthropic (A4).
-- Les nouvelles valeurs d'enum ne sont pas utilisées dans cette migration (une valeur ajoutée n'est utilisable
-- qu'après validation de la transaction) : les CHECK passent par `provider::text`.

-- CreateEnum
CREATE TYPE "ai_usage" AS ENUM ('idea_space', 'spec_deliverables', 'baseline_summary', 'ticket_breakdown');

-- AlterEnum
ALTER TYPE "llm_provider" ADD VALUE 'mistral';
ALTER TYPE "llm_provider" ADD VALUE 'openrouter';
ALTER TYPE "llm_provider" ADD VALUE 'openai_compatible';

-- AlterTable
ALTER TABLE "llm_provider_credentials" ADD COLUMN     "base_url" TEXT;

-- CreateTable
CREATE TABLE "ai_organization_settings" (
    "organization_id" UUID NOT NULL,
    "primary_provider" "llm_provider",
    "fallback_provider" "llm_provider",
    "fallback_enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthly_cap_micro_usd" BIGINT,
    "cap_warned_month" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_organization_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "ai_usage_models" (
    "organization_id" UUID NOT NULL,
    "usage" "ai_usage" NOT NULL,
    "provider" "llm_provider" NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_usage_models_pkey" PRIMARY KEY ("organization_id","usage")
);

-- CreateTable
CREATE TABLE "ai_usage_monthly" (
    "organization_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "provider" "llm_provider" NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_micro_usd" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_usage_monthly_pkey" PRIMARY KEY ("organization_id","month","provider")
);

-- AddForeignKey
ALTER TABLE "ai_organization_settings" ADD CONSTRAINT "ai_organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_organization_settings" ADD CONSTRAINT "ai_organization_settings_organization_id_primary_provider_fkey" FOREIGN KEY ("organization_id", "primary_provider") REFERENCES "llm_provider_credentials"("organization_id", "provider") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_organization_settings" ADD CONSTRAINT "ai_organization_settings_organization_id_fallback_provider_fkey" FOREIGN KEY ("organization_id", "fallback_provider") REFERENCES "llm_provider_credentials"("organization_id", "provider") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_models" ADD CONSTRAINT "ai_usage_models_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_models" ADD CONSTRAINT "ai_usage_models_organization_id_provider_fkey" FOREIGN KEY ("organization_id", "provider") REFERENCES "llm_provider_credentials"("organization_id", "provider") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK (hors Prisma) : l'adresse de base existe si et seulement si le fournisseur est « compatible » ; https, 9 à 2048 caractères.
ALTER TABLE "llm_provider_credentials" ADD CONSTRAINT "llm_provider_credentials_base_url_check" CHECK (("provider"::text = 'openai_compatible') = ("base_url" IS NOT NULL) AND ("base_url" IS NULL OR (char_length("base_url") BETWEEN 9 AND 2048 AND "base_url" LIKE 'https://%')));

-- CHECK (hors Prisma) : principal et secours différents ; plafond strictement positif (nul = pas de plafond) ; alerte datée du premier du mois.
ALTER TABLE "ai_organization_settings" ADD CONSTRAINT "ai_organization_settings_providers_check" CHECK ("primary_provider" IS NULL OR "fallback_provider" IS NULL OR "primary_provider" <> "fallback_provider");
ALTER TABLE "ai_organization_settings" ADD CONSTRAINT "ai_organization_settings_cap_check" CHECK ("monthly_cap_micro_usd" IS NULL OR "monthly_cap_micro_usd" > 0);
ALTER TABLE "ai_organization_settings" ADD CONSTRAINT "ai_organization_settings_warned_month_check" CHECK ("cap_warned_month" IS NULL OR EXTRACT(DAY FROM "cap_warned_month") = 1);

-- CHECK (hors Prisma) : même règle que `default_model`.
ALTER TABLE "ai_usage_models" ADD CONSTRAINT "ai_usage_models_model_check" CHECK (char_length("model") BETWEEN 1 AND 100 AND position('/' IN "model") = 0 AND position('..' IN "model") = 0);

-- CHECK (hors Prisma) : compteurs jamais négatifs, mois = premier jour (UTC). Aucune colonne générée.
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_month_check" CHECK (EXTRACT(DAY FROM "month") = 1);
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_calls_check" CHECK ("calls" >= 0);
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_input_tokens_check" CHECK ("input_tokens" >= 0);
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_output_tokens_check" CHECK ("output_tokens" >= 0);
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_cost_micro_usd_check" CHECK ("cost_micro_usd" >= 0);

-- Données : la clé Anthropic existante devient Principal ; les 4 usages pointent sur Anthropic, avec le modèle
-- par défaut de la clé s'il existe, sinon Sonnet (A4). Une organisation sans clé Anthropic n'a aucune ligne.
INSERT INTO "ai_organization_settings" ("organization_id", "primary_provider", "created_at", "updated_at")
SELECT "organization_id", 'anthropic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "llm_provider_credentials"
WHERE "provider" = 'anthropic';

INSERT INTO "ai_usage_models" ("organization_id", "usage", "provider", "model", "created_at", "updated_at")
SELECT c."organization_id", u."usage", 'anthropic', COALESCE(c."default_model", 'claude-sonnet-5-5'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "llm_provider_credentials" c
CROSS JOIN (VALUES ('idea_space'::"ai_usage"), ('spec_deliverables'::"ai_usage"), ('baseline_summary'::"ai_usage"), ('ticket_breakdown'::"ai_usage")) AS u("usage")
WHERE c."provider" = 'anthropic';
