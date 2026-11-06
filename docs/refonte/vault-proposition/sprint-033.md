---
tags: [sprint/033, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 033 — Refonte : Agents locaux

## 🎯 Sprint Goal
Un membre installe `koklo` sur son poste, se connecte, prend un ticket (`koklo ticket start` ou « prends le ticket TK-108 » via le MCP Koklo) avec son propre outil d'agent ; l'agent remonte son avancement, Koklo l'affiche dans la carte, l'onglet Sessions et passe la session « Sans nouvelles » après 20 min de silence ; le client suit une feuille de route en mots simples. Koklo n'exécute rien.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations validées par Brice le 06/11/2026 : `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` et `docs/refonte/passations/18-lot-12-tickets-passation.md` §2.5, §2.6, §3 (dépôt `koklo`).
- Sprints prérequis : 032 (kanban TK-129, jetons TK-63 et TK-64).
- Ordre de prise ajusté : TK-131 (procédures côté serveur, sessions) passe avant TK-66 et TK-69, qui exposent ces procédures par le CLI et par le MCP.
- Aucune question ouverte bloquante.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-65]** CLI : squelette, contexte, schema, auth
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-64
  - Source : CDC §9.2, §9.5 ([[vision]]) ; `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.7 (`koklo login`) (dépôt `koklo`)
  - Note : Gardé le 2026-11-06 (refonte) : base du CLI local. `pkg:cli` est un nouveau paquet (`@koklo/cli`), introduit avec son ADR.
  - À faire :
    - Nouveau paquet `@koklo/cli`, binaire `koklo` ; `--json`, codes de sortie stables, `--dry-run` ; ADR du CLI (feuille de route §4)
    - Résolution du contexte : flags / env → `.koklo/repo.yaml` → refus ; `koklo scope`
    - `koklo login` (flux device de TK-64, ouvre le navigateur), `logout`, `whoami`, `schema`
  - Critères d'acceptation :
    - [ ] Sans contexte, refus avec code de sortie dédié (test)
    - [ ] `koklo schema --json` décrit toutes les commandes
- [ ] **[TK-131]** Lot 12c · Agents locaux : `ticket.*`, `gate.report`, sessions, « Sans nouvelles », onglet Sessions, vue client
  - Labels : pkg:cli, pkg:api, pkg:web, pkg:db, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-129, TK-63, TK-64
  - Source : `docs/refonte/passations/18-lot-12-tickets-passation.md` §2.5, §2.6, §3, §4 ; `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` (dépôt `koklo`) ; maquette `docs/refonte/maquettes/23-Lot12Tickets.html` (Sprint en cours : onglet Sessions d'agent, panneau onglet Session ; Vue client)
  - Note : Absorbe TK-67 (CLI : feature, spec pull, cache : la tranche de spec est renvoyée par `ticket.start`) et la partie Sessions de TK-83 (vue de livraison). Remplace TK-76 (gates locaux : `gate.report` indicatif, la CI fait foi) et TK-78 (triage et escalade : état « Sans nouvelles » et sa notification), annulés.
  - À faire :
    - Procédures appelées par le jeton d'agent ou le CLI : `ticket.start` (crée la branche, ouvre la session, renvoie la tranche de spec figée sur `baseline-0`), `ticket.progress` (étape courante du workflow, message court, battement), `gate.report` (résultat indicatif d'un contrôle local), `ticket.release` (libère le ticket, la branche et le travail restent sur le poste)
    - Modèle `AgentSession` (`agent_sessions`) : ticket, membre, outil déclaré, poste, dernière remontée, étapes ; réutiliser les baux (`apps/api/src/lease/*`) ; retirer le titulaire « runner » (`HolderKind.runner`, `AuditActorKind.runner`, `Lease.worktree`), libérer les baux `runner` actifs, garder leurs lignes du journal
    - État « Sans nouvelles » au-delà de 20 min sans remontée (tâche du worker), pastille ambre `wifi_off`, notification « agent sans nouvelles »
    - `agentSession.list({ projectId })` ; onglet Sessions d'agent (intro, carte par session : état En cours / Sans nouvelles / En attente / À reprendre, 7 barres d'étapes, outil · poste · dernière remontée) ; onglet Session du panneau (« Agent local · Claude Code sur le poste de Moussa », bloc « Prendre ce ticket sur votre poste » avec Copier, « Libérer le ticket ») ; « 2 agents connectés · postes de … »
    - Vue client pleine largeur : feuille de route en 4 étapes, sprint en cours par fonctionnalité (Prête à essayer, En vérification, En cours, En attente, À venir), Sprint 2 et Plus tard ; aucune clé, PR, branche ni agent
    - Côté CLI : la tranche reçue est mise en cache dans `.koklo/cache/` (ignoré par git), jamais utilisé pour une écriture (repris de TK-67)
    - ADR du SDK MCP (feuille de route §4), utilisé par TK-69
  - Critères d'acceptation :
    - [ ] Aucun lancement d'agent côté serveur ; sessions alimentées par les remontées MCP / CLI ; état « Sans nouvelles »
    - [ ] `ticket.start` renvoie la tranche figée sur `baseline-0` ; le cache n'est jamais utilisé pour une écriture (test)
    - [ ] `gate.report` reste indicatif : seul le contrôle de la CI fait foi sur la PR (test)
    - [ ] Après 20 min sans remontée, la session passe « Sans nouvelles » et une notification part (test avec horloge simulée)
    - [ ] Droits côté serveur : un jeton d'agent ne lit que son ticket, n'écrit que sur sa branche, ne fusionne jamais, ne valide jamais au nom du client, ne pose pas de baseline (tests 403)
    - [ ] Une session d'agent n'utilise jamais les clés d'IA de l'organisation (« jetons consommés par l'outil de Moussa, jamais par la clé de l'organisation ») (test)
    - [ ] Vue client sans clé, PR, branche ni agent (test)
    - [ ] Captures : onglet Sessions, onglet Session (pris, pas encore pris, sans nouvelles, ticket humain), vue client, clair, sombre, 375 px, comparées à la planche ; axe sans violation
- [ ] **[TK-66]** CLI : org, project, ticket (`start`, `release`), sprint
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-65, TK-31, TK-131
  - Source : `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §2, §3 (dépôt `koklo`) ; CDC §9.4, §9.5 ([[vision]])
  - Note : Réécrit le 2026-11-06 (refonte). Ancien libellé : « CLI : org, project, ticket, sprint » (`ticket start` prend un bail et crée la branche ; `ticket done`). Dépend désormais de TK-131, qui porte les procédures `ticket.start` et `ticket.release`.
  - À faire :
    - `koklo org list`, `project show`, `ticket list`, `ticket show TK-…`, `sprint show`
    - `koklo ticket start <TK>` : crée la branche locale, ouvre la session, récupère la tranche de spec figée (procédure `ticket.start`)
    - `koklo ticket release` : libère le ticket, la branche et le travail restent sur le poste
    - Plus de `ticket done` : Terminé suit la fusion de la PR (règle de transition de TK-129)
  - Critères d'acceptation :
    - [ ] Tests CLI contre une API de test (§19.1)
    - [ ] `ticket start` refusé hors de la portée du jeton (test)
- [ ] **[TK-69]** CLI : serveur MCP filtré par jeton, outils `ticket.*` et `gate.report`
  - Labels : pkg:cli, pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-66, TK-131
  - Source : `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §1, §3 ; `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.7 (dépôt `koklo`) ; CDC §9.7, §15 ([[vision]])
  - Note : Réécrit le 2026-11-06 (refonte). Ancien libellé : « CLI : serveur MCP filtré par token » (dépendait de TK-67, absorbé par TK-131).
  - À faire :
    - `koklo mcp` (stdio) avec le SDK MCP retenu par l'ADR de TK-131, enveloppant les mêmes procédures que le CLI
    - Outils `ticket.start`, `ticket.progress` (battement inclus), `gate.report`, `ticket.release` ; liste filtrée selon le jeton
    - Tout contenu issu de la spec ou d'un commentaire marqué comme donnée dans les sorties
    - Compatible avec `claude mcp add koklo -- koklo mcp`, `~/.codex/config.toml` et `.cursor/mcp.json`
  - Critères d'acceptation :
    - [ ] Un jeton de ticket ne voit pas les outils d'organisation (test)
    - [ ] Bout en bout : un agent prend son ticket par MCP, remonte deux étapes, la session apparaît dans l'onglet Sessions, puis libère le ticket (test)
    - [ ] Aucun outil MCP ne permet de fusionner, de valider au nom du client ni de poser une baseline (test)
- [ ] **[TK-68]** CLI : rules pull et rules show (instructions d'agent)
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-66
  - Source : CDC §9.7, §11.5 ([[vision]]) ; `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.7 (dépôt `koklo`)
  - Note : Gardé le 2026-11-06 (refonte) : instructions d'agent en local.
  - À faire :
    - Génère `AGENTS.md` et `CLAUDE.md` : workflow, scope actif, interdits (fusionner une PR, valider au nom du client, poser une baseline, lire un autre ticket que le sien, utiliser les clés d'IA de l'organisation)
  - Critères d'acceptation :
    - [ ] Fichiers générés identiques à une fixture pour un ticket donné
- [ ] **[TK-82]** CLI : rules pull branché sur le catalogue
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-71, TK-68
  - Source : CDC §11.5 ([[vision]])
  - Note : Gardé le 2026-11-06 (refonte) : indépendant de l'exécution.
  - À faire :
    - `rules pull` matérialise aussi `biome.json` et les règles composées
  - Critères d'acceptation :
    - [ ] Fixture par profil
- [ ] **[TK-81]** CLI : koklo doctor
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-65, TK-69
  - Source : CDC §9.5 ; annexe C incident 28 ([[vision]]) ; `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §1 (dépôt `koklo`)
  - Note : Réécrit le 2026-11-06 (refonte, doctor seul). Ancien libellé : « CLI : koklo deliver et doctor » (dépendait de TK-78 et TK-80). `deliver` est une boucle autonome, contraire à la décision du 06/11.
  - À faire :
    - `koklo doctor` : diagnostique l'authentification persistante (incident 28), le contexte résolu et le serveur MCP déclaré, sans écriture
    - Ne pas livrer `deliver run/status/pause/resume/triage` ni le mode service systemd
  - Critères d'acceptation :
    - [ ] `koklo doctor --json` signale une session expirée et un contexte absent (tests)
    - [ ] `koklo schema --json` ne liste aucune commande `deliver`

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche pour chaque écran touché
- [ ] axe sans violation sur chaque écran touché

## 🚧 Risks
- Aucun `apps/cli` ni dépendance `@modelcontextprotocol` aujourd'hui : CLI et MCP sont absents de bout en bout (effort L), cœur de la phase.
- Les baux (`Lease`, `heartbeatAt`) se réutilisent, mais il manque l'outil, le poste, les étapes et la tranche ; le modèle `AgentSession` est à créer.
- Retrait du titulaire « runner » : les lignes `runner` du journal immuable doivent rester lisibles.
- `npm install -g @koklo/cli` n'est possible qu'après TK-70, bloqué par H-15 (sprint 034) : d'ici là, installation depuis le dépôt.
