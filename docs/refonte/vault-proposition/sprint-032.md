---
tags: [sprint/032, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 032 — Refonte : Tickets

## 🎯 Sprint Goal
Depuis `baseline-0`, l'agent propose un découpage en tickets que l'équipe range en sprints ; le sprint en cours se suit en kanban à règles de transition et en chronologie, avec un panneau par ticket. Les jetons sont en place pour les agents locaux, et Koklo n'embarque plus aucun code d'exécution d'agent.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations validées par Brice le 06/11/2026 : `docs/refonte/passations/18-lot-12-tickets-passation.md` et `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` (dépôt `koklo`). Décision du 06/11 : Koklo n'exécute aucun agent, les agents tournent sur les postes et remontent par MCP / CLI, la CI fait foi, la revue humaine est obligatoire.
- Sprints prérequis : 031 (Baseline 0 posée, TK-127) ; 019 (projet explicite, TK-96).
- Questions ouvertes liées : A2 (durée du jeton d'agent) à poser au démarrage de TK-63, lecture prudente 12 h révocable.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-128]** Lot 12a · Découpage depuis la baseline, sprints, backlog
  - Labels : pkg:api, pkg:contract, pkg:web, pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-127
  - Source : `docs/refonte/passations/18-lot-12-tickets-passation.md` §1, §2.6, §4 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/23-Lot12Tickets.html` (Découpage ; onglets Backlog et Sprints ; modale Nouveau sprint ; Volume réel)
  - Note : Absorbe TK-57 (API : proposition de découpage en tickets, sprint 011) et TK-61 (Web : revue de la proposition de tickets, sprint 011).
  - À faire :
    - `tickets.split.propose({ projectId, from: 'baseline-0' | 'backlog' })` avec la clé d'IA de l'organisation (usage « Découpage en tickets ») ; un ticket par critère ou groupe cohérent, un paquet par ticket, dépendances, estimation (repris de TK-57) ; aucun ticket créé sans validation humaine
    - Écran de découpage (ouvert par « Générer les tickets du premier sprint » ou « Découper le sprint suivant ») : bandeau, groupes par fonctionnalité + « Socle technique », case à cocher, tranche de spec en puces mono, « Agent local » ou « Humain · <nom> » (un ticket qui touche des secrets ou un service externe va à un humain), paquet, points ; colonne Sprint 1 (objectif, dates, jauge charge / capacité ambre au-delà, notes, « Créer le sprint SP-1 »)
    - `sprint.create({ goal, start, end, capacity, ticketKeys })`, `sprint.list`, `sprint.close` : un seul sprint en cours, les suivants planifiés, à la clôture les tickets non terminés proposés pour le suivant ; reprendre `apps/api/src/sprint/*` et `contract-tickets.ts`
    - Onglet Backlog (ordonné par dépendances, pages de 50), onglet Sprints (pleine largeur, « Nouveau sprint »), modale Nouveau sprint (fond flouté, capacité = vitesse du sprint précédent, modifiable)
    - Migration tickets et sprints : points, début et échéance, raison de blocage, réalisé par Agent / Humain (depuis `assigneeKind`), paquet libre à la place de l'enum `TicketPackage`, capacité de sprint ; `estimateHours` conservé, tickets sans sprint → Backlog
    - Sous le projet : `/projects/[id]/tickets`, `projectId` explicite (TK-96) ; badge « À relire » pendant le découpage ; les 7 livrables affichent « Figé » dans la barre latérale
  - Critères d'acceptation :
    - [ ] La proposition seule ne crée aucun ticket (test, repris de TK-57)
    - [ ] Découpage : l'équipe valide, ajuste et range en sprints (repris de TK-61) ; modale Nouveau sprint ; onglets Backlog et Sprints
    - [ ] Découpage depuis `baseline-0` refusé tant que la baseline n'est pas posée (test)
    - [ ] Un seul sprint en cours, vérifié côté serveur (test)
    - [ ] Chaque vue reste fluide sur `pnpm seed:large` (500 tickets) : 60 i/s au défilement, première page < 300 ms côté serveur
    - [ ] Recherche et filtres testés sur des éléments non chargés ; lien direct vers un ticket hors de la première page ; états de pied de liste capturés
    - [ ] Captures : découpage, onglets et modale, clair, sombre, 375 px, comparées à la planche ; axe sans violation
- [ ] **[TK-129]** Lot 12b · Kanban, règles de transition, chronologie, panneau du ticket
  - Labels : pkg:web, pkg:api, pkg:domain, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-128
  - Source : `docs/refonte/passations/18-lot-12-tickets-passation.md` §2.1 à §2.5 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/23-Lot12Tickets.html` (Sprint en cours : Colonnes, Chronologie, glisser en cours, panneau ouvert)
  - À faire :
    - En-tête « Sprint SP-1 en cours » (résumé, « Proposer avec l'agent », « Nouveau sprint », « Nouveau ticket » en `SpecItemSheet` formulaire `ticket` via `ticket.create` / `ticket.update`) ; bandeau du sprint et bande des 10 jours ouvrés avec le nombre d'échéances
    - Filtres Tous · Agents · Humains · Mes tickets, sélecteur Colonnes / Chronologie ; 5 colonnes (À faire, En cours, En revue, Bloqué, Terminé), largeur min. 292 px, écart 16 px, défilement horizontal avec `scroll-snap`, 30 cartes puis chargement en défilant par colonne, compteur par colonne
    - Carte : clé, points, avatar, titre, tranche de spec (3 puces max.), échéance (retard en rouge), session, PR ou raison du blocage ; étiquettes à la ligne, jamais de débordement ; reprendre `kanban-{page,view,column,card}.tsx` et `lib/use-ticket-move.ts`
    - Glisser-déposer natif (`dragstart` / `dragover` / `drop`), carte d'origine à 40 % en pointillés, indicateur de dépôt (violet « Déposer TK-108 ici » ou rouge « Dépôt refusé » + raison), mise à jour non optimiste
    - Règles de transition communes au glisser et au menu de statut, dans `packages/domain/src/ticket-transitions.ts` et `ticket.service.ts:145` : Terminé seulement si la PR est fusionnée, En revue seulement s'il existe une PR, En cours pour un ticket d'agent = message « à prendre en local : koklo ticket start TK-108 », Bloqué = raison demandée ; `ticket.transition({ key, to })` renvoie 409 avec la raison
    - Chronologie : grille 280 px + 10 jours, aujourd'hui surligné, barres colorées par statut, retard en rouge, légende
    - Panneau 620 px calé sur la fenêtre (`position: fixed; height: 100vh`), onglets Spec, Session, Pull request, Historique ; pied avec menu de statut (`aria-haspopup="listbox"`, statut impossible grisé avec `block` et la raison) ; l'action « Approuver et fusionner » est branchée par TK-79
  - Critères d'acceptation :
    - [ ] Glisser-déposer avec indicateur de dépôt et règles ; menu de statut identique ; panneau à hauteur de fenêtre
    - [ ] Dates : bande des jours, échéance sur les cartes, retard en rouge, Chronologie
    - [ ] Colonnes ≥ 292 px, défilement horizontal, cartes sans débordement
    - [ ] Passage à Terminé refusé côté serveur sans PR fusionnée (test 409) ; glisser vers En cours ne lance aucun agent
    - [ ] Chaque colonne reste fluide sur `pnpm seed:large` ; lien direct vers un ticket hors de la première page ; états de pied de colonne capturés
    - [ ] Captures : chaque état et onglet, panneau ouvert, glisser en cours, clair, sombre, 375 px, comparées à la planche ; axe sans violation
- [ ] **[TK-63]** Base : jetons (utilisateur, CLI, agent limité au ticket), postes
  - Labels : pkg:db, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-28
  - Source : `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §1, §3 ; `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.7 (dépôt `koklo`) ; `docs/refonte/ecarts.md` (migration « Sessions et jetons ») ; maquette `docs/refonte/maquettes/24-Lot13Reglages.html` (Agents locaux, pour les champs d'un poste)
  - Note : Réécrit le 2026-11-06 (refonte). Ancien libellé : « Base : tokens (utilisateur, agent, runner, CI, admin) ».
  - À faire :
    - Table `tokens` : type (utilisateur, CLI, agent), portée (organisation, projet, ticket), empreinte hachée, expiration, révocation, compteurs de quota ; plus de type « runner »
    - Jeton d'agent : portée ticket obligatoire, écriture sur sa seule branche, expiration 12 h, révocable
    - Table `agent_devices` (poste, membre, outil déclaré, dernière remontée, révocation) pour les postes connectés
    - Lien `AuditLog.tokenId` (déjà prévu) vers le jeton
  - Critères d'acceptation :
    - [ ] Aucune colonne ne contient un jeton en clair (test)
    - [ ] Migration réversible testée
    - [ ] Aucun type « runner » ; un jeton d'agent sans portée ticket est refusé par la base (test)
  - Questions : A2 (lecture prudente : 12 h, révocable)
- [ ] **[TK-64]** API : émission des jetons, portées et flux device
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-63, TK-23
  - Source : `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §1 ; `docs/refonte/passations/19-lot-13-reglages-passation.md` §2.7 (dépôt `koklo`) ; CDC §9.1, §9.3, §9.8 ([[vision]])
  - Note : Gardé, ajusté le 2026-11-06 (refonte) : un jeton d'agent ne fusionne jamais et ne lit que son ticket.
  - À faire :
    - Émission, rotation, révocation immédiate, limites de débit par jeton ; flux « device » pour le CLI (`koklo login` ouvre le navigateur)
    - Garde serveur sur chaque procédure : un jeton d'agent ne fusionne pas une PR, ne valide pas au nom du client, ne pose pas de baseline, ne lit que son ticket et n'appelle aucune procédure `ai.*` (clés d'IA de l'organisation)
  - Critères d'acceptation :
    - [ ] Un jeton d'agent ne peut ni fusionner ni sortir de son ticket ; il ne lit que son ticket (test)
    - [ ] Un jeton d'agent ne valide jamais au nom du client, ne pose pas de baseline et n'utilise jamais les clés d'IA de l'organisation (tests 403)
    - [ ] Un jeton révoqué est refusé immédiatement
    - [ ] Test d'intégration du flux device complet
  - Questions : A2
- [ ] **[TK-130]** Retrait de l'exécution d'agents par Koklo, ADR 0014 remplacée
  - Labels : pkg:delivery, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : —
  - Source : `docs/refonte/passations/17-decisions-2026-11-06-agents-locaux.md` §1 (dépôt `koklo`) ; `docs/refonte/ecarts.md` (« Ce qui doit être retiré ou remplacé »)
  - À faire :
    - Supprimer `packages/delivery/src/claude-code/*`, `agent-{runtime,request,tools,credential,budget,output,errors}.ts`, `testing/*` et leurs tests (aucune app n'en dépend)
    - Supprimer le runner et le triage autonomes (`packages/delivery/src/run*.ts`, `quota-*.ts`) ; garder la machine d'étapes si elle sert à `ticket.progress`
    - ADR de la décision du 06/11 ; `docs/adr/0014-agent-runtime.md` passe « remplacée »
  - Critères d'acceptation :
    - [ ] Aucun code de Koklo ne lance un agent de code (recherche dans le dépôt, build et tests verts)
    - [ ] ADR 0014 marquée « remplacée », la nouvelle ADR cite la décision du 06/11

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche pour chaque écran touché
- [ ] axe sans violation sur chaque écran touché

## 🚧 Risks
- Kanban encore lié au projet implicite (`OldestProjectContext`, `apps/web/src/app/kanban/page.tsx`) : TK-96 doit être livré.
- On peut aujourd'hui passer un ticket à Terminé sans fusion : la règle est dans `ticket-transitions.ts` et `ticket.service.ts:145`.
- L'enum `TicketPackage` porte les paquets de Koklo, inadaptée aux projets clients ; échéances absentes (`Sprint.startsOn/endsOn` seulement).
- Aucune table de jetons (`AuditLog.tokenId` prévu seulement) : TK-63 et TK-64 sont à concevoir avant tout outil MCP.
- L'onglet Pull request du panneau (TK-129) précède la fusion humaine `pr.approveAndMerge` (TK-79, sprint 034).
