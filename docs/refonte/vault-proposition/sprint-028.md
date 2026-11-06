---
tags: [sprint/028, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 028 — Refonte : Design · écrans et studio

## 🎯 Sprint Goal
L'agent propose l'inventaire des écrans et l'équipe le trie. Les écrans sont conçus un à la fois, relus avant le suivant, puis ouverts et corrigés dans le studio d'écran.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passation validée par Brice le 05/11/2026 (dépôt `koklo`) : `docs/refonte/passations/13-lot-9-design-passation.md` §2.4, §3, §6 à §8, avec `14-principe-proposer-avec-agent.md` §3 et §5, `07-principe-listes-longues.md`.
- Sprint prérequis : 027 (TK-118 moteur de rendu, TK-119 design system, TK-120 règles UI/UX).
- Aucune question ouverte rattachée à ces tickets. B5 (jeux de données dans `data/fixtures/`) s'applique au rendu des écrans.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-121]** Lot 9c · Écrans : inventaire, file de conception, galerie
  - Labels : pkg:api, pkg:worker, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-120
  - Source : `docs/refonte/passations/13-lot-9-design-passation.md` §1 (`inventory.yaml`), §2.4, §6, §8, `14-principe-proposer-avec-agent.md` §3 (Design · écrans), §5 (formulaire `screen`) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/17-Lot9Design.html` (Inventaire proposé, Conception ; Démo / Volume réel)
  - À faire :
    - `design/screens/inventory.yaml` (écran, parcours, étape, fonctionnalités, rôle, viewport, états attendus, statut) ; `ai.proposeInventory()` (`screen.propose`), `design.inventory.get`, `.inventory.decide`, `.inventory.coverage`.
    - Étape 3a : bandeau, groupes par parcours puis « Hors parcours », « Accepter les n », proposition douteuse mise en évidence et exclue de « Accepter les n », colonne Couverture ; « Enregistrer N écrans et passer à la conception ».
    - Étape 3b : file de conception ; `ai.designScreen({ screenId })` conçoit **un écran**, verrou serveur par projet (`409 design_in_progress`, à partir de `packages/domain/src/lock.ts` et `Lease`), flux d'avancement ; la conception tourne dans le bac à sable et ne produit qu'un lot d'opérations proposé.
    - Galerie : cartes avec miniature rendue par TK-118 (`design.screens.list`, `.screens.byId`, `.screens.render`), statuts, filtres ; liste « À concevoir » avec « Suivant ».
    - Listes longues : galerie en grille de 24 (07 §2), inventaire et galerie paginés par parcours au-delà de 50 écrans (13 §8).
    - Formulaire `SpecItemSheet` `screen` (« Ajouter un écran »).
  - Critères d'acceptation :
    - [ ] Inventaire proposé et trié avant toute conception ; couverture ; passage à la conception.
    - [ ] File de conception : un seul écran conçu à la fois par l'agent, relecture avant le suivant ; galerie + liste « À concevoir ».
    - [ ] Un second `ai.designScreen` pendant une conception reçoit `409 design_in_progress`, y compris sur une autre instance (test).
    - [ ] L'agent ne produit qu'un lot d'opérations proposé ; rien n'est écrit sans relecture (test).
    - [ ] Droits côté serveur (13 §7) : trier l'inventaire et lancer « Concevoir l'écran suivant » réservés à owner, admin et designer ; développeur et client refusés (test 403).
    - [ ] Avec `pnpm seed:large` : galerie fluide, filtres côté serveur, lien direct vers un écran hors de la première page, pied de liste capturé.
    - [ ] Captures : Inventaire proposé, Conception (en cours et terminée), galerie, Volume réel, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-122]** Lot 9d · Studio d'écran
  - Labels : pkg:web, pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-121
  - Source : `docs/refonte/passations/13-lot-9-design-passation.md` §3, §6, §7, §8 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/18-Lot9aStudio.html` (S-creneaux en conception : États, Viewports 390 / 744 / 1280, Thème, onglets Propriétés, Annotations, Règles, Agent)
  - À faire :
    - Barre : retour « Écrans », id + titre, statut, État, Viewport, Thème du produit, « Envoyer au client » actif seulement à 0 erreur de règle.
    - Gauche : calques (arbre de nœuds `n-*`, composant, annotation, diagnostic). Centre : rendu réel depuis la spec (TK-118).
    - Onglet Propriétés : props du composant, « Style (tokens) » liés par `node.bindToken`, interactions du vocabulaire fermé, journal des opérations.
    - Onglet Annotations : fonctionnalité + critère, donnée `T-…`, opération, règle métier `R-…` (« le délai vient de R-002, jamais écrit en dur »).
    - Onglet Règles : diagnostics de `design.lint`, correctifs classés par portée (ce nœud, le composant, le token global).
    - Onglet Agent : lot proposé `OPB-nnn` aux opérations décochables, Avant / Après, Appliquer / Rejeter ; `specBatch.submit` `node.*`, `annotation.*`, `interaction.*`.
    - Fil de commentaire du client sur un nœud visible dans le studio, avec réponse de l'équipe (`CommentTargetKind.screen` n'a pas encore de nœud).
  - Critères d'acceptation :
    - [ ] Studio : calques, rendu par état / viewport / thème, propriétés liées aux tokens, annotations, règles avec correctifs par portée, lots d'opérations de l'agent, envoi au client à 0 erreur.
    - [ ] « Envoyer au client » refusé côté serveur s'il reste une erreur de règle (test).
    - [ ] Aucune opération de l'agent n'est écrite sans « Appliquer » (test).
    - [ ] Droits côté serveur (13 §7) : modifier un écran réservé à owner, admin et designer ; développeur en lecture et commentaires ; le client n'accède ni aux calques, ni aux règles, ni au YAML (test 403).
    - [ ] Viewport mis à l'échelle sans rétrécir ; état manquant affiché « État exigé par les règles, pas encore conçu ».
    - [ ] Captures : chaque onglet du studio, 3 viewports, thème du produit clair et sombre, clair, sombre, 375 px ; axe sans violation.

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px de chaque écran touché, comparées à la planche
- [ ] axe sans violation sur chaque état
- [ ] Listes vérifiées avec `pnpm seed:large`

## 🚧 Risks
- File de conception : le verrou doit tenir en base (`lock.ts`, `Lease`), pas en mémoire.
- Studio : plus gros chantier de la refonte, dépend entièrement du moteur de rendu (TK-118).
- `ScreenSchema` sans interactions, props typées ni fixture.
- Commentaires ancrés : `CommentTargetKind.screen` n'a pas de nœud.
- Validation par écran et « À revoir » si un token ou un composant change : graphe écran → composants → tokens à construire (TK-123, sprint suivant).
