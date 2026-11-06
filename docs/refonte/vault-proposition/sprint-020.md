---
tags: [sprint/020, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 020 — Refonte : espace Idée

> Réécrit le 2026-11-06 (refonte du 6 novembre). Version précédente : « Refonte UI : vue d'ensemble du projet » (TK-92), déplacée au sprint 021.

## 🎯 Sprint Goal
L'équipe et le client écrivent ensemble le dossier d'idée ; l'agent propose des sections et des pages qu'un humain accepte ; « Passer au cadrage » fige `idea-v1` et génère la Synthèse.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Sprints 018 et 019 livrés (composants, coquille, `AiProvider`).
- Références : `docs/refonte/passations/02-lot-2-idee-passation.md`, corrigée par `05-decisions-2026-11-05-spec-sans-brief.md` §2 « Lot 2 » et `12-lot-8-technique-passation.md` §8.3 ; `07-principe-listes-longues.md` (commentaires 1.1, propositions 1.4).

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-89]** Lot 2a · Espace Idée : pages modulables, éditeur Markdown, publication, droits du client
  - Labels : pkg:api, pkg:contract, pkg:web, pkg:worker, pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-88
  - Source : `docs/refonte/passations/02-lot-2-idee-passation.md` §1 à §7, §10, §11 ; `12-lot-8-technique-passation.md` §8.3 (colonne de 264 px, marges des encadrés) ; maquette `docs/refonte/maquettes/06-Lot2Idee.html`
  - Note : Réécrit le 2026-11-06 d'après l'archive (pages modulables, Synthèse en tête d'arborescence).
  - À faire :
    - Modèles `IdeaPage` (id stable, slug figé, position, `required`, `origin`, `templateKey`, suppression douce) et `IdeaPublication` ; gabarit « cadrage par défaut » en configuration serveur ; migration : 10 pages vides pour chaque projet existant
    - Procédures `idea.list/get/save/setStatus/publish` et `idea.page.create/rename/reorder/delete/restore` ; `CONFLICT` sur version dépassée
    - Droits §2 côté serveur : le client rédige, gère les pages et utilise l'agent, mais ne publie pas et ne passe pas au cadrage ; étendre `apps/api/test/client-write-matrix.test.ts`
    - Écran S-idea (`/projects/[id]/idea`) : rail replié par défaut, trois colonnes, arborescence (`@dnd-kit/sortable`, clavier, Alt + flèches, corbeille 30 jours), éditeur TipTap en Markdown restreint (ADR TipTap et dnd-kit) ; enregistrement auto, copie locale cloisonnée (reprendre `apps/web/src/lib/use-storage-scope.ts`), présence par sondage 15 s
    - Publication : opérations `idea.*` dans le worker (`apps/worker/src/spec-write/plan.ts`), `idea/<slug>.md` + `idea/_index.yaml`, plusieurs `Co-authored-by` (`message.ts`)
    - L'étape Design crée `design/screens/S-idea.md`
  - Critères d'acceptation :
    - [ ] Aller-retour Markdown sans perte sur les 10 pages par défaut
    - [ ] Contenu hostile (`<script>`, `javascript:`, image Markdown, HTML) rendu inerte dans le document
    - [ ] Suppression d'une page requise refusée côté serveur
    - [ ] Réordonnancement : liste incomplète refusée, positions recalculées, fichiers publiés non renommés, `_index.yaml` conforme
    - [ ] Glisser-déposer au clavier et annoncé
    - [ ] Droits client : publication refusée côté serveur
    - [ ] Conflit de version : la saisie locale n'est jamais perdue
    - [ ] Captures de chaque état en clair, sombre et 375 px ; axe sans violation
- [ ] **[TK-90]** Lot 2b · Espace Idée : panneau de l'agent, propositions de contenu et de pages
  - Labels : pkg:api, pkg:contract, pkg:web, pkg:llm, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-89, TK-95
  - Source : `docs/refonte/passations/02-lot-2-idee-passation.md` §5, §6.3, §6.4, §6.5, §8 ; maquette `docs/refonte/maquettes/06-Lot2Idee.html`
  - Note : Réécrit le 2026-11-06. Le stockage des propositions est conçu pour être repris par le socle des livrables (TK-99, `proposal.decide` unifié).
  - À faire :
    - `IdeaProposal` (contenu et `createPage`) et `IdeaMessage` ; `idea.proposal.decide` atomique (appliquer l'opération + nouvelle version)
    - `ai.ideaChat` en flux via `AiProvider` (usage « Espace Idée ») ; `ai.ideaGaps` (anti-rebond 30 s) ; un appel IA à la fois par utilisateur et projet, verrou en base (remplace la logique de `apps/api/src/ai/ai-gate.ts` pour cet usage)
    - Panneau de l'agent (Entretien / Libre, actions sur la sélection dont « En faire une page »), `ProposalDiff` sur place (A / R, Modifier, Annuler, `stale`), carte « page proposée » dans l'arborescence
    - Guide de questions §8 comme base du prompt système ; auteurs envoyés comme « l'équipe » / « le client »
  - Critères d'acceptation :
    - [ ] Aucune écriture de page ni création de page par l'agent sans `idea.proposal.decide`
    - [ ] Contenu hostile rendu inerte dans les propositions ; lien d'une proposition inerte tant qu'elle n'est pas acceptée
    - [ ] Aucune donnée personnelle dans la charge envoyée au modèle (test)
    - [ ] Sans clé d'IA, l'éditeur et la gestion des pages restent entièrement utilisables
    - [ ] Captures de chaque état en clair, sombre et 375 px ; axe sans violation
- [ ] **[TK-91]** Lot 2c · Espace Idée : maturité, Synthèse, `idea-vN` et passage au cadrage
  - Labels : pkg:api, pkg:web, pkg:github, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-90
  - Source : `docs/refonte/passations/02-lot-2-idee-passation.md` §9 ; `05-decisions-2026-11-05-spec-sans-brief.md` §1.3, §2 « Lot 2 »
  - Note : Réécrit le 2026-11-06 : plus de brief ni d'`ai.draftBriefFromIdea` (décision 05).
  - À faire :
    - Jauge de maturité (pages stables sur le total hors corbeille) et seuil des pages requises
    - « Passer au cadrage » : publie si besoin, pose le tag `idea-vN` (`createTag`, `packages/github/src/ops/git-data.ts`) sur le commit publié de `cadrage`, génère la Synthèse (`ai.ideaSynthesis`, `idea/_synthese.md` avec `genere: true`, `source: idea-vN`), ouvre Spec · Fonctionnel ; confirmation s'il reste des questions ouvertes
    - Page Synthèse en tête d'arborescence, lecture seule, « Régénérer », aperçu avant la première version (équipe)
    - « Modifié depuis idea-vN » + « Figer une nouvelle version » (équipe)
    - Phase calculée : `idea` tant qu'aucune `idea-vN` ni fonctionnalité ; `PhaseRail` Idée → Cadrage
  - Critères d'acceptation :
    - [ ] « Passer au cadrage » désactivé avec sa raison tant qu'une page requise n'est pas stable ; le seuil suit les pages requises renommées ou déplacées
    - [ ] Tag `idea-v1` posé sur le dépôt de spec (faux fournisseur) ; `idea-v2` à la version suivante
    - [ ] Synthèse générée, en lecture seule, hors jauge, sans proposition
    - [ ] Passage au cadrage refusé côté serveur pour le client
    - [ ] Captures de chaque état en clair, sombre et 375 px ; axe sans violation

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche 06 au même état, jointes aux PR
- [ ] axe-core sans violation ; tests de droits côté serveur (client, agent)

## 🚧 Risks
- Ouvrir l'écriture au client casse l'hypothèse actuelle « le client n'écrit que des suggestions et des validations ».
- Le flux de l'agent demande d'étendre le port IA et le transport oRPC.
- Aucun tag n'a jamais été posé par Koklo : premier usage de `createTag` en production.
