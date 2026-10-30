---
tags: [sprint/008, release/R2, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 008 — Spec dans git : fournisseur et format

Release : **R2**

## 🎯 Sprint Goal
Le fournisseur git et le format de spec existent et sont testés sans GitHub réel.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [x] H-14 — Créer la GitHub App Koklo de staging (permissions et événements du §8.1) ; saisir `GITHUB_APP_*` via `scripts/init-app-env.sh` d'infra (§20.5)

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-37]** Spike : création du repo de spec sur un compte personnel
  - Labels : pkg:github, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-4
  - Source : CDC §8.1 (« à vérifier en R2 ») ([[vision]])
  - À faire :
    - Vérifier si une GitHub App peut créer un repo pour un compte personnel ou s'il faut le jeton OAuth de l'utilisateur
    - Résultat consigné dans une ADR
  - Critères d'acceptation :
    - [ ] ADR rédigée avec la réponse et la source (doc GitHub)
- [ ] **[TK-38]** Domaine : port FournisseurGit
  - Labels : pkg:domain, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-25
  - Source : CDC §8 ([[vision]])
  - À faire :
    - Interface du §8 (authentifier, creerRepo, lireFichier, ecrireCommit, creerBranche, creerPR, etatPR, fusionner, poserTag, lireDeploiements, publierCheck, commenterPR, abonnerWebhooks)
  - Critères d'acceptation :
    - [ ] Aucune dépendance à Octokit dans `domain` (frontière vérifiée)
- [ ] **[TK-39]** packages/github : implémentation GitHub App et faux fournisseur
  - Labels : pkg:github, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-37, TK-38
  - Source : CDC §8.1, §19.1 (GitHub), annexe C §C.5 incident 33 ([[vision]])
  - À faire :
    - Implémentation GitHub App (permissions et événements du §8.1)
    - Faux fournisseur en mémoire partagé par les tests ; tests réels marqués (repo bac à sable), exclus de la CI
  - Critères d'acceptation :
    - [ ] Suite de conformité commune exécutée contre le faux et (manuellement) contre GitHub
- [ ] **[TK-40]** packages/schema : format de spec et validateur (règles 4, 5, 7)
  - Labels : pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-3
  - Source : CDC §5.2, §12.1, annexe A §3 et §4 ([[vision]])
  - À faire :
    - Zod → JSON Schema : features, tables, endpoints, `koklo.project.yaml`
    - JSON canonique (clés triées, indentation fixe)
    - Règles 4, 5 et 7 du §12.1
  - Critères d'acceptation :
    - [ ] Fixtures valides et invalides pour chaque règle
    - [ ] Sérialisation canonique stable (test de double écriture)
- [ ] **[TK-41]** Base : installations, repos, index de spec, livraisons de webhooks, lots
  - Labels : pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-28
  - Source : CDC §3, §8.2 ([[vision]])
  - À faire :
    - Tables de pilotage du fournisseur ; dédoublonnage des livraisons de webhooks par identifiant
  - Critères d'acceptation :
    - [ ] Migration réversible testée
- [ ] **[TK-42]** Contrat : fournisseur, spec, features
  - Labels : pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-29
  - Source : CDC §5, §8 ([[vision]])
  - À faire :
    - Procédures d'installation, de lecture de la spec et des opérations par lot
  - Critères d'acceptation :
    - [ ] Test de contrat mis à jour

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés

## 🚧 Risks
- Aucun identifié à la rédaction.
