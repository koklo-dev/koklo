---
tags: [sprint/034, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 034 — Refonte : Réglages des agents, fusion humaine, sécurité en CI

## 🎯 Sprint Goal
Le propriétaire gère les installations GitHub, l'accès et les règles du projet, l'archivage et les postes d'agent (révocation) ; une PR ne se fusionne que par un humain, sous le check `koklo/policy` ; les contrôles de sécurité et les scénarios d'abus tournent en CI sur chaque PR ; le journal d'audit se consulte et s'exporte.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations validées par Brice le 06/11/2026 : `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.4, §2.5, §2.7 ; `docs/refonte/passations/21-lot-14-securite-passation.md` §0, §1.4, §3 ; `docs/refonte/passations/18-lot-12-tickets-passation.md` §2.5, §4 (dépôt `koklo`).
- Sprints prérequis : 019 (Réglages 13a, TK-97), 026 (livrable Sécurité, TK-117), 033 (agents locaux, TK-131 et TK-69).
- [ ] H-15 — Décision 8 (licence du CLI et du format) avant la publication npm (TK-70) ; TK-70 reste bloqué tant qu'elle n'est pas prise.
- [ ] H-16 (sprint 016) — Ajouter `koklo/policy` aux checks requis de `develop` une fois TK-79 livré.
- Questions ouvertes liées : A3 (TK-132), A8 (TK-133), A2 ; lecture prudente appliquée.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-132]** Lot 13c · GitHub, Accès et règles du projet, Agents locaux (postes, révocation)
  - Labels : pkg:web, pkg:api, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-97, TK-131
  - Source : `docs/refonte/passations/19-lot-13-reglages-passation.md` §1, §2.4, §2.5, §2.7, §3 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/24-Lot13Reglages.html` (Propriétaire, Développeur, Client ; sections GitHub, Accès et règles, Agents locaux)
  - À faire :
    - Section GitHub : `github.installations.list`, une carte par installation (Autorisée / « À réautoriser » en ambre), dépôts reliés (nom mono, rôle `spec` / `monorepo`, projet), « Installer sur un autre compte GitHub » ; reprendre `github-{page,installations,status,install-button}.tsx`
    - Section Accès et règles : `project.access.list`, `project.policies.update` (`projects.policies` en JSON) ; « Revue humaine avant toute fusion » et « Spec jamais fusionnée automatiquement » verrouillées (`lock`, « Imposé par Koklo ») ; « Bloquer une capture différente d'un écran validé » ; « Le client peut commenter les tickets » (désactivé par défaut) ; « Un ticket, un agent à la fois » ; règles appliquées côté serveur, pas seulement affichées
    - `project.archive` (propriétaire seulement, `projects.archived_at`) : lecture seule pour tous, dépôts non touchés, bouton rouge « Archiver… » avec confirmation
    - Section Agents locaux (MCP) : « Connecter votre agent » en 3 étapes (`npm install -g @koklo/cli`, `koklo login`, ajout du serveur MCP) avec onglets Claude Code (`claude mcp add koklo -- koklo mcp`), Codex (`~/.codex/config.toml`), Cursor (`.cursor/mcp.json`) et Copier ; encadré « Ce qu'un agent ne peut jamais faire »
    - Postes connectés : `agentDevice.list`, `agentDevice.revoke` (poste, outil · ticket · dernière remontée, état Actif / Sans nouvelles / Inactif) ; le développeur ne voit que son poste
    - Navigation par rôle (19 §1) : Accès et règles en lecture seule pour le développeur (bandeau `lock`), Agents locaux masqué pour le client
  - Critères d'acceptation :
    - [ ] Règles verrouillées impossibles à désactiver (test serveur) ; archivage réservé au propriétaire (403)
    - [ ] Agents locaux : instructions par outil, postes, révocation ; aucun agent n'utilise les clés de l'organisation
    - [ ] Un poste révoqué voit ses jetons refusés immédiatement (test)
    - [ ] Le développeur ne voit et ne révoque que son poste, vérifié côté serveur (test 403)
    - [ ] Navigation et accès selon le rôle, bandeau de lecture seule, 403 serveur
    - [ ] Captures : chaque section × rôle, clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : A3 (lecture prudente : « Le client peut commenter les tickets » désactivé par défaut) ; A2 (durée affichée du jeton : 12 h)
- [ ] **[TK-70]** Publication npm de @koklo/cli
  - Labels : pkg:cli, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-69
  - Source : CDC §16.1 (CLI), §16.2 (versionnement) ([[vision]]) ; `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.7 (dépôt `koklo`)
  - Note : Gardé le 2026-11-06 (refonte) : requis par le lot 13 §2.7 (`npm install -g @koklo/cli`). Bloqué par H-15 (licence) ; l'ancien label `pkg:infra` devient `pkg:cli`.
  - À faire :
    - Composant Release Please `cli` ; publication npm sur release
  - Critères d'acceptation :
    - [ ] Release de test publiée sur un tag de pré-version
- [ ] **[TK-79]** API : fusion par un humain seul et check `koklo/policy`
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-39, TK-71, TK-64, TK-129
  - Source : `docs/refonte/passations/18-lot-12-tickets-passation.md` §2.5, §4 ; `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §1.4 ; `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.5 (dépôt `koklo`) ; CDC §10.5, annexe C incidents 15, 16, 29 ([[vision]]) ; maquette `docs/refonte/maquettes/23-Lot12Tickets.html` (panneau, onglet Pull request)
  - Note : Réécrit le 2026-11-06 (refonte). Ancien libellé : « API : politique et merge serveur » (merge par le serveur après verdict d'agent). Le résultat R5 « mergé par le serveur sans intervention » est retiré. Dépend en plus de TK-64 (garde du jeton d'agent) et de TK-129 (onglet Pull request).
  - À faire :
    - `pr.approveAndMerge({ key })` : appelé par un membre humain seul, jamais par un jeton d'agent ; `GitProvider.mergePullRequest` (`packages/github/src/octokit-git-provider.ts`) inaccessible hors de ce chemin
    - Verrou de fusion par projet, relecture de l'état réel de la PR sous le verrou, fusion idempotente (une PR déjà fusionnée à la main est constatée)
    - Check `koklo/policy` publié sur chaque PR (`GitProvider.publishCheck`, jamais appelé aujourd'hui) : checks requis verts, revue humaine, règles du projet de TK-132 (revue humaine avant toute fusion, spec jamais fusionnée automatiquement, capture différente d'un écran validé bloquante)
    - Onglet Pull request du panneau (TK-129) : « Approuver et fusionner » · « Demander des changements », mention « Aucun agent ne peut approuver »
    - Retirer le verdict de review d'agent et la fusion automatique par le serveur
  - Critères d'acceptation :
    - [ ] Tests incidents 15 et 16
    - [ ] Aucune fusion sans approbation humaine ; un jeton d'agent qui appelle `pr.approveAndMerge` reçoit 403 (test)
    - [ ] `koklo/policy` publié sur chaque PR, en échec quand une règle du projet n'est pas tenue (test)
    - [ ] Captures de l'onglet Pull request (CI verte, en échec, écart visuel), clair, sombre, 375 px ; axe sans violation
- [ ] **[TK-133]** Lot 14c · Contrôles de sécurité et scénarios d'abus en CI, tickets sensibles, journal d'audit
  - Labels : pkg:api, pkg:rules, pkg:github, pkg:web, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-117, TK-131, TK-132
  - Source : `docs/refonte/passations/21-lot-14-securite-passation.md` §0, §1.2, §1.3, §1.4, §3, §4 (dépôt `koklo`) ; maquettes `docs/refonte/maquettes/15-Lot14Securite.html` (Exigences : « Une pull request ne fusionne pas si… ») et `docs/refonte/maquettes/24-Lot13Reglages.html` (Journal d'audit, Propriétaire)
  - À faire :
    - Deux contrôles CI sur chaque PR, publiés par `publishCheck` : « Sécurité · secrets, dépendances, analyse statique » et « Scénarios d'abus · F-xxx » (scénarios générés dans `quality/scenarios/abuse/` depuis la matrice des droits, 403 ou 404 attendu)
    - Refus de fusion si : secret, dépendance critique, faille haute en analyse statique, scénario d'abus en échec, opération sans permission, champ classé Personnelle ou Contact en clair dans un journal
    - Tickets sensibles (connexion, paiement, export, droits) : règle appliquée sur `Ticket.sensitivity` (`packages/domain/src/ticket-sensitivity.ts`) : confiés à un humain ou soumis à deux relectures
    - Section Réglages › Organisation › Journal d'audit (propriétaire) : filtres Tout, Accès et rôles, Clés et secrets, Données, Agents ; une ligne par action ; « Exporter » (CSV) ; `audit.list({ orgId, kind, cursor })`, `audit.export` ; portée explicite (aujourd'hui « plus ancien projet »)
    - Événements tracés : fournisseur d'IA ajouté / retiré, rôle modifié, invitation, baseline soumise / posée, export du fichier clients, poste d'agent connecté / révoqué, secret renouvelé ; conservation un an, purge compatible avec les triggers immuables
  - Critères d'acceptation :
    - [ ] Matrice des droits → scénarios d'abus en CI ; gates sécurité sur les PR
    - [ ] Journal d'audit non modifiable (test : mise à jour et suppression refusées)
    - [ ] Journal d'audit et export réservés au propriétaire côté serveur (test 403)
    - [ ] Un ticket sensible n'est jamais confié à un agent sans humain ou seconde relecture (test)
    - [ ] Journal fluide sur le jeu de charge ; filtres testés sur des lignes non chargées ; états de pied de liste capturés
    - [ ] Captures : Journal d'audit × filtres, onglet Pull request avec les deux contrôles, clair, sombre, 375 px, comparées aux planches ; axe sans violation
  - Questions : A8 (lecture prudente : outils portés par le cahier technique du projet ; pour Koklo lui-même, ceux déjà en place, Trivy)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche pour chaque écran touché
- [ ] axe sans violation sur chaque écran touché

## 🚧 Risks
- Accès et règles du projet absents : les règles sont à appliquer côté serveur, pas seulement à afficher.
- La fusion doit être techniquement interdite à un jeton d'agent : `GitProvider.mergePullRequest` existe déjà dans `packages/github`.
- `GitProvider.publishCheck` n'est jamais appelé ; `Ticket.sensitivity` existe mais aucune règle ne l'applique.
- Journal d'audit : triggers immuables (migration `20261030090000_tickets_sprints_leases`) à concilier avec la purge à un an ; `audit.list` porte encore sur le plus ancien projet.
- TK-70 reste bloqué par H-15 : la commande `npm install -g @koklo/cli` affichée par TK-132 ne fonctionne qu'après sa levée.
