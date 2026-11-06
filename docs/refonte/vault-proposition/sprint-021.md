---
tags: [sprint/021, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 021 — Refonte : vue d'ensemble et projets

> Réécrit le 2026-11-06 (refonte du 6 novembre). Version précédente : « Refonte UI : projets et création de projet » (TK-93) ; TK-92 y rejoint TK-93.

## 🎯 Sprint Goal
La page d'accueil d'un projet dit où il en est, ce qui bloque et ce qui a bougé, pour l'équipe comme pour le client ; la liste des projets montre ce qui attend une action ; un projet se crée en une étape, son dépôt de spec naissant en arrière-plan.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Sprints 018 à 020 livrés.
- Références : `docs/refonte/passations/03-lot-3-vue-ensemble-passation.md` et `04-lot-4-projets-passation.md`, corrigées par `05-decisions-2026-11-05-spec-sans-brief.md` §2 « Lot 3 », `07-principe-listes-longues.md` §2, `21-lot-14-securite-passation.md` §0 (7 livrables).

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-92]** Lot 3 · Vue d'ensemble du projet : `project.overview` et écran S-overview
  - Labels : pkg:api, pkg:contract, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-88, TK-91
  - Source : `docs/refonte/passations/03-lot-3-vue-ensemble-passation.md` ; `05-decisions-2026-11-05-spec-sans-brief.md` §2 « Lot 3 » ; maquette `docs/refonte/maquettes/07-Lot3Overview.html` (Idée, Cadrage, Itérations ; barre latérale : suivre la décision 05, la planche est périmée)
  - Note : Réécrit le 2026-11-06 : phase selon `idea-vN`, 7 livrables, listes bornées à 5.
  - À faire :
    - `project.overview` agrégé, textes construits côté serveur en français (partagés avec le futur `koklo status`) ; phase unifiée (remplace le calcul de `apps/api/src/client-space/prisma-client-space.repository.ts:42`)
    - Prochaine étape unique (règles §5, dont « Proposer <livrable suivant> » de 05), vue client distincte ; « Relancer » copie un lien
    - Indicateurs par phase, masqués sans donnée ; bloc principal par phase (dossier d'idée, grille des 7 livrables avec cartes « Bientôt » non cliquables, sprint) ; Activité depuis le journal (phrases complètes, sans événement technique pour le client, projection lisible par le client) ; Personnes
    - Valideur des cartes de livrables : « Validation client · obligatoire » quand un client est invité ; sinon « Validation par l'équipe » (propriétaire ou administrateur, décision D1)
    - Retirer la redirection provisoire du lot 1 ; l'étape Design crée `design/screens/S-overview.md`
  - Critères d'acceptation :
    - [ ] `/projects/[projectId]` affiche S-overview ; « Vue d'ensemble » active dans la barre
    - [ ] Phase calculée côté serveur ; projets existants classés correctement (sans fonctionnalité, avec fonctionnalités sans baseline, avec `baseline-0`, avec `idea-v1`)
    - [ ] Prochaine étape : une seule, règles testées une par une, vue client distincte
    - [ ] Indicateurs par phase ; aucun indicateur sans donnée affiché
    - [ ] Grille des 7 livrables en phase Cadrage, valideur affiché, cartes non livrées non cliquables
    - [ ] Activité avec trois types d'acteurs, sans événement technique côté client ; « Voir toute l'activité » en liste 1.1
    - [ ] `project.overview` en un seul appel ; textes construits côté serveur
    - [ ] Captures : phases Idée, Cadrage, Itérations, projet neuf, erreur ; vue équipe et vue client ; clair, sombre, 375 px
- [ ] **[TK-93]** Lot 4 · Projets : liste en cartes et création en une étape
  - Labels : pkg:api, pkg:contract, pkg:web, pkg:worker, pkg:db, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-89, TK-92
  - Source : `docs/refonte/passations/04-lot-4-projets-passation.md` ; `07-principe-listes-longues.md` §2 (grille par pages de 24) ; maquette `docs/refonte/maquettes/08-Lot4Projects.html`
  - Note : Réécrit le 2026-11-06 d'après l'archive.
  - À faire :
    - `project.list(filter, sort)` paginé (24, curseur) avec phase, avancement, prochaine étape, avatars, dernière activité ; `project.recent` ; groupe « Récents » dans la barre
    - Grille de cartes `ul` (remplace le tableau de `apps/web/src/components/projects-view.tsx`), recherche, filtres de phase et compteurs serveur, tri
    - Boîte « Nouveau projet » en une étape (primitive `Dialog`) : nom, client invité (invitation + accès projet atomiques), structure du dossier d'idée (gabarits serveur), compte GitHub seulement s'il y en a plusieurs ; remplace `project-create-*.tsx` et `lib/use-creation-*.ts`
    - Création du dépôt en tâche de fond (worker), table `project_creations`, `project.creationStatus`, `project.retryRepo`, sondage 3 s ; carte de création avec chaque échec de S-projects v6 ; reprise depuis l'état serveur (retire `creation-resume.ts`)
    - Vue client limitée à ses projets ; redirection directe s'il n'en a qu'un ; fiche `S-projects.md` en v7
  - Critères d'acceptation :
    - [ ] Grille de cartes avec phase, avancement, prochaine étape, avatars, dernière activité ; tri par activité ; filtres et recherche côté serveur
    - [ ] Groupe « Récents » dans la barre quand aucun projet n'est actif
    - [ ] Boîte de dialogue unique ; client invité à la création ; choix de la structure du dossier ; compte GitHub sélectionnable seulement s'il y en a plusieurs
    - [ ] Projet ouvrable immédiatement ; dépôt créé en arrière-plan ; tous les échecs de S-projects v6 couverts sur la carte de création
    - [ ] Vue client limitée à ses projets ; redirection directe s'il n'en a qu'un
    - [ ] Captures : liste, filtrée, vide, création en cours, chaque échec, boîte de dialogue ; clair, sombre, 375 px

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées aux planches 07 et 08 au même état, jointes aux PR
- [ ] axe-core sans violation ; tests de droits côté serveur (client)

## 🚧 Risks
- Les règles de prochaine étape 3 à 7 dépendent de données des lots 2 et 5 : elles se replient sans erreur tant qu'elles manquent.
- La création en arrière-plan touche l'invitation, le dépôt GitHub et le dossier d'idée : trois effets à rendre idempotents.
