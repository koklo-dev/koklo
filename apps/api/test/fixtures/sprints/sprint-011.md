---
tags: [sprint/011, release/R3, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 011 — Cadrage : baseline-0 et découpage en tickets

Release : **R3**

## 🎯 Sprint Goal
Un client valide une feature ; `baseline-0` posée ; tickets proposés puis validés.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-56]** API : fin de cadrage et baseline-0
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-55
  - Source : CDC §6.1 ([[vision]])
  - À faire :
    - Validation du SHA de `cadrage` par le client → fusion → tag `baseline-0`
  - Critères d'acceptation :
    - [ ] Test avec le faux fournisseur
- [ ] **[TK-57]** API : proposition de découpage en tickets
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-54, TK-56
  - Source : CDC §6.3 ([[vision]])
  - À faire :
    - Un ticket par critère ou groupe cohérent, un paquet par ticket, dépendances, estimation en heures
    - Aucun ticket créé sans validation humaine
  - Critères d'acceptation :
    - [ ] Test : la proposition seule ne crée aucun ticket
- [ ] **[TK-58]** Worker : emails de notification
  - Labels : pkg:worker, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-22, TK-51
  - Source : CDC §10.6, §16.5 ([[vision]])
  - À faire :
    - Emails : validation demandée, escalade (préparé pour R5)
  - Critères d'acceptation :
    - [ ] Emails capturés en test
- [ ] **[TK-59]** Web : cadrage (brief, features, critères)
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-54
  - Source : CDC §21 (R3) ([[vision]])
  - À faire :
    - Écrans de cadrage
  - Critères d'acceptation :
    - [ ] Preuve navigateur jointe
    - [ ] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [ ] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)
- [ ] **[TK-60]** Web : espace client et validation
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-55, TK-56
  - Source : CDC §6.1, §21 (R3) ; Design §2.2, §6 ([[vision]])
  - À faire :
    - Vue client : suggérer, commenter, valider, sans vocabulaire git
    - S'inspire de la planche « Features · thème Indigo » décrite dans `DESIGN.md` §6 (la maquette elle-même est un artefact privé, illisible par un agent) ; statuts Validée / À valider / À revoir via `StatusBadge`
  - Critères d'acceptation :
    - [ ] Preuve navigateur jointe, clair et sombre
    - [ ] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [ ] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)
- [ ] **[TK-61]** Web : revue de la proposition de tickets
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-57
  - Source : CDC §6.3 ([[vision]])
  - À faire :
    - Valider, ajuster, ranger en sprints
  - Critères d'acceptation :
    - [ ] Preuve navigateur jointe
    - [ ] Étape design du workflow tenue : chaque écran touché a sa fiche `design/screens/<S-id>.md` créée ou mise à jour (réflexion UI/UX, états, alternatives écartées, ligne d'historique) ; captures réelles clair et sombre dans la PR
    - [ ] Conforme à `DESIGN.md` : composants et tokens de `@koklo/ui` uniquement (aucune couleur ni icône en dur), rendu vérifié en clair et en sombre, accessibilité §7 (AA, vrais `button`/`a`/`input` avec `label`, `aria-label` sur les boutons d'icône, statut jamais signalé par la couleur seule, variante mouvement réduit)
- [ ] **[TK-62]** e2e R3
  - Labels : pkg:e2e, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-59, TK-60, TK-61
  - Source : CDC §21 (R3) ([[vision]])
  - À faire :
    - Parcours complet avec modèle simulé : client valide une feature, `baseline-0`, tickets proposés puis validés
  - Critères d'acceptation :
    - [ ] e2e vert en CI

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Résultat R3 vérifié en staging

## 🚧 Risks
- Aucun identifié à la rédaction.
