---
doc_version: 0.1.0
status: proposed
last_reviewed: 2026-11-01
covers_commit: 5a1ff1c
---
# 0011 — Port LLM et données non fiables

- **Statut** : proposé (lot TK-50a : marquage, cadrage et validation dans `packages/domain` ; le port et les adaptateurs viennent aux lots 50b et 50c)
- **Date** : 2026-11-01
- **Décideurs** : tech-lead, developer (ticket TK-50, lot 50a)

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
- `framePrompt({ instructions, data, nonce })` : `system` = politique fixe puis consigne ; `user` = un bloc `<<<DATA n origin=… nonce=…>>>` / `<<<END n nonce=…>>>` par donnée. Le nonce (16 à 64 caractères alphanumériques) est **fourni par l'appelant** : le domaine n'a ni aléa ni horloge. Les caractères de contrôle et marques bidirectionnelles sont remplacés par U+FFFD ; un contenu qui contient le nonce ou une séquence de délimiteur est **rejeté** (`UntrustedDelimiterCollisionError`, par rang, jamais par contenu), sans échappement silencieux.
- `validateLlmOutput(unvalidated(raw), parse)` : seul chemin vers `Validated<T>`, objet gelé `{ status: "proposal", value }`. Un échec de `parse` devient `LlmInvalidOutputError` sans reprendre la sortie ni le message de `parse`.
- Le SDK Anthropic n'est pas choisi ici : renvoyé à TK-54. Le faux fournisseur et la suite de conformité LLM seront placés dans `@koklo/domain/testing` : décision prise au lot 50c.

## Conséquences
- Un adaptateur LLM ne peut recevoir qu'un `FramedPrompt` et ne rend qu'un `Unvalidated` ; le compilateur le garantit.
- L'appelant doit générer un nonce imprévisible par appel (adaptateur, hors domaine) et gérer l'erreur de collision (retirer ou refuser la donnée).
- Ni le contenu des données, ni les prompts, ni les sorties ne figurent dans les erreurs ni dans les journaux (voir `quality-and-operations.md`).
- `LlmInvalidOutputError` pourra être re-enracinée sous `LlmProviderError` au lot 50b.

### Limites assumées
- Le cadrage **réduit** le risque d'injection de prompt, il ne le supprime pas : un modèle peut encore suivre une consigne contenue dans un bloc.
- Une sortie validée reste une **proposition** : un humain la valide avant tout effet (vision §6.3).
- Le nonce n'a de valeur que s'il est imprévisible ; le domaine ne peut pas le vérifier au-delà de son format.

## Preuves
Suite `pnpm --filter @koklo/domain test` (tests `untrusted`, `llm-prompt`, `llm-output`, `untrusted-purity`), dont le test paramétré du critère d'acceptation (9 origines x 11 contenus).
