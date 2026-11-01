---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-01
covers_commit: bb9f740
---
# 0011 — Port LLM et données non fiables

- **Statut** : accepté (ticket TK-50 complet : lot 50a marquage, cadrage et validation ; 50b port `LlmProvider`, budget, clé opaque, erreurs typées ; 50c faux `FakeLlm`, suite de conformité et export `@koklo/domain/testing`, le tout dans `packages/domain` ; le statut est effectif à la fusion du lot 50c ; les adaptateurs viennent avec TK-54)
- **Date** : 2026-11-01
- **Décideurs** : tech-lead, developer (ticket TK-50, lots 50a, 50b et 50c)

## Contexte
Le produit enverra bientôt à un modèle de langage des contenus qui ne viennent pas de Koklo : fichiers de spec, suggestions client, commentaires, issues, pull requests, contenu Git, saisies, briefs et sorties d'autres modèles. Ces contenus peuvent porter une consigne cachée (injection de prompt) : « ignore tout », faux rôle `system:`, balises de chat, appel d'outil, fausse fin de données, texte bidirectionnel. Le critère d'acceptation de TK-50 exige qu'un contenu contenant une consigne reste encapsulé comme donnée. La vision (§6.3) interdit qu'une sortie de modèle devienne un ticket sans validation humaine. Le domaine reste pur (pas d'I/O, pas d'horloge, pas d'aléa, aucune dépendance).

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Types nominaux dans le domaine : `Untrusted` / `Trusted` / `FramedPrompt` / `Unvalidated` / `Validated`, cadrage par blocs à nonce | Le compilateur interdit de mélanger donnée et consigne ; aucun I/O ; testable sans réseau | Le cadrage réduit le risque sans le supprimer |
| B. Chaînes brutes, échappement par l'appelant | Aucune API nouvelle | Oubli silencieux, aucune garantie de compilation |
| C. Filtrage lexical des consignes suspectes | Facile à expliquer | Contournable (traduction, encodage), faux positifs sur du contenu légitime |
| D. Choisir tout de suite le SDK Anthropic et ses rôles de messages | Rôles natifs | Couple le domaine à un fournisseur ; le choix du SDK relève de TK-54 |

