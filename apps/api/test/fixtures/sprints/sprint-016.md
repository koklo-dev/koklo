---
tags: [sprint/016, release/R5, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 016 — Livraison autonome : merge serveur et koklo deliver

Release : **R5**

## 🎯 Sprint Goal
Un ticket `todo` est livré, relu et mergé par le serveur sans intervention.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [ ] H-16 — Ajouter `koklo/policy` aux checks requis de `develop` (§10.5 point 5, §20.2)
- [ ] H-17 — Installer le runner `koklo deliver` en service sur la machine choisie, avec son token runner

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-79]** API : politique et merge serveur
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-39, TK-71
  - Source : CDC §10.5, §11.3, annexe C incidents 15, 16, 29 ([[vision]])
  - À faire :
    - Verrou de merge par projet, relecture de la PR sous verrou, ticket `sensitive` = approbation humaine, merge `rebase` vers `develop` par la GitHub App, idempotent
    - Check `koklo/policy` publié sur chaque PR
  - Critères d'acceptation :
    - [ ] Tests incidents 15 et 16
    - [ ] Un ticket `sensitive` n'est jamais mergé sans approbation (test)
- [ ] **[TK-80]** Worker : exécution des merges et deployed_staging
  - Labels : pkg:worker, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-79, TK-45
  - Source : CDC §10.5, §20.4 (vue de déploiement) ([[vision]])
  - À faire :
    - Job de merge ; `deployed_staging` = succès du workflow `Deploy` (`workflow_run`) sur le commit de merge
  - Critères d'acceptation :
    - [ ] Test avec événements `workflow_run` simulés
- [ ] **[TK-81]** CLI : koklo deliver et doctor
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-78, TK-80
  - Source : CDC §9.5, annexe C incident 28 ([[vision]])
  - À faire :
    - `deliver run/status/pause/resume/triage` ; `koklo doctor` ; documentation du mode service (systemd)
  - Critères d'acceptation :
    - [ ] `deliver status --json` reflète l'état en base
- [ ] **[TK-82]** CLI : rules pull branché sur le catalogue
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-71, TK-68
  - Source : CDC §11.5 ([[vision]])
  - À faire :
    - `rules pull` matérialise aussi `biome.json` et les règles composées
  - Critères d'acceptation :
    - [ ] Fixture par profil
- [ ] **[TK-83]** Web : vue de livraison
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-80
  - Source : CDC §6.4, §10.1 ([[vision]])
  - À faire :
    - Runs, étapes, gates, PR, déploiements ; dérogations visibles (§17.2)
  - Critères d'acceptation :
    - [ ] Preuve navigateur jointe
    - [ ] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [ ] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Résultat R5 : un ticket `todo` livré, relu et mergé par le serveur sans intervention

## 🚧 Risks
- Aucun identifié à la rédaction.
