---
tags: [sprint/009, release/R2, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 009 — Spec dans git : commits du bot, webhooks, index

Release : **R2**

## 🎯 Sprint Goal
Créer un projet crée le repo de spec avec `cadrage` ; une feature écrite dans l'app devient un commit.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-43]** API : création du repo de spec
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-39, TK-41, TK-42
  - Source : CDC §5.1 point 1, annexe A §4.0 ([[vision]])
  - À faire :
    - À la création d'un projet neuf : repo privé, structure de l'annexe A §4.0, branche `cadrage`
  - Critères d'acceptation :
    - [ ] Test avec le faux fournisseur : repo, structure et branche créés
- [ ] **[TK-44]** API : écritures de spec par lots, commit du bot
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-40, TK-43
  - Source : CDC §5.1 points 2-3, §5.2 ([[vision]])
  - À faire :
    - Un commit du bot par lot, `Co-authored-by` de l'auteur réel, trailer `Koklo-Ops:`
    - Écritures sérialisées par branche (file pg-boss par branche)
  - Critères d'acceptation :
    - [ ] Deux lots concurrents sur une branche produisent deux commits ordonnés (test)
- [ ] **[TK-45]** Worker : webhooks signés et idempotents, index de spec
  - Labels : pkg:worker, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-41, TK-44
  - Source : CDC §8.2 ([[vision]])
  - À faire :
    - Signature vérifiée, dédoublonnage, traitement asynchrone ; reconstruction de l'index à chaque push
  - Critères d'acceptation :
    - [ ] Une livraison rejouée n'a aucun effet (test)
    - [ ] Une signature invalide est rejetée (test)
- [ ] **[TK-46]** Worker : réconciliation périodique
  - Labels : pkg:worker, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-45
  - Source : CDC §8.2, annexe C §C.5 incident 10 ([[vision]])
  - À faire :
    - Toutes les 10 min : rattrape événements perdus, PR mergées à la main, branches supprimées
  - Critères d'acceptation :
    - [ ] Test `incident-10-manual-merge-reconciled`
- [ ] **[TK-47]** Manifest : GITHUB_APP_* en secrets
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-43
  - Source : CDC §20.4, §20.5 ([[vision]])
  - À faire :
    - Passer `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` de `optionalSecrets` à `secrets`
  - Critères d'acceptation :
    - [ ] `pnpm deploy:check` vert
- [ ] **[TK-48]** Web : installation de l'App et édition de feature
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-44
  - Source : CDC §21 (R2) ([[vision]])
  - À faire :
    - Écran d'installation de la GitHub App ; formulaire de feature qui écrit par l'API
  - Critères d'acceptation :
    - [ ] Preuve navigateur jointe
    - [ ] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [ ] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)
- [ ] **[TK-49]** e2e R2 (faux fournisseur)
  - Labels : pkg:e2e, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-48
  - Source : CDC §21 (R2) ([[vision]])
  - À faire :
    - Créer un projet → repo de spec ; écrire une feature → commit
  - Critères d'acceptation :
    - [ ] e2e vert en CI

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Résultat R2 vérifié en staging contre la vraie GitHub App de staging

## 🚧 Risks
- Aucun identifié à la rédaction.