## Décision
Option A, dans `packages/domain` (fichiers `untrusted.ts`, `trusted.ts`, `llm-prompt.ts`, `llm-output.ts`, `llm-errors.ts`).
- `Untrusted(origin, value)` : origine dans une liste fermée de neuf valeurs, contenu privé, instance gelée, masquée à l'interpolation, au JSON et à `util.inspect` (`[untrusted:<origine>]`). Lecture explicite par `revealUntrusted`, réservée au cadrage.
- `Trusted` : consigne de Koklo, construite seulement par l'étiquette de gabarit `trusted`, sans aucune interpolation (valeurs typées `never`, erreur à l'exécution sinon).
- `framePrompt({ instructions, data, nonce })` : `system` = politique fixe puis consigne ; `user` = un bloc `<<<DATA n origin=… nonce=…>>>` / `<<<END n nonce=…>>>` par donnée. Le nonce (16 à 64 caractères alphanumériques) est **fourni par l'appelant** : le domaine n'a ni aléa ni horloge. Les caractères de contrôle (sauf `\n` et `\t`) et les marques bidirectionnelles/invisibles (U+00AD, U+061C, U+200B–U+200F, U+2028–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF, tags U+E0000–U+E007F) sont remplacés par U+FFFD ; un contenu qui contient le nonce ou une séquence de délimiteur, **sans tenir compte de la casse ni de la chasse** (repli NFKC puis minuscules), est **rejeté** (`UntrustedDelimiterCollisionError`, par rang, jamais par contenu), sans échappement silencieux.
- `validateLlmOutput(unvalidated(raw), parse)` : seul chemin vers `Validated<T>`, objet gelé `{ status: "proposal", value }`. Un échec de `parse` devient `LlmInvalidOutputError` sans reprendre la sortie ni le message de `parse`.
- **Port (50b)** : `interface LlmProvider { id; complete(request): Promise<LlmResponse> }`, une opération, sans état, sans streaming, sans outil. `LlmRequest` = modèle, `LlmCredential`, `FramedPrompt`, sortie voulue (`text` ou `json` avec schéma), `LlmBudget` **obligatoire**, température, signal d'annulation, trace (`purpose`, `correlationId` au motif `[A-Za-z0-9._:-]{1,64}`, jamais de contenu). `LlmResponse` = `Unvalidated`, raison d'arrêt, usage, fournisseur et modèle réellement servis.
- **Fournisseurs** : liste fermée `anthropic | openai | google` (BYOK, source de la colonne `provider` de TK-51) ; `fake` (`LLM_TEST_PROVIDER_ID`) n'est servi que par le faux de test et n'est jamais stocké. Seul `llm-provider-id.ts` nomme un fournisseur (test de frontière).
- **Budget** : tokens de sortie, durée, taille du prompt et coût en micro-dollars, tous obligatoires et entiers positifs, plafonnés par le domaine (32 000 tokens, 120 s, 400 000 caractères, **5 $ par appel** = 5 000 000 µ$). `assertWithinBudget` : champ invalide -> `InvalidLlmBudgetError`, dépassement -> `LlmBudgetExceededError { limit }`.
- **`LlmCredential`** : clé BYOK opaque (champ privé, instance gelée sans propriété propre, constructeur protégé par jeton de module). Gabarit, `String`, JSON, `util.inspect` et `console` rendent `[redacted]` ; seule `revealLlmCredential` rend la clé, au dernier moment, dans l'adaptateur. Validation : chaîne, non vide, 512 caractères au plus, sans caractère de contrôle (`InvalidLlmCredentialError(reason)`, jamais la valeur).
- **Erreurs typées** : racine `LlmProviderError { operation, provider?, status? }` et dix sous-classes (auth, débit, quota, délai, annulation, budget, contexte, refus, modèle, indisponibilité) plus `LlmInvalidOutputError` (`operation = "validate"`, désormais enracinée sous la racine). Le constructeur n'accepte que des champs connus et valides (opération `[a-z][a-z0-9-]{0,39}`, fournisseur de la liste fermée, statut HTTP 100 à 599), ignore le reste et ne porte **aucune `cause`**.
- **Garde d'adaptateur** : `assertLlmRequest(request)`, appelée avant tout réseau, vérifie dans l'ordre le modèle, la clé (`isLlmCredential`), le prompt (`isFramedPrompt`), la sortie voulue, la température (0 à 2), le signal, la trace (`InvalidLlmRequestError(reason)`), puis le budget, puis un signal déjà annulé (`LlmAbortedError`).
- **Durcissements issus de la revue 50a** : `FramedPrompt` porte une marque privée `#brand` et `Validated` est enregistré dans un `WeakSet` (`isFramedPrompt`, `isValidated` ne reconnaissent ni copie, ni `Object.create`, ni objet forgé) ; `framePrompt` revalide chaque origine (`isUntrustedOrigin`) ; `trusted` exige des `strings` et `strings.raw` gelés de même longueur ; `validateLlmOutput` refuse un `parse` asynchrone ou thenable sans appeler `then` et neutralise la promesse (pas de rejet non géré) ; `InvalidUntrustedOriginError` ne reprend plus la valeur fautive.
- **Instantané gelé (50c, TOCTOU)** : `assertLlmRequest` lit chaque champ de la requête **une seule fois** et retourne un instantané gelé en profondeur (budget et trace copiés, schéma JSON cloné par `structuredClone` puis gelé ; prompt, clé et signal, déjà opaques, sont conservés). L'adaptateur et le faux n'utilisent que cet instantané, jamais la requête d'origine : un accesseur ou un objet muté après la garde ne peut plus changer le budget ni le modèle effectivement appelés (TOCTOU).
- **Durcissements du lot 50c** : `LlmInvalidOutputError.reason` appartient à la liste fermée `LLM_INVALID_OUTPUT_REASONS` (`shape | not-synchronous`, toute autre raison devient `shape`) ; `retryAfterMs` est tronqué et plafonné à `LLM_MAX_RETRY_AFTER_MS` (1 h) ; un diagnostic `null` ou absent donne `operation = "unknown"` ; le signal doit être un vrai `AbortSignal` ; le modèle ne contient ni `/` ni `..` (`claude-sonnet-4.5` et `gpt-4o:2024` restent valides) ; les surrogates isolés des données sont remplacés par U+FFFD avant neutralisation.
- **`@koklo/domain/testing` (50c)** : sous-chemin `./testing` du paquet (`types` et `default` vers `dist/testing`, comme `@koklo/github/testing`), hors de l'index public. Il exporte `FakeLlm` (fournisseur `fake` scripté, déterministe, sans horloge ni aléa ni timer, qui n'enregistre jamais la clé), `FakeLlmScriptExhaustedError` et la suite de conformité `runLlmConformance(name, factory, { describe, it })` avec ses 11 cas. Le moteur de test est passé par l'appelant : le domaine n'importe pas vitest. TK-54 exécutera la même suite sur l'adaptateur. Alternative écartée : un paquet `packages/llm`, déplaçable plus tard sans changer le port.
- Le SDK Anthropic n'est pas choisi ici : renvoyé à TK-54 (ADR dédiée).

