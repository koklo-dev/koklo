import type { LlmProvider, LlmProviderId, QualifiedModelCatalog } from "@koklo/domain";

/**
 * Jetons Nest du moteur d'IA (TK-95), qui remplacent l'ancien registre de fournisseurs :
 *  - `AI_PROVIDER` : le moteur `AiProvider` (résolution usage -> fournisseur + modèle, secours, comptage,
 *    plafond). Les procédures ne connaissent que lui ;
 *  - `AI_ADAPTERS` : fabrique d'adaptateur par fournisseur (SDK, `fetch` global lu à chaque appel) ;
 *  - `AI_CATALOG` : modèles qualifiés.
 * Le faux du port n'est JAMAIS choisi par la configuration : seuls les tests surchargent `AI_ADAPTERS`
 * et `AI_CATALOG`, par `overrideProvider` (même règle que `GIT_PROVIDER`).
 */
export const AI_PROVIDER = Symbol("AI_PROVIDER");
export const AI_ADAPTERS = Symbol("AI_ADAPTERS");
export const AI_CATALOG = Symbol("AI_CATALOG");

export type AiAdapterFactory = (provider: LlmProviderId) => LlmProvider;
export type AiCatalog = QualifiedModelCatalog;
