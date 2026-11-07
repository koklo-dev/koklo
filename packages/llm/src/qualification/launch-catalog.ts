import { AI_USAGES, type QualifiedModel, type QualifiedModelCatalog } from "@koklo/domain";
import { ANTHROPIC_DEFAULT_MODEL } from "../anthropic/constants.ts";

/**
 * Catalogue qualifié au lancement (décision A4) : un seul modèle, Anthropic Sonnet, pour les quatre
 * usages. Toute autre entrée viendra d'une qualification réelle (`pnpm --filter @koklo/llm test:real`),
 * relevée par un humain : le code ne déclare jamais qualifié un modèle qu'il n'a pas vu passer.
 */
const LAUNCH_MODELS: readonly QualifiedModel[] = Object.freeze([
  Object.freeze({
    provider: "anthropic",
    model: ANTHROPIC_DEFAULT_MODEL,
    usages: Object.freeze([...AI_USAGES]),
    economy: false,
  }),
]);

export const launchCatalog = (): QualifiedModelCatalog => ({ list: () => LAUNCH_MODELS });
