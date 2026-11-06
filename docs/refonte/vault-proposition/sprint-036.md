---
tags: [sprint/036, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 036 — Refonte : `koklo deliver` repensé, puis bascule

> Créé le 2026-11-06. Remplace le sprint 017 « Bascule : Koklo se livre lui-même », qui reposait sur l'ancien `koklo deliver` (boucle autonome côté Koklo, annulée par la décision du 06/11). Décision de Brice (questions C2) : `koklo deliver` est entièrement à revoir, sans baser sa mécanique sur Shipyard, mais en s'inspirant de ses agents et de ses retours d'expérience.

## 🎯 Sprint Goal
Une conception validée de `koklo deliver` : un enchaînement d'agents qui tourne sur le poste d'un membre, pilote les tickets par le MCP Koklo et respecte les règles du 06/11 (la CI fait foi, revue humaine obligatoire, aucun agent ne fusionne). La bascule de Koklo sur Koklo est réécrite à partir de cette conception.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Sprints 032 à 034 livrés (jetons, CLI, MCP, sessions d'agent).
- [ ] H-27 — Valider la conception de `koklo deliver` produite par TK-137 (ADR + passation)
- [ ] H-28 — Réécrire les actions humaines de la bascule (anciens H-18 à H-23 du sprint 017) d'après la conception validée

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-137]** Étude : concevoir `koklo deliver` v2 à partir des agents et des retours d'expérience de Shipyard
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-131, TK-69
  - Source : `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` ; `18-lot-12-tickets-passation.md` §2.5, §2.6 ; `docs/refonte/questions.md` C2 (dépôt `koklo`)
  - Note : Étude, sans code de production. Remplace l'ancien TK-81 (`koklo deliver`, annulé) et le sprint 017.
  - À faire :
    - Inventorier ce que Shipyard apporte et ce qu'il coûte : agents par rôle (`~/.claude/shipyard/templates/agents/*.agent.md.tpl`), workflow `koklo-delivery` (analyse → design → red → green → refactor → revue), boucle (`templates/loop/*`), gates, mémoires d'agent
    - Recueillir les retours d'expérience des sprints 001 à 021 : `MyVault/koklo-v2/agents/*/memory.md`, `workflows/runs/`, rétrospectives `sprints/retro-*.md`, escalades et blocages (statuts 🔴 des sprints), incidents de l'annexe C
    - Proposer la mécanique de `koklo deliver` v2 **propre à Koklo** : sur le poste uniquement, prise de ticket par `ticket.start`, étapes remontées par `ticket.progress`, `gate.report` indicatif, outil d'agent au choix (Claude Code, Codex, Cursor…), reprise après interruption, parallélisme, ce qui reste humain (revue, fusion, validation)
    - Livrables : une note d'étude dans `MyVault/koklo-v2/spikes/`, un ADR proposé dans `docs/adr/`, et un brouillon de passation (format de `docs/refonte/passations/`) avec les tickets d'implémentation, à faire valider par Brice
  - Critères d'acceptation :
    - [ ] La note d'étude cite, pour chaque élément repris de Shipyard, le retour d'expérience qui le justifie, et pour chaque élément écarté, la raison
    - [ ] La mécanique proposée ne fait exécuter aucun agent par le serveur Koklo, ne fusionne jamais sans revue humaine et n'utilise jamais les clés d'IA de l'organisation
    - [ ] La mécanique ne dépend pas de Shipyard (aucun script ni gabarit de Shipyard requis à l'exécution)
    - [ ] ADR proposé et brouillon de passation remis ; aucun ticket d'implémentation créé avant la validation de Brice (H-27)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée
- [ ] Conception validée par Brice avant toute implémentation

## 🚧 Risks
- Reproduire Shipyard sous un autre nom : l'étude doit justifier chaque emprunt par un retour d'expérience.
- La bascule (ancien sprint 017) dépend de cette conception : ses actions humaines restent en attente jusque-là.
