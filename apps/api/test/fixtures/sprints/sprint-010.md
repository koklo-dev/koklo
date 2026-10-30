---
tags: [sprint/010, release/R3, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 010 — Cadrage : IA BYOK et espace client

Release : **R3**

## 🎯 Sprint Goal
Le cadrage se fait avec l'IA du client et l'espace client par lien magique existe.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-50]** Domaine : port LLM et marquage des données non fiables
  - Labels : pkg:domain, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-25
  - Source : CDC §2 (A2), §15 ([[vision]])
  - À faire :
    - Port multi-fournisseurs ; tout contenu de spec ou commentaire passé au modèle est marqué comme donnée
  - Critères d'acceptation :
    - [ ] Test : un contenu contenant une consigne reste encapsulé comme donnée
- [ ] **[TK-51]** Base : identifiants BYOK, suggestions, reviews, baselines, notifications
  - Labels : pkg:db, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-41
  - Source : CDC §4.2, §15 ([[vision]])
  - À faire :
    - Tables du §4.2 pour R3 ; clés BYOK chiffrées (colonne opaque)
  - Critères d'acceptation :
    - [ ] Migration réversible testée
- [ ] **[TK-52]** API : clés BYOK chiffrées par enveloppe
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-51
  - Source : CDC §15 (secrets) ([[vision]])
  - À faire :
    - AES-256-GCM, clé maître `KOKLO_ENCRYPTION_KEY` hors base ; jamais renvoyées en clair
  - Critères d'acceptation :
    - [ ] Test : la base ne contient jamais la clé en clair
    - [ ] Rotation de la clé maître testée
- [ ] **[TK-53]** packages/schema : rôles produit, permissions, règles métier, critères structurés
  - Labels : pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-40
  - Source : annexe A §3, §4.2 ([[vision]])
  - À faire :
    - Extension du format ; critères Étant donné / Quand / Alors
  - Critères d'acceptation :
    - [ ] Fixtures valides et invalides
- [ ] **[TK-54]** API : brief et features avec l'IA (Anthropic d'abord)
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-50, TK-52, TK-53
  - Source : CDC §2 (A2), §16.5 (LLM), §21 (R3) ([[vision]])
  - À faire :
    - Adaptateur Anthropic derrière le port ; génération de features et critères à partir d'un brief
  - Critères d'acceptation :
    - [ ] Tests avec un modèle simulé ; aucun appel réel en CI
- [ ] **[TK-55]** API : espace client, suggestions, validation liée au SHA
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-23, TK-51
  - Source : CDC §6.1, §14 ([[vision]])
  - À faire :
    - Client par lien magique uniquement ; suggestions `SG-n` ; review d'une feature liée au SHA
  - Critères d'acceptation :
    - [ ] Un client ne peut pas éditer, seulement suggérer et valider (matrice §14)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés

## 🚧 Risks
- Aucun identifié à la rédaction.
