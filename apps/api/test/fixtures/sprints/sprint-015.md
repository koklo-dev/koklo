---
tags: [sprint/015, release/R5, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 015 — Livraison autonome : runner, review, triage

Release : **R5**

## 🎯 Sprint Goal
Le runner développe, ouvre la PR, fait relire et escalade correctement.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-75]** Runner : bail, worktree, parallélisme, purge
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-72, TK-31
  - Source : CDC §10.4, annexe C §C.5 incidents 1, 2, 5 ([[vision]])
  - À faire :
    - Checkout principal jamais utilisé ; worktree par worker ; purge des worktrees orphelins ; aucune dépendance à `flock`
  - Critères d'acceptation :
    - [ ] Tests `incident-01-*`, `incident-02-*`, `incident-05-*`
- [ ] **[TK-76]** Runner : gates locaux, PR, attente CI, commits
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-75, TK-39
  - Source : CDC §10.1, annexe C §C.6, incident 19 ([[vision]])
  - À faire :
    - Corps de PR : critères et preuves, dépendances, versions ; normalisation commitlint
  - Critères d'acceptation :
    - [ ] Test `incident-19-*` par cas réel
    - [ ] Timeout CI sans compteur consommé (incident 11)
- [ ] **[TK-77]** Review d'agent
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-76
  - Source : CDC §10.8, annexe C §C.2, incidents 12, 13, 14, 24, 30 ([[vision]])
  - À faire :
    - Ordre conflit → gates → CI → review ; `VERDICT:` contraint, borné, persisté en commentaire ; refus des tests affaiblis
  - Critères d'acceptation :
    - [ ] Un verdict illisible ne change rien (test)
    - [ ] Tests nommés des incidents cités
- [ ] **[TK-78]** Triage et escalade
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-77, TK-32
  - Source : CDC §7.6, §10.6, annexe C incidents 7, 8, 9 ([[vision]])
  - À faire :
    - `DECISION:` en lecture seule ; « le moins jugé d'abord » avec plafond ; compteurs remis à zéro à l'escalade ; réponse humaine injectée (≤ 8 000 caractères)
  - Critères d'acceptation :
    - [ ] Test 12 tickets sur 3 cycles (incident 9)
    - [ ] Tests incidents 7 et 8

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés

## 🚧 Risks
- Aucun identifié à la rédaction.
