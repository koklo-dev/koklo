---
tags: [sprint/007, release/R1, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 007 — Pilotage structuré : API, kanban, import

Release : **R1**

## 🎯 Sprint Goal
Créer un sprint, des tickets dépendants, les déplacer ; deux baux concurrents : un seul gagne.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [x] **[TK-30]** API : tickets et sprints
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-26, TK-28, TK-29
  - Source : CDC §7.1, §7.2, §7.3 ([[vision]])
  - À faire :
    - Modules `ticket` et `sprint` ; un seul sprint actif par projet ; suppression logique des tickets
  - Critères d'acceptation :
    - [x] Test d'intégration : créer un sprint et trois tickets dépendants, transition refusée tant qu'une dépendance n'est pas `done`
- [x] **[TK-31]** API : état de projet, baux et verrous en base
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-27, TK-28, TK-29
  - Source : CDC §7.4, §7.5 ([[vision]])
  - À faire :
    - Procédures de bail (prendre, renouveler, libérer) ; expiration traitée par la base
  - Critères d'acceptation :
    - [x] Test de concurrence : deux prises simultanées du même ticket, une seule gagne (résultat R1)
- [x] **[TK-32]** API : commentaires et journal d'audit
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-28, TK-29
  - Source : CDC §7.6, §15 ([[vision]])
  - À faire :
    - Commentaire avec type d'auteur (humain, agent, client, système) ; chaque écriture journalisée
  - Critères d'acceptation :
    - [x] Le journal refuse toute modification (test)
    - [x] Chaque procédure d'écriture produit une entrée d'audit (test)
- [x] **[TK-33]** Seed complet du §18.3
  - Labels : pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-28
  - Source : CDC §18.3 ([[vision]])
  - À faire :
    - Spec fictive (3 features, 2 tables), un sprint actif, 6 tickets avec dépendances
  - Critères d'acceptation :
    - [x] Seed déterministe (test de double exécution)
- [ ] **[TK-34]** Import ponctuel des fichiers de sprint Shipyard
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-30
  - Source : CDC §7.7, §10.9, annexe C §C.5 incidents 21 et 23 ([[vision]])
  - À faire :
    - Commande d'administration : lit les `sprint-NNN.md` au format de CE vault (`- [ ] **[TK-n]**`, `Labels`, `Dépend de`, `Source`, critères)
    - Conserve les clés `TK-n`, les labels `pkg:*`, la sensibilité, les dépendances et l'état (case cochée, ligne `Statut`)
    - Rapport des lignes ignorées, jamais d'abandon silencieux ; import idempotent (appariement par clé)
  - Critères d'acceptation :
    - [ ] Fixture : copie réelle des sprints de `MyVault/koklo-v2` → zéro ligne ignorée non expliquée
    - [ ] Deux imports successifs ne créent aucun doublon (incident 23)
- [ ] **[TK-35]** Web : kanban minimal
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-30, TK-31
  - Source : CDC §7.3 ; Design §6 ([[vision]])
  - À faire :
    - Pas de maquette (`DESIGN.md` §6 : « proposé, non maquetté ») : captures clair et sombre jointes à la PR pour validation humaine
    - Colonnes = statuts ; glisser-déposer ; transition validée par le serveur, refus affiché
  - Critères d'acceptation :
    - [ ] Preuve navigateur jointe
    - [ ] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [ ] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)
- [ ] **[TK-36]** e2e R1
  - Labels : pkg:e2e, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-33, TK-35
  - Source : CDC §21 (R1) ([[vision]])
  - À faire :
    - Parcours : créer un sprint, des tickets dépendants, les déplacer
  - Critères d'acceptation :
    - [ ] e2e vert en CI

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Résultat R1 vérifié en staging

## 🚧 Risks
- Aucun identifié à la rédaction.
