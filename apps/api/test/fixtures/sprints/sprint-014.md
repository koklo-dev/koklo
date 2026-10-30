---
tags: [sprint/014, release/R5, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 014 — Livraison autonome : règles et machine à états

Release : **R5**

## 🎯 Sprint Goal
Le catalogue de règles et la machine à états existent, testés sans I/O.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-71]** packages/rules : catalogue, composition, koklo-strict
  - Labels : pkg:rules, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-25
  - Source : CDC §11, §17.4, annexe C §C.8 ([[vision]])
  - À faire :
    - Import du catalogue Shipyard `rules/catalog.json` ; composition rôle × langage × domaine × paquet × profils déclarés × projet ; règles verrouillées ; types gate / preuve / instruction
    - Profil `koklo-strict` = §17 ; dérogations tracées
  - Critères d'acceptation :
    - [ ] Un niveau inférieur ne peut pas désactiver une règle verrouillée (test)
- [ ] **[TK-72]** packages/delivery : machine à états du run
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-27
  - Source : CDC §10.3, annexe C §C.6 ([[vision]])
  - À faire :
    - États et transitions du §C.6 ; causes de blocage typées ; `timeout` distinct
    - Tests nommés : incidents 11, 12, 13, 17, 18
  - Critères d'acceptation :
    - [ ] Couverture des branches ≥ 90 %
    - [ ] Chaque incident cité a son test nommé
- [ ] **[TK-73]** packages/delivery : AgentRuntime et Claude Code
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-72
  - Source : CDC §10.4, annexe C §C.5 incident 25 ([[vision]])
  - À faire :
    - Interface `lancerSession(rôle, prompt, worktree, outils, délai)` ; implémentation Claude Code non interactive
    - Frontière vérifiée en CI : aucun appel d'outil d'agent hors de l'interface
  - Critères d'acceptation :
    - [ ] Test `incident-25-agent-runtime-boundary`
- [ ] **[TK-74]** packages/delivery : quotas et recul global
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-73
  - Source : CDC §10.7, annexe C §C.5 incidents 22 et 26 ([[vision]])
  - À faire :
    - Détection par formulations réelles (une par test), recul global au runner, reprise du même ticket
  - Critères d'acceptation :
    - [ ] Tests `incident-22-*` et `incident-26-*`
    - [ ] Un quota n'est jamais compté comme échec

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés

## 🚧 Risks
- Aucun identifié à la rédaction.
