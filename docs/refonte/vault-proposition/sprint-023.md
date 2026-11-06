---
tags: [sprint/023, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 023 — Refonte : Fonctionnel complet et validation client

## 🎯 Sprint Goal
L'équipe propose, relit et enregistre les règles métier, les rôles et permissions et les parcours. Le client valide le cahier fonctionnel élément par élément. Les 4 onglets tiennent le volume réel de la planche.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations validées par Brice le 05/11/2026 (dépôt `koklo`) : `docs/refonte/passations/06-lot-5-fonctionnel-passation.md`, `07-principe-listes-longues.md`, `08-lots-5-6-volume-reel-passation.md`, `11-principe-creer-modifier.md`. Lire « N/7 » pour « N/6 » (`21-lot-14-securite-passation.md` §0).
- Sprint prérequis : 022 (TK-99 à TK-102).
- Questions ouvertes : B7 et B10 (TK-103). Elles ne bloquent pas : la lecture prudente s'applique. B19 (profils `seed:large` / `seed:planche`, rattachée à TK-94) doit être tranchée pour comparer TK-105 à la planche.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-103]** Lot 5b · Règles métier, Rôles et permissions, Parcours
  - Labels : pkg:web, pkg:api, pkg:worker, pkg:contract, pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-102
  - Source : `docs/refonte/passations/06-lot-5-fonctionnel-passation.md` §4.3, §4.4, §6, §9, `11-principe-creer-modifier.md` §3 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/10-Lot5Fonctionnel.html` (Relecture et Liste · équipe, onglets Règles métier, Rôles et permissions, Parcours)
  - À faire :
    - Fichiers `domain/rules/R-nnn-<slug>.md` (vocabulaire B10), `domain/roles.yaml` (permissions `PM-ressource.action`, restrictions), parcours `design/flows/P-<slug>.yaml` (B7). Reprendre `packages/schema/src/entities/domain.ts`, `parse/rule-markdown.ts`, `parse/roles-file.ts` ; ajouter `design/flows/` à `kindOf` ; indexer règles, rôles et parcours (`apps/worker/src/webhook/index-rows.ts`).
    - `specBatch.submit` : opérations `rule.*`, `role.*`, `flow.*` dans `apps/worker/src/spec-write/{plan,paths}.ts` ; gérer les écritures concurrentes du fichier unique `roles.yaml`.
    - `ai.proposeDeliverable` `'functional'` : types `rule`, `role`, `flow` ; détail de relecture par type (règle : type, énoncé, exemple ; rôle : permissions ; parcours : acteur, étapes).
    - Onglet Règles métier : phrase d'aide, légende des 3 types, grille de cartes `minmax(420px, 1fr)` par pages de 24 avec filtre par type, états d'un workflow dessinés.
    - Onglet Rôles et permissions : cartes de rôle et matrice « Qui peut faire quoi » (vrai `table` avec `caption`, texte lisible dans chaque cellule).
    - Onglet Parcours : cartes, étapes en ligne reliées par des flèches, cas d'erreur.
    - Formulaires `SpecItemSheet` Règle, Rôle, Parcours (11 §3) branchés sur « Nouvelle règle », « Nouveau rôle », « Nouveau parcours » et « Modifier ».
  - Critères d'acceptation :
    - [ ] 4 onglets avec leurs vues dédiées (liste + fiche, cartes de règles, matrice des rôles, parcours en étapes).
    - [ ] Relecture générique (`ProposalReview`) sur les 4 types, enregistrement groupé en un lot avec récapitulatif.
    - [ ] Références vérifiées à l'enregistrement : écran, règle, rôle cités doivent exister ou être dans le même lot.
    - [ ] Matrice : `th scope="col"` et `scope="row"`, chaque cellule lisible (« autorisé », « autorisé : les siennes », « non autorisé ») en plus de l'icône ; parcours en `ol` ; états d'un workflow lus dans l'ordre.
    - [ ] Chaque « Nouveau… » et « Modifier » de ces onglets ouvre `SpecItemSheet` avec le bon formulaire.
    - [ ] Droits côté serveur : client et business ne proposent, ne relisent ni n'écrivent (test 403) ; designer selon les règles d'écriture de la spec par type.
    - [ ] Données de test de charge : 300 règles dans `pnpm seed:large` ; grille fluide, première page < 300 ms côté serveur.
    - [ ] Recherche et filtres testés sur des éléments non chargés ; lien direct vers une règle hors de la première page ; états de pied de liste et recherche vide capturés.
    - [ ] Responsive 06 §9 : grille des règles en 1 colonne et étapes en colonne sous 1024 px, matrice en défilement horizontal.
    - [ ] Captures de chaque état × chaque onglet en clair, sombre et 375 px ; axe sans violation.
  - Questions : B7 (parcours métier dans `design/flows/P-*.yaml`, flux technique dans `architecture/flows/`, scénarios dans `quality/scenarios/` seulement) ; B10 (garder le vocabulaire français de l'ADR 0012 et ajouter `etats` et `fonctionnalites`, sans réécrire les fichiers existants).
- [ ] **[TK-104]** Lot 5c · Vue client et validation du cahier, « Relancer »
  - Labels : pkg:web, pkg:api, pkg:contract, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-103
  - Source : `docs/refonte/passations/06-lot-5-fonctionnel-passation.md` §3 (Vue client), §4.5, §5, §8, `07-principe-listes-longues.md` §1.4 (vue client) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/10-Lot5Fonctionnel.html` (Vue client · validation, 4 onglets)
  - À faire :
    - Vue client : bandeau ambre « Votre validation est attendue », progression ; fonctionnalités et parcours un par un, règles et rôles en bloc ; fiche en langage simple (« Si … et que …, alors … »), liens avec leur libellé, sans codes seuls.
    - Actions « Valider » / « Demander un changement » branchées sur `review.submit` / `review.list` (TK-100) ; « Valider le cahier » et « Envoyer mes demandes » ; le livrable passe « À revoir » côté équipe avec les commentaires attachés aux éléments.
    - Bandeau « 2 éléments ont changé depuis votre validation » quand une validation est invalidée.
    - « Relancer <prénom> » (owner, admin) via `apps/api/src/notification/notification-emitter.ts` ; activité dans la vue d'ensemble.
    - Reprendre l'API existante `apps/api/src/client-space/`, `apps/api/src/review/`, `contract-client-space.ts`, `contract-review.ts` (fonctionnalités seulement, aucune UI).
    - Progression « 12 / 248 », « Aller à la suivante non traitée », filtre « Non traitées » (07 §1.4).
  - Critères d'acceptation :
    - [ ] Vue client : fonctionnalités et parcours un par un, règles et rôles en bloc, « Valider le cahier » / « Envoyer mes demandes », validations liées au commit et invalidées par une modification.
    - [ ] « Valider le cahier » actif seulement quand tout est traité et qu'il n'y a aucune demande ; le serveur refuse sinon (test).
    - [ ] Note « Votre validation porte sur la version du <date> · <sha> » sur chaque fonctionnalité.
    - [ ] Le client ne voit jamais les propositions en attente, ni « Proposer avec l'agent », ni « Modifier » : filtré côté serveur, pas seulement masqué (test).
    - [ ] Droits côté serveur : seul le client valide ou demande un changement ; sans client invité sur le projet, le propriétaire ou l'administrateur valident à sa place (D1), jamais le développeur ni un jeton d'agent ; business lit sans valider ; « Relancer » réservé à owner et admin (tests 403).
    - [ ] Après Valider / Demander un changement, passage à la suivante non traitée, y compris hors de la page chargée.
    - [ ] Captures : chaque onglet en vue client, avant et après décision, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-105]** Lot 5 · volume réel
  - Labels : pkg:web, pkg:api, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-104
  - Source : `docs/refonte/passations/08-lots-5-6-volume-reel-passation.md` §1, §3, §4 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/10-Lot5Fonctionnel.html` (Volume réel : chaque onglet, relecture groupée, vue client)
  - À faire :
    - `spec.functional.list({ tab, q?, filters?, cursor?, limit })` sur les 4 onglets ; résumé de l'en-tête et compteurs d'onglets sur les vrais totaux.
    - Fonctionnalités : liste virtualisée dans un cadre à défilement interne (max. 600 px à 1080 px d'écran), pages de 50. Règles : recherche « Rechercher une règle ou R-nnn », pages de 24. Parcours : recherche, cartes par pages de 6.
    - `spec.roles.matrix({ projectId, group?, q? })` : au-delà de 20 actions, matrice groupée par ressource (`th scope="rowgroup"`, groupes de moins de 5 actions ouverts), filtre « Filtrer les actions ».
    - Relecture au-delà de 30 propositions : fonctionnalités groupées par zone, règles par type ; filtres « À relire · N » / « Toutes · N » ; en-têtes collants avec « Accepter les N » ; 8 éléments puis « Afficher 20 de plus » ; barre de progression 6 px ; liste des propositions à défilement interne (max. 880 px).
    - Zone d'une fonctionnalité proposée par l'agent (`zone:` de `features/F-nnn-*.md`), modifiable.
    - Vue client : progression sur les totaux, barre de compte « 50 chargées · 242 à traiter ».
  - Critères d'acceptation :
    - [ ] Avec le jeu de volumes de la planche (248 fonctionnalités, 86 règles, 47 actions, 18 parcours ; profil `seed:planche` selon B19), chaque onglet du lot 5 se comporte comme la planche en Volume réel.
    - [ ] Relecture groupée au-delà de 30 propositions, « Accepter les N » limité au groupe.
    - [ ] Résumé et compteurs = vrais totaux, jamais la longueur des pages chargées (test).
    - [ ] Avec `pnpm seed:large` : 60 i/s au défilement, première page < 300 ms côté serveur ; recherche et filtres sur des éléments non chargés ; lien direct hors de la première page.
    - [ ] Droits côté serveur : `spec.roles.matrix` et `spec.functional.list` ne renvoient au client que la vue client (aucune proposition en attente) (test).
    - [ ] Captures en Volume réel : chaque onglet, relecture groupée, vue client, clair, sombre, 375 px ; axe sans violation.

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px de chaque écran touché, comparées à la planche
- [ ] axe sans violation sur chaque état
- [ ] Listes vérifiées avec `pnpm seed:large`

## 🚧 Risks
- Règles, rôles et parcours : format partiel, non indexé, `design/flows/` absent de `kindOf`, vocabulaire des règles différent de l'ADR 0012 (B10).
- `roles.yaml` est un fichier unique : risque de conflits d'écriture.
- Vue client : l'API existe pour les fonctionnalités, toute l'UI est à faire.
- « Accepter les N » couvre des éléments non chargés : la décision doit se faire côté serveur.
