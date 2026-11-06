# Refonte UI · Lot 12 · Tickets : passation à l'agent dev

> Validé par Brice le 06/11/2026 après recette visuelle.
> Maquette : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 12 · Tickets**. Sélecteurs de maquette : Découpage, Sprint en cours, Vue client ; Démo / **Volume réel**.
> À lire avant : **`decisions-2026-11-06-agents-locaux.md`** (les agents tournent en local et remontent par MCP), `lot-11-baseline-passation.md`, `principe-proposer-avec-agent.md`, `principe-creer-modifier.md`, conception v0.6 §8 et §22. Remplace `design/screens/S-kanban.md`.

Route `/projects/[id]/tickets`. Le projet est en phase Itérations : dans la barre latérale les 6 livrables affichent « Figé », Baseline 0 « Posée », Tickets un badge (« À relire » pendant le découpage, sinon l'id du sprint en cours) ; carte de phase « Itérations · 4 sur 4 ».

## 1. Découpage depuis la baseline

Ouvert par « Générer les tickets du premier sprint » (lot 11) ou par le bouton agent (« Découper le sprint suivant »). Le découpage est un travail en ligne (clé de l'organisation).
- Bandeau : « Découpage proposé par l'agent depuis baseline-0. 13 tickets, chacun avec sa tranche de spec… Cochez ceux du sprint 1 ; les autres restent au backlog. »
- Groupes par fonctionnalité (+ « Socle technique ») : case à cocher (sprint 1), titre, **tranche de spec** en puces mono, **Agent local** ou **Humain · <nom>** (un ticket qui touche des secrets ou un service externe va à un humain), paquet, points.
- Colonne Sprint 1 : objectif (champ), dates, **jauge charge / capacité** (ambre au-delà), notes (ordre imposé par les dépendances, ticket confié à un humain, fonctionnalité laissée au backlog), **Créer le sprint SP-1**.

## 2. Sprint en cours

En-tête : statut « Sprint SP-1 en cours », résumé (tickets, points terminés, sessions actives, sans nouvelles), actions **Proposer avec l'agent** · **Nouveau sprint** · **Nouveau ticket** (`SpecItemSheet`, formulaire `ticket` : titre, tranche de spec, paquet, réalisé par, estimation, sprint). Onglets : **Sprint SP-1**, **Backlog**, **Sprints**, **Sessions d'agent**.

### 2.1 Bandeau du sprint et dates
SP-1, objectif, « lun. 9 → ven. 20 nov. · encore 5 jours ouvrés », jauge des points, « aujourd'hui ven. 13 ». **Bande des 10 jours ouvrés** : jour courant en primaire, jours passés estompés, autres en carte ; sous chaque jour le nombre d'échéances.

### 2.2 Filtres et affichage
Pastilles Tous · Agents · Humains · Mes tickets ; à droite « 2 agents connectés · postes de Moussa et d'Awa » (pendant un glisser : rappel des règles) ; sélecteur **Colonnes / Chronologie**.

### 2.3 Colonnes (kanban)
- 5 colonnes : À faire, En cours, En revue, Bloqué, Terminé (Backlog dans son onglet ; Annulé masqué). **Largeur min. 292 px, écart 16 px, défilement horizontal** (`overflow-x: auto`, `scroll-snap`) quand l'écran est trop étroit. Au-delà de 6 cartes (4 pour Terminé) : « Afficher N de plus ».
- **Carte** (padding 14 × 16, rayon 12, gap 10) : clé mono, points, avatar (IA primaire ou initiales) ; titre ; tranche de spec (3 puces max.) ; **échéance** (« Prévu mar. 17 », « Fini mer. 11 », rouge « En retard · prévu jeu. 12 ») ; selon le cas : session (« Agent local · étape 4 sur 7 · il y a 2 min » primaire, « Agent local · sans nouvelles depuis 25 min » ambre `wifi_off`, « Session terminée · revue humaine »), pull request (fusionnée, CI verte, 1 écart visuel, CI en échec), raison du blocage. Les étiquettes passent à la ligne, jamais de débordement.
- **Glisser-déposer** (`draggable`, `dragstart` / `dragover` / `drop`, clé dans `dataTransfer`) : carte d'origine à 40 % en pointillés ; **indicateur de dépôt** en tête de la colonne survolée (84 px, pointillé 2 px) : violet « Déposer TK-108 ici » + conséquence, ou rouge « Dépôt refusé » + raison. Mise à jour non optimiste ; message de confirmation.
- **Règles de déplacement** (communes au glisser-déposer et au menu de statut) : vers **Terminé** seulement si la PR est fusionnée ; vers **En revue** seulement s'il existe une PR ; vers **En cours** pour un ticket d'agent : « à prendre en local : koklo ticket start TK-108 » ; vers **Bloqué** : la raison est demandée.

### 2.4 Chronologie
Grille 280 px + 10 jours (min. 56 px) ; colonne d'aujourd'hui surlignée, séparation entre les deux semaines ; une ligne par ticket (clé, titre, avatar) ; barre du début à l'échéance, couleur du statut (Terminé vert, En cours primaire, En revue ambre, Bloqué ambre pointillé, À faire contour) ; **en retard en rouge** ; clic = ouvrir le ticket ; légende.

### 2.5 Panneau d'un ticket
Panneau latéral 620 px **calé sur la fenêtre** (`position: fixed; height: 100vh`), onglets **Spec** (tranche figée sur baseline-0, critères avec leur scénario), **Session**, **Pull request**, **Historique**. Onglet par défaut : Pull request si une PR existe, sinon Session.
- **Session** : encadré « où tourne l'agent » : « Agent local · Claude Code sur le poste de Moussa · il y a 2 min » + « Connecté au MCP Koklo… les contrôles qui font foi tournent en CI » (ambre si sans nouvelles). Ticket d'agent pas encore pris : « Pas encore pris · Koklo n'exécute aucun agent… » + bloc **Prendre ce ticket sur votre poste** (`koklo ticket start TK-108`, Copier, « ou demandez à votre agent : « prends le ticket TK-108 » »). Ticket humain : « Ticket confié à Moussa ». Étapes du workflow avec leur acteur (Agent, CI, Humain), journal, « jetons consommés par l'outil de Moussa, jamais par la clé de l'organisation ».
- **Pull request** : contrôles (CI ; capture différente d'un écran validé = Bloquant, bouton orange « Comparer avec l'écran validé »), revue humaine obligatoire (« Aucun agent ne peut approuver »), Approuver et fusionner · Demander des changements.
- **Pied** : **menu de statut** (`aria-haspopup="listbox"`) : rond de couleur + « Statut » + statut actuel ; liste des 5 statuts avec une ligne d'explication, statut actuel coché, statut impossible grisé avec `block` et la raison. À droite : Ouvrir la PR (si PR) ; pour une session active : Libérer le ticket · Ouvrir la branche.

### 2.6 Onglets Backlog, Sprints, Sessions
- **Backlog** : liste ordonnée par dépendances (clé, titre, tranche, agent / humain, points), pages de 50.
- **Sprints** (pleine largeur) : un sprint par ligne (id, objectif, dates, nb de tickets, En cours / Planifié, jauge, points) + **Nouveau sprint**.
- **Nouveau sprint** : modale centrée, fond flouté : objectif, début, fin, capacité (vitesse du sprint précédent, modifiable), tickets du backlog à cocher avec jauge charge / capacité, « Planifier SP-2 ». Un seul sprint en cours ; les suivants sont planifiés ; à la clôture, les tickets non terminés sont proposés pour le suivant.
- **Sessions d'agent** : intro (agents sur les postes, remontée par MCP, Koklo n'exécute rien) ; carte par session : clé, titre, état (En cours, Sans nouvelles, En attente, À reprendre), 7 barres d'étapes, étape, outil · poste · dernière remontée.

## 3. Vue client (pleine largeur)

- **Feuille de route** en 4 étapes : Sprint 1 (en cours), Sprint 2 (planifié), Sprints 3 et 4 (à planifier), Recette et mise en ligne (estimation).
- À gauche, le sprint en cours **par fonctionnalité**, en mots simples : Prête à essayer, En vérification, En cours, En attente, À venir. Aucune clé, PR, branche ni agent.
- À droite, **Sprint 2** (dates, objectif, « ce que vous pourrez essayer à la fin de ce sprint ») et **Plus tard** (fonctionnalités et mois prévus, « hors périmètre » ; « dates à partir du sprint 3 : estimations de l'équipe »).

## 4. Contrat

| Procédure | Usage |
|---|---|
| `tickets.split.propose({ projectId, from: 'baseline-0' \| 'backlog' })` | découpage (clé de l'organisation) |
| `sprint.create({ goal, start, end, capacity, ticketKeys })`, `sprint.list`, `sprint.close` | sprints |
| `ticket.list({ sprintId \| backlog, cursor, limit })`, `ticket.byKey` | kanban, backlog, panneau |
| `ticket.transition({ key, to })` | glisser-déposer et menu ; 409 avec la raison si la règle refuse |
| `ticket.create` / `ticket.update` | SpecItemSheet `ticket` |
| `agentSession.list({ projectId })` | onglet Sessions, cartes |
| MCP / CLI : `ticket.start`, `ticket.progress`, `gate.report`, `ticket.release` | remontées des agents locaux (décision du 06/11) |
| `pr.approveAndMerge({ key })` | revue humaine (jamais un jeton d'agent) |

## 5. Critères d'acceptation
- [ ] Découpage, sprint en cours, vue client ; 4 onglets ; modale Nouveau sprint.
- [ ] Glisser-déposer avec indicateur de dépôt et règles ; menu de statut identique ; panneau à hauteur de fenêtre.
- [ ] Dates : bande des jours, échéance sur les cartes, retard en rouge, Chronologie.
- [ ] Aucun lancement d'agent côté serveur ; sessions alimentées par le MCP ; état « Sans nouvelles ».
- [ ] Colonnes ≥ 292 px, défilement horizontal, cartes sans débordement.
- [ ] Captures : chaque état et onglet, panneau ouvert, glisser en cours, clair, sombre, 375 px.

## 6. Tickets
```
- [ ] **[TK-?]** Lot 12a · Tickets : découpage depuis la baseline, sprints (création, modale, onglet), backlog. Réf. design/refonte/lot-12-tickets-passation.md §1, §2.6, §4. — dépend du lot 11
- [ ] **[TK-?]** Lot 12b · Tickets : kanban (cartes, glisser-déposer, indicateur, règles de transition, menu de statut), bande des jours, Chronologie, panneau du ticket. Réf. §2.1 à §2.5. — dépend de 12a
- [ ] **[TK-?]** Lot 12c · Agents locaux : outils MCP / CLI ticket.start, ticket.progress, gate.report, ticket.release, état « Sans nouvelles », onglet Sessions ; vue client et feuille de route. Réf. §2.5, §2.6, §3 et decisions-2026-11-06-agents-locaux.md. — dépend de 12b
```
