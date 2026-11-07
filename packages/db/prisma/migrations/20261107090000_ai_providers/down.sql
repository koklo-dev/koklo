-- Retour exact à 20261106150913_long_lists. Les clés des fournisseurs ajoutés (mistral, openrouter, openai_compatible)
-- sont supprimées : l'ancien enum ne peut pas les porter. Les trois tables d'IA partent avec leurs lignes.
DROP TABLE "public"."ai_usage_monthly";
DROP TABLE "public"."ai_usage_models";
DROP TABLE "public"."ai_organization_settings";
DROP TYPE "public"."ai_usage";

ALTER TABLE "public"."llm_provider_credentials" DROP CONSTRAINT "llm_provider_credentials_base_url_check";
DELETE FROM "public"."llm_provider_credentials" WHERE "provider"::text IN ('mistral', 'openrouter', 'openai_compatible');
ALTER TABLE "public"."llm_provider_credentials" DROP COLUMN "base_url";

CREATE TYPE "public"."llm_provider_previous" AS ENUM ('anthropic', 'openai', 'google');
ALTER TABLE "public"."llm_provider_credentials" ALTER COLUMN "provider" TYPE "public"."llm_provider_previous" USING "provider"::text::"public"."llm_provider_previous";
DROP TYPE "public"."llm_provider";
ALTER TYPE "public"."llm_provider_previous" RENAME TO "llm_provider";
