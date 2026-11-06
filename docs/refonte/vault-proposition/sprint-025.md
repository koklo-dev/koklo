---
tags: [sprint/025, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 025 — Refonte : Architecture

## 🎯 Sprint Goal
L'agent propose l'architecture depuis le fonctionnel et les données. L'équipe relit et valide un schéma en couches, des décisions argumentées, des flux en séquence et un document en sections ; le client lit et commente.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations validées par Brice le 05/11/2026 (dépôt `koklo`) : `docs/refonte/passations/10-lot-7-architecture-passation.md`, corrigée par `12-lot-8-technique-passation.md` §8 ; `07-principe-listes-longues.md`, `11-principe-creer-modifier.md`. Lire « N/7 » pour « N/6 ».
- Sprint prérequis : 024 (TK-109 validation des données ; TK-108 lecteur de diagramme ; TK-110 vue des zones et mini-carte, réutilisées par le schéma).
- Question B6 (vue d'ensemble en sections) : appliquée, ne bloque pas.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-111]** Lot 7a · Architecture : formats, Mermaid, états, Document (`SpecDocument`), Composants
  - Labels : pkg:api, pkg:worker, pkg:contract, pkg:web, pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-109
  - Source : `docs/refonte/passations/10-lot-7-architecture-passation.md` §1 à §4.3, §6, `12-lot-8-technique-passation.md` §8.1, `11-principe-creer-modifier.md` §3 (Composant) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/13-Lot7Architecture.html` (Prêt, Génération, Relecture ; onglets Document et Composants ; Volume réel)
  - À faire :
    - Formats `architecture/components/<slug>.yaml`, `actors.yaml`, `flows/<P-id>.yaml`, `adr/ADR-nnn-<slug>.md`, `_zones.yaml` (mêmes identifiants que `data/_zones.yaml`) ; document en sections `architecture/overview/NN-<slug>.md` (B6) : `spec-scaffold.ts` n'écrit plus `architecture/overview.md`. Identifiants `P-`, `C-`, `ADR-` dans `packages/schema/src/entities/ids.ts`.
    - Génération de `architecture/schema.mmd` et `flows/<P-id>.mmd` dans le même commit que chaque `specBatch.submit`.
    - `spec.architecture.checks()` : avertissements (table sans propriétaire, fonctionnalité non servie, parcours sans flux, cycle synchrone), à partir de `packages/schema/src/rules/index.ts` et `packages/domain/src/dependency-graph.ts`.
    - `ai.proposeDeliverable` `'architecture'` (propositions `component`, `flow`, `adr`, `doc_section`), génération par lots, relecture groupée par type dès 30 propositions ; options du bouton commun selon 14 §3.
    - Route `/projects/[id]/spec/architecture`, en-tête, états Prêt, Génération, Relecture.
    - Onglet Document : `SpecDocument` dans la disposition de l'espace Idée (12 §8.1 : colonne Sections 264 px, centre 680 px, colonne Agent sans conversation) ; `spec.architecture.document()`.
    - Onglet Composants : tableau en 1.1 (pages de 50), `spec.architecture.components.list` ; formulaire `SpecItemSheet` Composant.
  - Critères d'acceptation :
    - [ ] États Prêt, Génération et Relecture (groupée par type, Relecture devant les onglets, équipe seulement) conformes à la planche.
    - [ ] Composant invalide → proposition écartée ; références vérifiées à l'enregistrement.
    - [ ] Vérifications d'architecture (§1) affichées en relecture, sans blocage.
    - [ ] Onglet Document conforme à 12 §8.1 (sections, statuts, légende collée en bas, proposition de section).
    - [ ] « Nouveau composant » et « Modifier » ouvrent `SpecItemSheet`.
    - [ ] Droits côté serveur (10 §7) : proposer, relire et modifier réservés à owner, admin et développeur ; YAML / Mermaid jamais renvoyés au client ni au business (test 403).
    - [ ] Avec `pnpm seed:large` : liste des composants fluide, recherche sur des éléments non chargés, lien direct hors de la première page, pied de liste capturé.
    - [ ] Captures : chaque état × onglets Document et Composants, clair, sombre, 375 px ; axe sans violation.
  - Questions : B6 (appliquée : sections `architecture/overview/NN-*.md`).
- [ ] **[TK-112]** Lot 7b · Architecture : schéma en couches, flux en séquence
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-111, TK-110
  - Source : `docs/refonte/passations/10-lot-7-architecture-passation.md` §4.1, §4.5, §8, `12-lot-8-technique-passation.md` §8.2, `11-principe-creer-modifier.md` §3 (Flux) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/13-Lot7Architecture.html` (Liste · équipe : Schéma, vue des zones, zone ouverte, zoom 50 % ; Flux ; Volume réel)
  - À faire :
    - Onglet Schéma : lecteur du lot 6 (TK-108), vue des zones au-delà de 25 composants et mini-carte (TK-110), « Aller à un composant… » (`/`) via `spec.architecture.zones`, `.zone`, `.search`.
    - Zone ouverte : 4 couches (Utilisateurs, Applications, Services, Données et services externes), formes par type, liens étiquetés, asynchrone en pointillés, composant d'une autre zone estompé qui ouvre l'autre zone.
    - Fiche du composant : Fiche · YAML · Mermaid (équipe) ; glisser → `spec.architecture.layout.save` (`architecture/_layout.yaml`, sans relecture).
    - Onglet Flux : liste, diagramme de séquence (appels, retours, bloc `alt`, séparateur), sélecteur Diagramme · YAML · Mermaid (12 §8.2) ; formulaire `SpecItemSheet` Flux.
    - Alternatives textuelles : onglet Composants, nœuds en `button`, séquence `role="img"` + `details` « Lire les messages ».
  - Critères d'acceptation :
    - [ ] Schéma en couches avec formes par type, liens étiquetés et asynchrones, vue des zones, zone voisine estompée, zoom, niveau de détail, mini-carte, Fiche / YAML / Mermaid.
    - [ ] Diagramme de séquence avec retours, bloc alt et séparateur ; Mermaid généré ; alternative textuelle.
    - [ ] Un parcours sans flux est signalé dans la relecture.
    - [ ] Types de composant toujours écrits, jamais la seule couleur ou forme ; texte brut pour toute sortie du modèle.
    - [ ] Droits côté serveur : glisser (`layout.save`) refusé au designer, au client et au business (test 403).
    - [ ] Avec `pnpm seed:large` : liste des flux fluide, recherche sur des éléments non chargés.
    - [ ] Captures : vue des zones, zone ouverte, zoom 50 %, flux, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-113]** Lot 7c · Architecture : décisions, validation, À revoir, vue client
  - Labels : pkg:web, pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-112
  - Source : `docs/refonte/passations/10-lot-7-architecture-passation.md` §3 (À revoir, Vue client), §4.4, §5, §7, `11-principe-creer-modifier.md` §3 (Décision) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/13-Lot7Architecture.html` (Liste · équipe : Décisions ; À revoir ; Vue client)
  - À faire :
    - Onglet Décisions : liste (recherche, filtres Statut / Composant / Date, barre de compte), fiche (Contexte, Décision, Conséquences, Alternatives écartées, encadré « Remplacée par … ») ; `spec.architecture.adr.list`, `.adr.byId` ; formulaire `SpecItemSheet` Décision.
    - « Valider l'architecture » (owner, admin, développeur) : validation `deliverable` sur le commit courant ; 4 Technique passe « Prêt » ; compteur Spec « 3/7 ».
    - État À revoir (impact amont depuis les lots 5 et 6) : `InlineAlert` avec les éléments concernés, contours ambre dans le schéma, « Voir les changements », « Proposer les mises à jour ».
    - Vue client : bandeau « Lecture seule », fiches « En clair », « Commenter » sur un composant, une décision ou un flux.
  - Critères d'acceptation :
    - [ ] Décisions avec statuts (dont Remplacée), conséquences et alternatives ; vue client « En clair ».
    - [ ] Impact amont « À revoir » depuis les lots 5 et 6 ; validation équipe liée au commit, déblocage de Technique.
    - [ ] Statuts de décision toujours écrits, jamais la seule couleur.
    - [ ] Droits côté serveur (10 §7) : valider réservé à owner, admin et développeur ; client et business lisent et commentent seulement ; YAML / Mermaid jamais renvoyés au client (tests 403).
    - [ ] Avec `pnpm seed:large` : liste des décisions fluide, filtres côté serveur, lien direct hors de la première page.
    - [ ] Captures : Décisions, À revoir, Vue client, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-114]** Corrections des lots 2 à 8 : marges des encadrés, en-têtes des livrables
  - Labels : pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-111
  - Source : `docs/refonte/passations/12-lot-8-technique-passation.md` §8.3, §8.4 (dépôt `koklo`) ; maquettes `docs/refonte/maquettes/06-Lot2Idee.html` (colonne des pages, page proposée), `10-Lot5Fonctionnel.html`, `11-Lot6Donnees.html`, `13-Lot7Architecture.html` (en-têtes)
  - À faire :
    - Lot 2 : colonne des pages à 264 px et encadré « Page proposée par l'agent » avec les marges de 12 §8.1 (vérifier ce que TK-89 a déjà appliqué).
    - Règle générale : un encadré pointillé `--primary` n'est jamais collé au bord de son conteneur ni aux voisins (≥ 10 px vertical, ≥ 2 px latéral en plus du padding).
    - En-têtes des lots 5, 6, 7 : résumé sous le titre sur une ligne entière, actions alignées à droite sur la ligne du titre, libellés courts, raison d'un bouton désactivé dans le résumé.
  - Critères d'acceptation :
    - [ ] Corrections §8.3 et §8.4 appliquées aux lots 2, 5, 6, 7.
    - [ ] Captures avant / après des écrans touchés en clair, sombre et 375 px ; axe sans violation.

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px de chaque écran touché, comparées à la planche
- [ ] axe sans violation sur chaque état
- [ ] Listes vérifiées avec `pnpm seed:large`

## 🚧 Risks
- Identifiants `P-`, `C-`, `ADR-` absents de `ids.ts` ; `spec-scaffold.ts` crée seulement `architecture/adr/` vide.
- Document en sections contraire à l'existant : `spec-scaffold.ts` écrit `architecture/overview.md`.
- Le schéma réutilise le lecteur du lot 6 : tout retard de TK-108 et TK-110 le retarde.
- Validation par l'équipe et « À revoir » contraires à l'existant, comme au lot 6.
