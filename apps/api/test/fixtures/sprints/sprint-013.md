---
tags: [sprint/013, release/R4, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 013 — CLI : spec, règles, MCP

Release : **R4**

## 🎯 Sprint Goal
Un agent local lit son ticket et sa tranche de spec par MCP.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-67]** CLI : feature, spec pull, cache
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-66, TK-44
  - Source : CDC §9.5, §7.4 (cache) ([[vision]])
  - À faire :
    - `feature list/show`, `spec pull` (tranche du ticket), cache `.koklo/cache/` ignoré par git
  - Critères d'acceptation :
    - [ ] Le cache n'est jamais utilisé pour une écriture (test)
- [ ] **[TK-68]** CLI : rules pull et rules show (instructions d'agent)
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-66
  - Source : CDC §9.7, §11.5 ([[vision]])
  - À faire :
    - Génère `AGENTS.md` et `CLAUDE.md` : workflow, scope actif, interdits
  - Critères d'acceptation :
    - [ ] Fichiers générés identiques à une fixture pour un ticket donné
- [ ] **[TK-69]** CLI : serveur MCP filtré par token
  - Labels : pkg:cli, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-67
  - Source : CDC §9.7, §15 ([[vision]])
  - À faire :
    - `koklo mcp` (stdio), SDK MCP officiel ; outils filtrés selon le token ; contenu marqué comme donnée
  - Critères d'acceptation :
    - [ ] Un token de ticket ne voit pas les outils d'organisation (test)
    - [ ] Résultat R4 : un agent lit son ticket et sa spec par MCP (test de bout en bout)
- [ ] **[TK-70]** Publication npm de @koklo/cli
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-69
  - Source : CDC §16.1 (CLI), §16.2 (versionnement) ([[vision]])
  - À faire :
    - Composant Release Please `cli` ; publication npm sur release
  - Critères d'acceptation :
    - [ ] Release de test publiée sur un tag de pré-version

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Résultat R4 vérifié en staging

## 🚧 Risks
- Aucun identifié à la rédaction.
