---
tags: [sprint/024, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 024 — Refonte : Données

## 🎯 Sprint Goal
Les dépôts de spec existants sont migrés au format v2. L'agent propose le modèle de données, affiché en diagramme avec des zones et des jeux d'exemple ; l'équipe le relit et le valide, le client le lit et le commente.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passations validées par Brice le 05/11/2026 (dépôt `koklo`) : `docs/refonte/passations/09-lot-6-donnees-passation.md`, `08-lots-5-6-volume-reel-passation.md` §2 et §3, `07-principe-listes-longues.md`, `11-principe-creer-modifier.md`. Lire « N/7 » pour « N/6 ».
- Sprints prérequis : 022 et 023 (socle de la spec, Fonctionnel complet, TK-104).
- Questions ouvertes : B8 et B9 (TK-106), B5 (TK-107). Lecture prudente appliquée, non bloquantes. C4 (les dépôts existants doivent-ils être migrés ?) est à trancher avant de lancer la migration sur un projet réel : en attendant, migration outillée, réversible, lancée projet par projet par un owner.
- Ajout d'une bibliothèque de diagramme (ou SVG maison) : ADR avec TK-108 (feuille de route §4).
- Sprint à 19 points, au-dessus de la capacité (feuille de route §5) : TK-110 peut glisser au sprint 025.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-106]** Format de spec v2 et migration des dépôts existants
  - Labels : pkg:schema, pkg:worker, pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-104
  - Source : `docs/refonte/ecarts.md` « Migrations de données » (format de spec v2), `docs/refonte/passations/09-lot-6-donnees-passation.md` §1, `08-lots-5-6-volume-reel-passation.md` §2.1, `docs/refonte/questions.md` B8, B9 (dépôt `koklo`) ; pas de maquette (aucun écran)
  - À faire :
    - `spec_version: 2` ; `checkVersion` (`packages/schema/src/parse/files.ts`) accepte v1 et v2 pendant la transition ; `spec-scaffold.ts` crée les nouveaux dépôts en v2.
    - Commande de migration en un lot du bot : tables `T-*.yaml` → `data/tables/<slug>.yaml` (types français, relations dans la table, fin de `data/relations.yaml`), endpoints `E-*` → `zone.verbe` (et liens des fonctionnalités), tests `tests/` → `quality/`, documents en sections, `.koklo/rules.yaml` → `design/rules.yaml`, ajout de `zone:`.
    - Schémas : `packages/schema/src/entities/data.ts` (`TableSchema` v1), `parse/kinds.ts` (n'accepte que `data/tables/T-*.yaml`), `SpecEndpoint` ; adapter les règles R4 et R7 qui lisent `spec.relations`.
    - Nom de fichier et identifiant selon B8 ; champ de zone selon B9.
    - Migration lancée projet par projet par un owner, relue avant enregistrement, réversible (C4).
  - Critères d'acceptation :
    - [ ] Un dépôt v1 de démonstration migre en v2 en un seul lot du bot, relu avant enregistrement (test).
    - [ ] Lecture des dépôts v1 et v2 pendant la transition (test).
    - [ ] `data/tables/<slug>.yaml` avec `id: T-<slug>` : la règle « id = nom de fichier » compare au slug (B8, test).
    - [ ] `zone:` lu aussi sous le nom `domaine:` (B9, test).
    - [ ] Un fichier de table hors format est signalé, jamais ignoré sans message (test).
    - [ ] Droits côté serveur : seul un owner lance la migration ; aucun jeton d'agent ne la lance (test 403).
    - [ ] Retour arrière possible sur un dépôt migré.
  - Questions : B8 (`data/tables/<slug>.yaml` avec `id: T-<slug>`) ; B9 (`zone:` partout, lu aussi sous `domaine:` pendant la transition) ; C4 (migration outillée et réversible, projet par projet, par un owner).
- [ ] **[TK-107]** Lot 6a · Données : format, Mermaid, états, onglets Tables et Jeux d'exemple
  - Labels : pkg:api, pkg:worker, pkg:contract, pkg:web, pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-106
  - Source : `docs/refonte/passations/09-lot-6-donnees-passation.md` §1 à §3.3, §3.4 (Tables, Jeux d'exemple), §5, `11-principe-creer-modifier.md` §3 (Table) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/11-Lot6Donnees.html` (Prêt, Génération, Relecture, Liste · équipe : onglets Tables et Jeux d'exemple)
  - À faire :
    - Schéma Zod d'un fichier table (types `uuid`, `texte(n)`, `entier`, `decimal`, `booleen`, `horodatage`, `date`, `enum`, `json`, `ref(T-xxx)` ; cardinalités) ; références vérifiées à l'enregistrement (`ref`, `vers`, `source` vers des F / R), en complétant `packages/schema/src/rules/rule4.ts` et `rule4-links.ts`.
    - `data/model.mmd` régénéré dans le même commit à chaque `specBatch.submit` touchant `data/` (`writeCommit` multi-fichiers, `apps/worker/src/spec-write/execute.ts`) ; `spec.data.mermaid`.
    - `ai.proposeDeliverable` `'data'` (propositions `table`, `relations`, `fixtures`) ; l'agent lit le fonctionnel, les règles et les rôles (14 §3).
    - Route `/projects/[id]/spec/data`, en-tête « Modèle de données », états Prêt, Génération, Relecture ; onglet Relecture devant Diagramme, équipe seulement, tant qu'une relecture est en cours.
    - `spec.data.get` découpé en `spec.data.tables.list` (07 §7) ; `specBatch.submit` `table.create`, `table.update`, `fixture.create` (élargir la liste blanche `feature.*` de `paths.ts`).
    - Onglet Tables (Table, Champs, Relations, Utilisée par, Données personnelles) ; onglet Jeux d'exemple depuis `data/fixtures/FX-*.yaml` (B5), données toujours fictives.
    - Formulaire `SpecItemSheet` Table et « Ajouter une table ». Rejeter une table rejette les relations et champs `ref` qui la visent (signalé dans le récapitulatif).
  - Critères d'acceptation :
    - [ ] 5 états ; onglets Diagramme / Tables / Jeux d'exemple ; onglet Relecture devant Diagramme en relecture, équipe seulement.
    - [ ] YAML = fichier réel du dépôt ; `model.mmd` régénéré à chaque enregistrement.
    - [ ] Relecture : tables, relations, jeux ; récapitulatif avant enregistrement.
    - [ ] Fichier table invalide → proposition écartée côté serveur ; références inconnues refusées (test).
    - [ ] Droits côté serveur : proposer, relire et modifier réservés à owner, admin et développeur ; designer en lecture ; client et business en 403 (test).
    - [ ] Données de test de charge : 80 tables dans `pnpm seed:large` ; recherche et filtres sur des éléments non chargés ; lien direct hors de la première page ; pied de liste et recherche vide capturés.
    - [ ] Captures : chaque état × onglet Tables et Jeux d'exemple, clair, sombre, 375 px ; axe sans violation.
  - Questions : B5 (source de vérité unique `data/fixtures/FX-*.yaml` ; le design et la qualité y font référence).
- [ ] **[TK-108]** Lot 6b · Données : diagramme, zoom, fiche Fiche / YAML / Mermaid
  - Labels : pkg:web, pkg:ui, pkg:api, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-107
  - Source : `docs/refonte/passations/09-lot-6-donnees-passation.md` §3.3 (état sur le diagramme), §3.4 (Diagramme), §8 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/11-Lot6Donnees.html` (Relecture et Liste · équipe : Diagramme, sélection, zoom 50 % et 200 %, Fiche / YAML / Mermaid)
  - À faire :
    - ADR : bibliothèque de diagramme ou SVG maison (feuille de route §4). Lecteur dans `packages/ui`, partagé avec les lots 7 et 9.
    - Lecteur pleine hauteur (trame de points, défilement interne) ; cartes de table 230 px ; relations SVG avec cardinalité ; sélection qui met les relations en `--primary`.
    - Glisser (équipe seulement) → `spec.data.layout.save` (09 §5) → commit direct de `data/_layout.yaml`, sans relecture.
    - Zoom : barre `role="toolbar"`, paliers 50 à 200 %, `Ctrl/⌘ +`, `−`, `0`, `Ctrl/⌘ + molette`, « Ajuster » ; zoom mémorisé en stockage local.
    - Fiche ancrée : Fiche · YAML · Mermaid (YAML et Mermaid réservés à l'équipe), texte brut en `pre`.
    - En relecture : table à relire en pointillés, table rejetée à 40 %, légende.
    - Responsive : sous 1024 px, onglet Tables par défaut ; sous 768 px, commandes 44 px et glisser désactivé.
  - Critères d'acceptation :
    - [ ] Diagramme sur toute la hauteur, sélection d'une table qui met ses relations en évidence, glisser enregistré dans `_layout.yaml`, zoom (boutons, paliers, raccourcis, ajuster).
    - [ ] Fiche avec Fiche / YAML / Mermaid.
    - [ ] État des propositions visible sur le diagramme.
    - [ ] Alternative textuelle complète : chaque table est un `button` (`aria-pressed`, « Table Réservation, 6 champs »), SVG `aria-hidden`, pourcentage de zoom annoncé dans `role="status"`.
    - [ ] Droits côté serveur : `spec.data.layout.save` refusé au designer, au client et au business ; YAML et Mermaid jamais renvoyés au client (test).
    - [ ] Captures : diagramme en liste et en relecture, zoom 50 % et 200 %, Fiche / YAML / Mermaid, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-109]** Lot 6c · Données : validation par l'équipe, vue client, impact amont
  - Labels : pkg:web, pkg:api, pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-108
  - Source : `docs/refonte/passations/09-lot-6-donnees-passation.md` §3.5, §3.6, §4, §6, §7 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/11-Lot6Donnees.html` (Liste · équipe avec « Valider le modèle », Vue client)
  - À faire :
    - « Valider le modèle » (owner, admin, développeur) : `review.submit` `target: { kind: 'deliverable' }` sur le commit courant ; statut « Validé par l'équipe » ; débloque 3 Architecture, compteur Spec « 2/7 ».
    - Toute modification ultérieure d'une table invalide la validation.
    - Vue client : bandeau `role="note"` « Lecture seule », « Ce qu'on enregistre » depuis `resume_client`, « Commenter » (`comment.create` sur `{ kind: 'table', id }`). Ancrer le commentaire sur l'identifiant de spec (`CommentTargetKind`, `targetId` en `@db.Uuid` aujourd'hui).
    - Impact amont depuis le fonctionnel (`source:`) : `InlineAlert` « Le cahier fonctionnel a changé : F-002, R-004 modifiées », « Proposer les mises à jour » avec différences champ par champ.
    - Barre et vue d'ensemble : entrée « 2 Données » (badge, cadenas « Disponible après le fonctionnel »), « 3 Architecture » verrouillée jusqu'à la validation, carte « Modèle de données » depuis `spec.deliverables`.
  - Critères d'acceptation :
    - [ ] Validation par l'équipe liée au commit, invalidée par modification, déblocage d'Architecture.
    - [ ] Vue client en lecture simple (« Ce qu'on enregistre ») avec commentaires.
    - [ ] Le client ne voit jamais les propositions en attente ni l'onglet Relecture (filtré côté serveur, test).
    - [ ] Droits côté serveur (09 §7) : valider réservé à owner, admin et développeur ; client et business commentent seulement (tests 403).
    - [ ] Impact amont : le modèle passe « À revoir » quand une fonctionnalité ou une règle citée dans `source:` change (test).
    - [ ] Captures : Liste · équipe validée, Vue client, À revoir, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-110]** Lot 6 · volume réel : zones, « Aller à une table », niveau de détail, mini-carte, jeux paginés
  - Labels : pkg:web, pkg:api, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-108
  - Source : `docs/refonte/passations/08-lots-5-6-volume-reel-passation.md` §2, §3, §4, `07-principe-listes-longues.md` §1.2, §1.3 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/11-Lot6Donnees.html` (Volume réel : vue des zones, zone détaillée, zoom 50 %, page 2 d'un jeu d'exemple, relecture groupée)
  - À faire :
    - `data.zones`, `data.zone`, `data.search` ; au-delà de 25 tables, le diagramme s'ouvre sur la vue des zones (cartes 300 × 180, liens entre zones) ; fil « Toutes les zones · 65 tables / … » ; « Aller à une table… » (touche `/`).
    - Niveau de détail sous 60 % ; rendu limité aux nœuds visibles ; `DiagramMinimap` et `ZoneNode` (socle TK-94).
    - Champ de zone (B9) obligatoire au-delà de 25 tables, proposé par l'agent ; `data/_zones.yaml` (nom, icône). Index enrichi (zone, nom, champs) : `SpecTable` ne porte aujourd'hui que `specId` et `filePath`.
    - Onglet Tables : colonne Zone, recherche « table ou champ », en-tête collant, défilement interne (max. 700 px), pages de 50.
    - Jeux d'exemple : `spec.data.fixture.page({ fixtureId, page, size })`, pagination numérotée par jeu, lignes générées côté serveur depuis `FX-*.yaml` (graine), pas stockées au-delà de 50.
    - Relecture : propositions groupées par zone + groupe « Relations et jeux d'exemple » ; nombre à relire par zone.
  - Critères d'acceptation :
    - [ ] Avec le jeu de volumes de la planche (65 tables, 1 240 réservations d'exemple ; profil `seed:planche` selon B19), chaque onglet du lot 6 se comporte comme la planche en Volume réel.
    - [ ] Vue des zones dès 25 tables ; « Aller à une table » ; niveau de détail sous 60 % ; mini-carte synchronisée.
    - [ ] Relecture groupée au-delà de 30 propositions, « Accepter les N » limité au groupe.
    - [ ] Pagination numérotée : `nav aria-label="Pagination"`, page courante `aria-current="page"`, taille 25 / 50 / 100.
    - [ ] Avec `pnpm seed:large` : 60 i/s, première page < 300 ms côté serveur ; recherche sur des tables non chargées ; lien direct hors de la première page.
    - [ ] Droits côté serveur : `data.search` et `data.zone` ne renvoient au client que la vue client (test).
    - [ ] Captures en Volume réel : chaque onglet, relecture groupée, vue des zones, zone détaillée, zoom 50 %, page 2 d'un jeu d'exemple ; clair, sombre, 375 px ; axe sans violation.

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px de chaque écran touché, comparées à la planche
- [ ] axe sans violation sur chaque état
- [ ] Listes vérifiées avec `pnpm seed:large`

## 🚧 Risks
- Format v1 contraire : un fichier sans préfixe `T-` est ignoré sans message ; les règles R4 et R7 lisent `spec.relations`.
- Références incomplètes : `source` → F / R et `ref()` ne sont pas vérifiés aujourd'hui.
- Un commit de mise en page invalide-t-il la validation ? Lecture prudente B11 : non.
- Jeux d'exemple à trois endroits selon les passations (B5).
- Lecteur de diagramme : aucune bibliothèque, composant partagé avec les lots 7 et 9.
- Vue des zones : l'index doit être enrichi (zone, nom, champs).
- Validation par l'équipe contraire à `REVIEW_SUBMIT_ROLES` et `ReviewTargetKind` (repris par TK-100).
- Commentaires : les lignes d'index sont recréées, ancrer sur l'identifiant de spec.
- Contrat `spec.data.*` absent ; liste blanche `feature.*` dans `paths.ts`.