## Conséquences
- Un adaptateur LLM ne peut recevoir qu'un `FramedPrompt` et ne rend qu'un `Unvalidated` ; le compilateur le garantit.
- L'appelant doit générer un nonce imprévisible par appel (adaptateur, hors domaine) et gérer l'erreur de collision (retirer ou refuser la donnée).
- Ni le contenu des données, ni les prompts, ni les sorties ne figurent dans les erreurs ni dans les journaux (voir `quality-and-operations.md`).
- Un adaptateur appelle `assertLlmRequest` en premier, mappe les échecs du fournisseur sur les erreurs typées (sans `cause`, sans en-tête, sans corps de réponse) et ne lit la clé qu'avec `revealLlmCredential`.

### Limites assumées
- Le cadrage **réduit** le risque d'injection de prompt, il ne le supprime pas : un modèle peut encore suivre une consigne contenue dans un bloc.
- Une sortie validée reste une **proposition** : un humain la valide avant tout effet (vision §6.3).
- `revealUntrusted` (et `Untrusted.reveal`) reste **exporté** par l'index public (la restreindre casserait l'API publique déjà testée), mais son usage est **confiné par un test de source** (50c) : en production, seuls `untrusted.ts` et `llm-prompt.ts` le référencent (parcours de `packages/` et `apps/`). Un nouvel appelant fait échouer ce test.
- **Forge de `trusted` par tableau gelé** : l'étiquette `trusted` vérifie que `strings` et `strings.raw` sont gelés, de même longueur et sans interpolation, mais un code qui appelle `trusted` comme une fonction ordinaire avec un tableau gelé construit lui-même peut y mettre n'importe quel texte, donc forger une consigne de confiance depuis une donnée. C'est une limite assumée : le typage nominal protège contre l'oubli, pas contre un code hostile déjà exécuté dans le processus ; la revue garde les appels à `trusted` en littéraux de gabarit.
- Le TOCTOU est fermé pour les champs de la requête (instantané gelé), pas pour un prompt ou une clé déjà opaques et immuables, ni pour un `signal` qui peut être annulé après la garde (comportement voulu).
- Les homoglyphes non repliables par NFKC (cyrillique, grec) ne sont pas détectés comme délimiteurs ; ils sont inoffensifs, car seul le vrai délimiteur ferme un bloc.
- Un `parse` thenable est refusé, mais un `parse` qui planifie un effet asynchrone ailleurs reste l'affaire de l'appelant.
- Le plafond de coût (5 $) est vérifié sur la valeur déclarée dans le budget ; le calcul du coût réel à partir des tarifs relève des adaptateurs (TK-54).
- Le nonce n'a de valeur que s'il est imprévisible ; le domaine ne peut pas le vérifier au-delà de son format.

## Preuves
Suite `pnpm --filter @koklo/domain test` (tests `untrusted`, `llm-prompt`, `llm-output`, `untrusted-purity`, `llm-hardening-50c`, `fake-llm`, `llm-conformance`, `testing-export`), dont le test paramétré du critère d'acceptation (9 origines x 11 contenus).
