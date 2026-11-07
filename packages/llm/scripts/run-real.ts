/**
 * Point d'entrée de `pnpm --filter @koklo/llm test:real` : qualifie un vrai modèle sur les quatre
 * usages. Refuse de démarrer tant qu'une variable `KOKLO_LLM_REAL_*` manque (jamais « sauté = vert »).
 * Appelle le vrai fournisseur et coûte quelques centimes : jamais lancé en CI. N'imprime que le
 * verdict (ni clé, ni sortie du modèle).
 */
import { AI_USAGES, llmCredential } from "@koklo/domain";
import { createSdkProvider, type QualificationContracts, runQualification } from "../src/index.ts";
import { missingRealEnv, realConfigOf } from "./real-env.ts";

const isObject = (value: unknown): boolean => typeof value === "object" && value !== null;

// Contrat minimal (un objet JSON) : le câblage des schémas Zod de chaque usage est fait par l'API.
const CONTRACTS = Object.fromEntries(
  AI_USAGES.map((usage) => [usage, { jsonSchema: { type: "object" }, accepts: isObject }]),
) as unknown as QualificationContracts;

const main = async (): Promise<number> => {
  const missing = missingRealEnv(process.env);
  if (missing.length > 0) {
    process.stderr.write(
      `test:real refusé : variables d'environnement manquantes ou invalides :\n${missing.map((name) => `  - ${name}`).join("\n")}\n` +
        "Voir docs/quality-and-operations.md (qualification manuelle des modèles).\n",
    );
    return 1;
  }
  const config = realConfigOf(process.env);
  const report = await runQualification({
    provider: createSdkProvider(config.provider),
    providerId: config.provider,
    model: config.model,
    credential: llmCredential(config.key),
    ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
    contracts: CONTRACTS,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return AI_USAGES.every((usage) => report.usages[usage].qualified) ? 0 : 2;
};

process.exitCode = await main();
