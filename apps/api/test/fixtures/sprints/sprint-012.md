---
tags: [sprint/012, release/R4, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 012 — CLI : tokens, auth, contexte

Release : **R4**

## 🎯 Sprint Goal
Le CLI s'authentifie et résout son contexte sans jamais deviner.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [ ] H-15 — Décision 8 (licence du CLI et du format) avant la publication npm (TK-70)

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-63]** Base : tokens (utilisateur, agent, runner, CI, admin)
  - Labels : pkg:db, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-28
  - Source : CDC §9.3, §15 ([[vision]])
  - À faire :
    - Table des tokens : type, portée (organisation, projet, ticket), empreinte hachée, expiration, révocation, compteurs de quota
  - Critères d'acceptation :
    - [ ] Aucune colonne ne contient un token en clair (test)
    - [ ] Migration réversible testée
- [ ] **[TK-64]** API : émission des tokens, portées et flux device
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-63, TK-23
  - Source : CDC §9.1, §9.3, §9.8 ([[vision]])
  - À faire :
    - Émission, rotation, révocation immédiate, limites de débit par token ; flux « device » pour le CLI
  - Critères d'acceptation :
    - [ ] Un token agent ne peut ni merger ni sortir de son ticket (test)
    - [ ] Un token révoqué est refusé immédiatement
    - [ ] Test d'intégration du flux device complet
- [ ] **[TK-65]** CLI : squelette, contexte, schema, auth
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-64
  - Source : CDC §9.2, §9.5 ([[vision]])
  - À faire :
    - `@koklo/cli`, binaire `koklo` ; `--json`, codes de sortie stables, `--dry-run`
    - Résolution : flags/env → `.koklo/repo.yaml` → refus ; `koklo scope`
    - `auth login/logout/whoami`, `schema`
  - Critères d'acceptation :
    - [ ] Sans contexte, refus avec code de sortie dédié (test)
    - [ ] `koklo schema --json` décrit toutes les commandes
- [ ] **[TK-66]** CLI : org, project, ticket, sprint
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-65, TK-31
  - Source : CDC §9.4, §9.5 ([[vision]])
  - À faire :
    - `ticket start` prend un bail et crée la branche ; `ticket done`
  - Critères d'acceptation :
    - [ ] Tests CLI contre une API de test (§19.1)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés

## 🚧 Risks
- Le §9.5 place `rules pull` en R4 alors que `packages/rules` arrive en R5 : TK-68 livre les instructions d'agent (workflow, scope, interdits §9.7) ; la composition du catalogue s'y branche en R5 (TK-71).
