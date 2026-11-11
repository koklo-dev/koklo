---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-11
covers_commit: 1ebbc10
---
# 0021 — Génération des propositions de l'agent dans le worker

- **Statut** : accepté le 2026-11-11 (TK-99a, lot B ; B314)
- **Date** : 2026-11-11
- **Décideurs** : developer, tech-lead (ticket TK-99a, sensible)

## Contexte
Un lancement de l'agent (« Proposer le Fonctionnel ») appelle le modèle une fois pour lister les zones, puis une fois par zone : jusqu'à treize appels, plusieurs minutes. Une requête HTTP ne peut pas les porter, et l'utilisateur doit pouvoir quitter la page. Le moteur d'IA (TK-95), le résolveur de clés BYOK, les réglages par organisation et le compteur mensuel vivaient dans l'API.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Génération dans le worker (pg-boss), moteur partagé par des paquets | Indépendante de toute requête ; une file déjà éprouvée (spec-write, project-creation) ; le worker n'a aucune route | Le worker reçoit le porte-clés et appelle un fournisseur externe |
| B. Génération dans l'API (flux ou longue requête) | Aucun partage | Coupée à la fermeture de la page ; bloque un processus HTTP ; délais de proxy |
| C. Service d'IA séparé | Isolement fort | Nouveau service, nouveau déploiement : disproportionné |

## Décision
Option A.
- **Partage par paquets, comportement inchangé** : `LlmCredentialResolver`, `llmCredentialAad`, les erreurs de clé et la porte de clé du moteur vivent dans `@koklo/llm` (`src/credentials/`, porte-clés typé structurellement, sans dépendre de `@koklo/github`) ; `RoutingSettingsStore`, `AiUsageMeterStore` et `LlmCredentialLookupStore` vivent dans `@koklo/db` (`src/ai/`, client tenant passé en paramètre, plus de `DatabaseService`) ; les budgets des motifs `proposal-zones`, `proposal-batch` et `proposal-revise` sont dans `@koklo/llm` (`src/proposals/budgets.ts`) ; le schéma JSON demandé au fournisseur (`jsonSchemaOf`) est dans `@koklo/schema`. L'API garde ses noms (`PrismaAiRoutingStore`, `PrismaAiUsageMeter`...) comme fines enveloppes Nest.
- **Moteur du worker** : un `AiProviderRouter` (TK-95) assemblé sur ces magasins, avec `euOnly` lu sur le projet. `@koklo/llm` est ajouté aux dépendances du worker : paquet de l'espace de travail, aucune dépendance externe nouvelle.
- **Quota et audit à l'API, une fois par lancement** : `ai.proposeDeliverable` refuse (moteur, quota, plafond) et écrit la ligne d'audit `ai.deliverable.propose` AVANT d'enfiler `{ launchId }` ; les appels du worker ne comptent pas dans le quota horaire, ils sont **mesurés par le compteur mensuel** (jetons et coût réels) et le plafond mensuel de l'organisation s'y applique à chaque appel.
- **Tâche `agent-propose`** (`key_strict_fifo`, `singletonKey = launchId`, `retryLimit` 1, `expireInSeconds` 900) : `queued` puis `running` (battement à chaque appel) ; étape 1, les zones (12 au plus) ; étape 2, une zone par appel, chaque zone validée publiée en une transaction (propositions `pending`, positions croissantes) pour que la relecture commence avant la fin ; `done`. Un échec est `failed` avec un code typé (`llm_cap_reached`, `llm_not_configured`, `llm_rate_limited`, `llm_rejected`, `output_invalid`, `no_frozen_version`, `timeout`, `worker_lost`, `provider_error`), jamais le texte du fournisseur ; il ne relance pas le job. Au-delà de 14 minutes, le lancement échoue en `timeout` (ce qui est publié reste lisible).
- **Sources limitées** à « L'agent lit » (`AGENT_READS`) : pages dont la version est celle du gel (une page modifiée depuis est exclue), synthèse publiée, page des risques figée, cahier actuel. Ni commentaires, ni membres, ni autres projets, ni brouillons. Tout est cadré comme donnée non fiable (nonce) ; une collision de délimiteur ignore la zone et la compte.
- **Validation** : chaque entrée passe le schéma Zod de son type et la politique de texte brut ; une entrée invalide, doublon de titre (avec le cahier ou le lancement), type non demandé ou cible inconnue est écartée et comptée (`discardedCount`), jamais publiée.
- **Le worker n'écrit jamais dans la spec** ni dans `spec_write_batches` : seules `agent_launches`, `agent_proposals` et `notifications` sont écrites ; l'enregistrement dans la spec reste `specBatch.submit`, sur clic.
- **Notification** : à `done`, si la liste n'a pas été lue depuis plus de 30 s (depuis le début du traitement si jamais lue), une ligne `proposal.ready` (sujet `agent_launch`, `dedupeKey = launchId`) est créée pour le demandeur, e-mail `skipped`.

## Conséquences
- Le worker lit `KOKLO_ENCRYPTION_KEY` (porte-clés) comme l'API : à injecter au service worker par le manifeste de déploiement (à contrôler au déploiement, non vérifiable en test).
- Le worker n'invalide pas une clé sur un 401 et ne marque pas son dernier usage : la vie des clés reste celle de l'API (`verify`, appels synchrones). Une clé rejetée fait échouer le lancement en `llm_rejected`.
- Les événements du moteur (bascule, plafond proche) sont journalisés par le worker, sans contenu ; l'audit reste celui de l'API.
- Un lancement dont le job est perdu est repris par le verrou de l'API après 5 minutes sans battement (`worker_lost`).
- Tout nouveau livrable (TK-100) réutilise la tâche : il ajoute ses sources (`AGENT_READS`) et ses types, pas un nouveau moteur.
