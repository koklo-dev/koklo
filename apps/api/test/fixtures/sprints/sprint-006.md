---
tags: [sprint/006, release/R1, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 006 — Pilotage structuré : domaine et données

Release : **R1**

## 🎯 Sprint Goal
Les règles de pilotage existent en domaine pur et en base.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [x] **[TK-25]** Domaine : ticket (statuts, transitions, clés, sensibilité, paquet)
  - Labels : pkg:domain, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-3
  - Source : CDC §7.1, §4.2 ([[vision]])
  - À faire :
    - Statuts fermés `backlog`, `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled` et transitions autorisées
    - Clé `TK-n` unique par projet ; un seul `pkg` ; sensibilité `safe`/`sensitive` ; compteurs tentatives et rounds
    - Aucun import de Prisma, Nest, Octokit, `fs`
  - Critères d'acceptation :
    - [x] Toute transition non autorisée est refusée (test par transition)
    - [x] Couverture des branches ≥ 90 % (§19.2)
- [x] **[TK-26]** Domaine : dépendances (DAG), éligibilité, ordre de sélection
  - Labels : pkg:domain, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-25
  - Source : CDC §7.2 ([[vision]])
  - À faire :
    - Refus d'un cycle à l'écriture
    - Éligible si toutes les dépendances bloquantes sont `done`
    - Ordre : sprint actif → priorité → dépendances satisfaites → ancienneté
  - Critères d'acceptation :
    - [x] Test de cycle direct et indirect
    - [x] Test d'ordre de sélection indépendant de l'ordre d'insertion
- [x] **[TK-27]** Domaine : baux, verrous et état de projet versionné
  - Labels : pkg:domain, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-25
  - Source : CDC §7.4, §7.5, annexe C §C.5 incidents 3 et 4 ([[vision]])
  - À faire :
    - Bail : titulaire, branche, worktree, expiration 15 min, battement de cœur ; un bail actif par ticket
    - État de projet : version incrémentée, concurrence optimiste
    - Imbrication de verrous détectée et refusée avec une erreur nommée
  - Critères d'acceptation :
    - [x] Test `incident-03-expired-lease-frees-ticket`
    - [x] Test `incident-04-nested-locks-refused`
    - [x] Écriture avec une version périmée refusée avec l'état courant
- [x] **[TK-28]** Base : tickets, critères, dépendances, sprints, état, baux, commentaires, audit
  - Labels : pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-20, TK-25
  - Source : CDC §4.2, §18, annexe C §C.5 incident 6 ([[vision]])
  - À faire :
    - Tables du §4.2 utiles à R1 ; compteur transactionnel des clés ; contrainte d'unicité du bail actif ; audit immuable
    - Migration + `down.sql` + test up→down→up
  - Critères d'acceptation :
    - [x] Test : aucune colonne de type liste dans le schéma (incident 6)
    - [x] Deux insertions concurrentes de bail actif : une seule réussit (contrainte en base)
- [x] **[TK-29]** Contrat : tickets, sprints, dépendances, état, baux, commentaires, audit
  - Labels : pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-21
  - Source : CDC §7 ([[vision]])
  - À faire :
    - Procédures CRUD et transitions, avec erreurs typées (transition interdite, cycle, conflit de version, bail détenu)
  - Critères d'acceptation :
    - [x] Test de contrat mis à jour

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés

## 🚧 Risks
- Aucun identifié à la rédaction.
