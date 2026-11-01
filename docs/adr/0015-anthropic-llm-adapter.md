---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-01
covers_commit: 97b505c
---
# 0015 — Adaptateur Anthropic : `fetch` direct dans `@koklo/llm`, sans SDK

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
