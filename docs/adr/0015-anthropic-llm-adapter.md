---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-01
covers_commit: 97b505c
---
# 0015 — Adaptateurs LLM dans `@koklo/llm` : `fetch` direct (TK-54), puis Vercel AI SDK (TK-95)

- **Statut** : proposé (TK-54, sous-lot 54a ; ticket `safe` ; devient effectif à la fusion de la PR TK-54)
- **Date** : 2026-11-01
- **Décideurs** : tech-lead, developer (ticket TK-54, décisions D1 et D2 ; l'ADR 0011 renvoyait ce choix ici)

## Contexte
L'ADR 0011 a figé le port `LlmProvider`, la clé opaque `LlmCredential`, le budget obligatoire et les
erreurs typées, et laissé à TK-54 le choix de l'adaptateur Anthropic. Le critère d'acceptation de
TK-54 est : tests avec un modèle simulé, aucun appel réel en CI. L'adaptateur reçoit une clé BYOK
d'organisation (jamais une clé du serveur) et un prompt déjà cadré ; il ne doit ni fuir cette clé,
ni suivre une redirection, ni lire l'environnement du processus.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. `fetch` natif de Node 24 dans un paquet `@koklo/llm`, URL en constante, `redirect: "error"` | Zéro dépendance ; surface de supply chain nulle ; URL fixe (pas de SSRF) ; aucune lecture de `ANTHROPIC_*` ; erreurs et budget sous notre contrôle ; transport injectable donc testable sans réseau | Nous maintenons le format de requête et de réponse ; les évolutions de l'API (nouveaux arrêts, blocs, en-têtes) ne sont pas suivies automatiquement ; pas de retry ni de streaming fournis |
| B. SDK officiel `@anthropic-ai/sdk` (1.3.0) | Types et évolutions de l'API suivis par l'éditeur ; retries et gestion des erreurs fournis | Dépendance tierce de plus et son arbre transitif (supply chain) ; le client lit `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY` et `ANTHROPIC_AUTH_TOKEN` dans l'environnement et accepte une `baseURL` : contournement de la clé BYOK et risque de SSRF ; retries implicites qui contredisent « un `complete` = un appel » ; erreurs qui portent en-têtes et corps de réponse ; sa version d'API par défaut diffère de celle que nous figeons |
| C. Adaptateur dans `apps/api/src/llm/` | Un dossier de moins | Réutilisation impossible par le worker et la CLI sans dépendre de l'API ; la frontière du paquet ne garantit plus « domaine seul » |

## Décision
Option A, dans le nouveau paquet `packages/llm` (`@koklo/llm`, privé, ESM, tag turbo `llm` : n'a le droit
de dépendre que de `domain` et `config`).
- **Dépendances** : `@koklo/domain` seule. Aucun SDK Anthropic dans le dépôt (test de source).
- **Exports** : `.` (`AnthropicProvider`, constantes, table de prix) et `./testing`
  (`SimulatedAnthropicTransport`, `anthropicErrorBody`), le même patron que `@koklo/github/testing`.
- **Requête** : `POST https://api.anthropic.com/v1/messages`, URL en constante (`ANTHROPIC_MESSAGES_URL`),
  aucune option d'URL (toute option inconnue est ignorée), `redirect: "error"`. En-têtes exacts :
  `anthropic-version: 2023-06-01`, `content-type: application/json`, `x-api-key`. Corps :
  `model`, `max_tokens = budget.maxOutputTokens`, `system`, un seul message `user`, `temperature` si
  fournie, et `output_config: { format: { type: "json_schema", schema } }` pour une sortie JSON.
  Ni outils, ni flux, ni réflexion, ni métadonnée.
- **Ordre** : `assertLlmRequest` (instantané gelé) -> majorant de coût -> lecture de la clé
  (`revealLlmCredential`, au dernier moment) -> `AbortSignal.any([signal appelant, AbortSignal.timeout(timeoutMs)])`
  -> un seul `fetch` (`globalThis.fetch` lu à chaque appel, ou le transport injecté). Aucun retry.
- **Réponse** : lecture plafonnée à 1 048 576 octets (taille annoncée refusée sans lecture, flux interrompu
  au plafond, y compris pour les corps d'erreur). Blocs `text` concaténés ; tout autre bloc, un modèle
  servi hors `LLM_MODEL_PATTERN` ou une raison d'arrêt inconnue donnent `LlmProviderUnavailableError`.
  `refusal` donne `LlmRefusedError`. La sortie JSON est analysée puis rendue `Unvalidated` (échec :
  `LlmInvalidOutputError("shape")` sans texte) ; elle n'est jamais `Validated`.
- **Table de prix** (`ANTHROPIC_PRICES`, USD par million de tokens, relevée le 2026-10-06) : Fable 5.1 et 5
  10/50 ; Opus 5.5 4/20 ; Opus 5, 4.8, 4.7 et 4.6 5/25 ; Sonnet 5.5 et 5 2/10 ; Sonnet 4.6 3/15 ; Haiku 5.5
  0,50/2,50 (tarif au-delà de 100 000 tokens, le majorant suppose le pire cas) ; Haiku 4.5 1/5. Un modèle
  inconnu est facturé au **maximum composante par composante** de la table (lecture par `Object.hasOwn`).
  Majorant : `ceil(caractères du prompt x entrée + maxOutputTokens x sortie)` en micro-dollars (1 token
  <= 1 caractère) ; au-dessus de `budget.maxCostMicroUsd` : `LlmBudgetExceededError { limit: "cost" }` sans appel.
  Le pire tarif doit tenir sous le plafond de 100 000 µ$ de la suite de conformité.

### Mapping des erreurs
| Réponse Anthropic | Erreur du port |
|-------------------|----------------|
| 401, 403 | `LlmAuthError` |
| 402 ; 400 « credit balance is too low » | `LlmQuotaExceededError` |
| 429 (`retry-after` en secondes décimales, sinon 0 ; plafonné à 1 h par le domaine) | `LlmRateLimitedError` |
| 404 | `LlmModelNotFoundError` |
| 413 ; 400 « prompt is too long » | `LlmContextTooLongError` |
| 408 ; rejet `TimeoutError` du transport ; délai du budget | `LlmTimeoutError` |
| signal de l'appelant (même avec une raison `TimeoutError`) | `LlmAbortedError` |
| 5xx dont 529, réseau coupé, autre 400/409/422, 3xx, corps non JSON, transport qui lève | `LlmProviderUnavailableError` |
Toutes portent `{ operation: "complete", provider: "anthropic", status? }`, aucune `cause`, aucun en-tête,
corps ou message amont (le message d'un 400 ne sert qu'à reconnaître le crédit ou la longueur).

### Garde d'import du faux
Le code de production n'importe jamais `@koklo/domain/testing` ni `@koklo/llm/testing` : test de source
`packages/config/test/llm-testing-import-guard.test.ts` (détecteur `findForbiddenTestingImports`) et règle
Biome `noRestrictedImports` à la racine (désactivée pour `**/test/**`, `**/src/testing/**`, `*.test.ts`,
`e2e/**`, la règle des icônes restant active). `vitest.setup.ts` remplace `globalThis.fetch` par une
fonction qui lève : aucun appel réseau n'est possible en test.

## Conséquences
- Chaque évolution de l'API Anthropic qui nous concerne est une modification de ce paquet, revue comme telle.
- La suite de conformité passe de 11 à 16 cas (annulation en cours d'appel, un seul appel par `complete`,
  ni cause ni secret dans une propriété d'erreur, aucun secret dans les journaux, texte non validé) ; les
  cas facultatifs ne s'exercent que si le sujet fournit `hangNext` / `capturedLogs`.
- `assertLlmRequest` refuse un schéma JSON qui contient autre chose que du JSON (`Map`, `Set`, `Date`,
  instance de classe, `NaN`, `Infinity`, `undefined`, cycle) ; `FakeLlm.failing` lève une instance neuve
  par appel et gèle ses options.
- La table de prix est une donnée datée : à revalider à chaque changement de grille.

### Limites assumées
- **Formats d'API non vérifiés contre l'API réelle** (aucune vraie clé en CI) : `output_config.format`
  (type `json_schema`) et la liste des raisons d'arrêt sont confirmés par les types du SDK officiel
  TypeScript (documentation consultée via Context7) ; `anthropic-version: 2023-06-01` et `x-api-key`
  restent acceptés (le SDK documente que l'en-tête peut être forcé à cette valeur), mais ce même SDK envoie
  désormais une version plus récente et une authentification par `Authorization: Bearer`. Les formulations
  des 400 « solde de crédit » et « prompt trop long » sont **UNVERIFIED** (non trouvées dans la
  documentation consultée). Une conformité réelle, à lancer une fois hors CI avec une clé de test, lève
  ces réserves (NEEDS-HUMAN, voir `quality-and-operations.md`).
- **Prix à valider** : relevés dans le catalogue de la compétence `claude-api` (2026-10-06), pas contre la
  page tarifaire officielle. Un prix trop bas affaiblit le garde-fou de coût (NEEDS-HUMAN).
- Un modèle servi daté (`claude-sonnet-5-5-20261001`) demandé tel quel est inconnu de la table et facturé
  au pire tarif : prudent, mais peut refuser un budget serré.
- Pas de retry, de streaming ni d'outils (hors périmètre) ; un 400 non reconnu reste `unavailable` (D5 : pas
  de 12e erreur).
- La garde d'import ne voit pas un import relatif `./testing` interne à `domain` ou `llm` (couvert par les
  tests de pureté de ces paquets).
- Le non-embarquement du faux dans `dist/` d'api et worker est vérifié par `apps/api/test/ai-dist-isolation.test.ts` (54b, voir ci-dessous).

## Utilisation par l'API (sous-lot 54b)
- `apps/api/src/llm/llm.module.ts` place `AnthropicProvider` seul sous le jeton `LLM_PROVIDERS` ; aucun réglage
  ne désigne un fournisseur, le faux n'est mis là que par les tests (`overrideProvider`).
- Le module `ai` appelle le port dans un ordre figé par les tests : rôle, projet, clé, prompt (nonce neuf),
  sémaphore et quota, **ligne d'audit avant l'appel**, appel, `markUsed`, validation stricte de la sortie.
  Les propositions ne sont jamais persistées. Le contrat 0.9.0 expose `ai.*` et `llmCredential.verify`
  ([contrat d'API](../api-contract.md#ai-proposals-and-key-verification-tk-54b)).
- Un `401` du fournisseur invalide la clé par compare-and-swap sur sa révision (hex du nonce AES-GCM) : une clé
  remplacée pendant l'appel n'est pas invalidée. Toute exception inattendue de l'adaptateur devient
  `LLM_PROVIDER_ERROR{unavailable}`, journalisée par son seul nom, jamais envoyée à Sentry.
- La sortie du modèle est hostile par défaut : Zod strict, ni URL, ni balise HTML, ni image ou lien markdown,
  ni caractère de contrôle ou de direction, étapes sur une ligne, ordre Étant donné -> Quand -> Alors.
- À valider par l'humain : quotas, budgets et prix (D8), politique de contenu (D6), absence de persistance (D3, D4),
  RGPD (texte libre envoyé à un sous-traitant américain). L'ADR reste **proposé** jusqu'à la fusion de la PR TK-54.

## Preuves
`pnpm --filter @koklo/llm test` (188 tests, dont `runLlmConformance` sur l'adaptateur et les tests de
non-fuite, d'isolation et de pureté), `pnpm --filter @koklo/domain test`, `pnpm --filter @koklo/config test`.

## Complément TK-95 (lot A) : six fournisseurs par le Vercel AI SDK

> Ce complément **remplace** l'option A (« sans SDK ») pour l'adaptateur : le choix de TK-54 valait pour un
> seul fournisseur ; il y en a désormais six (passation 20), et maintenir six formats de requête, de flux
> et d'erreur à la main coûte plus cher que la surface de supply chain, que la garde ci-dessous borne.
> Les garanties de l'option A (clé BYOK jamais fuitée, pas de redirection, corps plafonné, aucun retry,
> aucune lecture d'environnement, erreurs typées sans message) sont **conservées** et testées contre
> chaque adaptateur.

### Dépendances (`skill dependency-selection`, 2026-11-07)
Versions exactes, résolues au registre, déclarées **dans `packages/llm` seul** :

| Paquet | Version | Rôle |
|---|---|---|
| `ai` | 7.0.163 | `generateText`, `streamText`, `Output.object` |
| `@ai-sdk/anthropic` | 4.0.97 | Anthropic |
| `@ai-sdk/openai` | 4.0.109 | OpenAI (API « chat completions », pas « responses ») |
| `@ai-sdk/google` | 4.0.112 | Google |
| `@ai-sdk/mistral` | 4.0.80 | Mistral |
| `@ai-sdk/openai-compatible` | 3.0.85 | point d'accès compatible (adresse saisie) |
| `@openrouter/ai-sdk-provider` | 3.1.0 | OpenRouter (intermédiaire) |

- Les dernières versions (`ai` 7.0.164, `@ai-sdk/anthropic` 4.0.98, `@ai-sdk/openai` 4.0.110, `@ai-sdk/google`
  4.0.113, `@ai-sdk/openai-compatible` 3.0.86) datent de moins de 24 h : la politique d'ancienneté de pnpm
  les refuse, aucune exception n'est ajoutée (question B51). Pas de pré-version.
- Documentation : types livrés des paquets installés (API v7 : `generateText` / `streamText` avec
  `Output.object({ schema: jsonSchema(...) })`, `maxRetries`, `abortSignal`, `fetch` des fabriques) et
  documentation Context7 de `vercel/ai`. `generateObject` n'est pas utilisé : la sortie structurée passe par
  `Output.object` avec `jsonSchema`, **sans validateur** (le port rend toujours `Unvalidated`, B45).
- Vulnérabilités : `pnpm audit --prod` ne signale rien sur ces paquets (deux avis modérés préexistants,
  `minimatch` via Sentry) ; OSV (`cve-mcp`) interrogé pour chaque paquet et version.
- Garde de source : `packages/config/test/ai-sdk-import-guard.test.ts` interdit toute dépendance et tout import
  de `ai`, `@ai-sdk/*`, `@openrouter/*`, `@anthropic-ai/*` hors `packages/llm` ; `package-purity.test.ts`
  impose exactement ces sept paquets plus `@koklo/domain`, en versions exactes.

### Ce qui change
- **Port** : `LlmProvider.stream(request)` rend des événements `text` puis un `end` (arrêt, jetons, fournisseur,
  modèle) ; mêmes gardes que `complete` ; sortie JSON refusée en flux. Six identifiants, quatre usages
  (`idea_space`, `spec_deliverables`, `baseline_summary`, `ticket_breakdown`), traits des fournisseurs
  (`intermediary`, `euEligible`, `baseUrlRequired`), types et ports de l'`AiProvider` (domaine pur).
- **`src/common`** : `fetch` donné au SDK (`redirect: "error"`, corps plafonné à 1 048 576 o, taille annoncée
  refusée sans lecture, flux coupé au plafond, succès comme erreur), correspondance statut -> erreur typée
  (+ « quota épuisé » en 429 et « contexte trop long » multi-fournisseurs), diagnostic avec le fournisseur et
  l'opération, tarifs par fournisseur (Anthropic : table de TK-54 ; compatible : 0, B48 ; autres : pire tarif
  connu, B52), majorant de coût avant l'appel, coût réel en micro-dollars.
- **`src/sdk`** : une fabrique par fournisseur ; **clé et adresse toujours passées** (le SDK lit sinon
  `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `*_API_KEY`), `maxRetries: 0`, avertissements du SDK coupés.
  Toute erreur du SDK est ramenée aux erreurs typées du port : ni message, ni URL, ni en-tête, ni corps.
- **Anti-SSRF** (`baseUrl`, réservée à `openai_compatible`, refusée ailleurs) : `https` seul, ni identifiants,
  port 443, ni `localhost` / `*.localhost` / `*.local` / `*.internal`, ni littéral IP privé, bouclage, lien
  local, métadonnées cloud, `0.0.0.0` (les écritures décimale, octale, hexadécimale et IPv4 mappée sont
  normalisées par `URL`), nom résolu vers une adresse privée (contrôle à chaque appel), pas de redirection.
  La même fonction (`assertSafeBaseUrl`) sert à l'enregistrement (lot D). Seule une option injectée par le code
  autorise `http://127.0.0.1` pour un faux serveur de test, jamais l'environnement. Limite : B53.
- **Modèle** : au plus un `/` (`fournisseur/modèle`) ; refusé par les adaptateurs dont le modèle est dans l'URL (B50).
- **Qualification** : `src/qualification` (jeu de dossiers en français, exécuteur, catalogue). CI : faux modèle,
  aucun réseau. Mode manuel : `pnpm --filter @koklo/llm test:real` (voir `quality-and-operations.md`).
- `AnthropicProvider` reste exporté (même constructeur `{ fetch }`) : c'est le SDK avec les garanties communes.
  L'ancien `fetch` direct, la construction du corps et l'analyse de la réponse d'Anthropic sont supprimés
  (pas de double chemin) ; la suite de conformité du domaine, inchangée, passe contre le nouvel adaptateur.

### Limites assumées (lot A)
- Aucun appel réel à un fournisseur n'a été fait : les formats sont ceux des paquets installés, vérifiés contre
  des réponses simulées au format de chaque API (NEEDS-HUMAN : `test:real` avec une clé de test).
- Le SDK ne rend pas le modèle servi de Google, et Mistral n'a pas de raison d'arrêt « filtre de contenu » (B55).
- La requête envoyée par le SDK diffère de celle de TK-54 (`system` et `content` en blocs, `user-agent`) ;
  `anthropic-request.test.ts` et `anthropic-response.test.ts`, qui figeaient l'ancien corps, sont supprimés.

## Complément TK-95 (lot C) : base, clés et compteurs

- **Base** : migration `20261107090000_ai_providers` (voir `docs/domain-model.md`). Aucune dépendance nouvelle à ce
  lot. L'enum `llm_provider` passe à six valeurs ; l'adresse de base (`base_url`) est réservée à
  `openai_compatible` par un CHECK et par le service de clés (garde anti-SSRF à l'enregistrement, rejouée à la
  résolution). Les clés des six fournisseurs restent chiffrées par le même chiffrement (AAD
  `llm:v1:<organisation>:<fournisseur>`), la rotation de la clé maître les couvre sans changement de code.
- **Compteurs** : jetons, appels et coût en micro-dollars par (organisation, mois UTC, fournisseur), `BIGINT`
  bornés par CHECK, incrémentés atomiquement (`upsert` avec `increment`), jamais lus ni écrits en SQL brut
  (le client tenant le refuse). Le plafond mensuel et le marqueur d'alerte sont dans
  `ai_organization_settings` ; le marqueur est posé par une écriture conditionnelle (une seule alerte par mois).
- **Clés** : une clé retirée est détachée des réglages dans la même transaction (B61) ; l'historique de
  consommation reste. Une clé d'organisation n'est lue que par `PrismaAiCredentialSource` (moteur) et le service
  de clés.
- **Limites** : les routes (`aiProvider.*`, `aiUsage.*`) et le contrat 1.1.0 relèvent du lot D et de TK-98.

## Complément TK-95 (lot D) : câblage de l'API, contrat 1.1.0, retrait des fuites

- **Câblage** : le jeton `AI_PROVIDER` (le moteur de `@koklo/llm` sur les ports Prisma) remplace `LLM_PROVIDERS` ;
  `AiCallRunner` ne connaît plus de fournisseur (un appel nomme un usage). Les constantes `DEFAULT_MODELS`,
  `PROPOSAL_PROVIDER`, le type de fournisseur de `metaOf` et `llm.module.ts` sont supprimés (test de garde sur
  `apps/api/src/ai`). `meta.provider` est le fournisseur réellement servi.
- **Vie des clés par le moteur** : la bascule rend inutilisable le suivi « une clé par appel » de l'exécuteur ; le moteur
  signale donc lui-même le dernier usage et le rejet (401 explicite, avec la révision de la clé : compare-and-swap)
  par `AiKeyHooks`, meilleur effort. `AiProvider.preflight` refuse (plafond, aucune clé) avant l'audit et le quota.
- **Contrat 1.1.0 (additif, B47)** : six fournisseurs, `baseUrl` en entrée de `llmCredential.set`, erreur
  `LLM_CAP_REACHED` (409, sans donnée) sur les trois propositions. `llmCredential.verify` n'est ni suspendu ni compté.
- **Clés et agents de code** : le résolveur n'est lu que par la source de clés du moteur et `CredentialProbe` (liste
  blanche testée) ; `packages/delivery` n'importe ni les clés ni `@koklo/llm`.
- **Limites** : `verify` ne compte pas ses 16 jetons ; le dépassement concurrent du plafond est borné par les appels
  en vol ; aucune route de réglages (TK-98).
