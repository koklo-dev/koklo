---
tags: [sprint/027, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 027 — Refonte : Design · charte et règles

## 🎯 Sprint Goal
Un écran de la spec se rend réellement, par état, viewport et thème. L'équipe construit la charte du client (design system avec contraste calculé), puis active les règles UI/UX, règle leurs sévérités et gère les dérogations.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passation validée par Brice le 05/11/2026 (dépôt `koklo`) : `docs/refonte/passations/13-lot-9-design-passation.md` (« le lot capital »), avec `14-principe-proposer-avec-agent.md` §3 et §5, `11-principe-creer-modifier.md`, `07-principe-listes-longues.md`. Design est le 6ᵉ livrable (`21-lot-14-securite-passation.md` §0).
- Le moteur de rendu (TK-118) n'a pas de ticket dans la passation 13 : il est tiré de 13 §3 et de la conception v0.6 §16 (hors de l'archive `docs/refonte/`). Relire la conception v0.6 §16 avant de lancer TK-118.
- Sprints prérequis : 023 (TK-104, pour TK-118) et 026 (TK-116, pour TK-119).
- Question B14 (TK-118) : lecture prudente appliquée, non bloquante.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-118]** Moteur de rendu des écrans : représentation intermédiaire, rendu web par état, viewport et thème
  - Labels : pkg:render, pkg:schema, pkg:api, pkg:contract, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-104
  - Source : `docs/refonte/passations/13-lot-9-design-passation.md` §1 (`design/screens/S-*.json`, `OPB-nnn`), §3 (rendu central), §6 (`design.screens.render`) ; conception v0.6 §16 (dépôt `koklo`) ; maquettes `docs/refonte/maquettes/18-Lot9aStudio.html` (rendu par État, Viewport 390 / 744 / 1280, Thème), `17-Lot9Design.html` (miniatures de la galerie)
  - À faire :
    - **Nouveau paquet `packages/render` (pkg:render)**, absent de la liste des paquets de la feuille de route §4 : aucun paquet `ir` ni `render-web` n'existe (ecarts.md, v0.6 §16.2). Le créer dans le monorepo.
    - Représentation intermédiaire depuis `design/screens/S-*.json` ; étendre `ScreenSchema` (`packages/schema/src/entities/screen.ts`, `canonical.ts`) : interactions, props typées, fixture ; `NodeSchema.composant` est aujourd'hui libre.
    - Rendu web par état, par viewport (390 / 744 / 1280, cadre mis à l'échelle sans rétrécir : `flex:0 0 auto`, `transform-origin: top left`) et par thème du produit client, indépendant du thème Koklo.
    - Rendu « depuis la spec · version … » à un SHA donné ; un état exigé mais non conçu s'affiche « État exigé par les règles, pas encore conçu ».
    - Fixtures lues depuis `data/fixtures/FX-*.yaml` (lecture prudente B5).
    - Lots d'opérations selon B14 : trailer `Koklo-Ops` existant (`apps/worker/src/spec-write/message.ts`) + `OPB-nnn` (compteur par projet `ProjectCounter`).
    - Le moteur sert `design.screens.render({ screenId, state, viewport, theme, sha? })` (13 §6), branché sur l'API avec la galerie et le studio (TK-121, TK-122).
  - Critères d'acceptation :
    - [ ] Un écran `S-*.json` se rend par état, par viewport (390 / 744 / 1280) et par thème du produit, depuis la spec à un SHA donné (test).
    - [ ] Un état déclaré mais pas conçu s'affiche « État exigé par les règles, pas encore conçu ».
    - [ ] Les écrans n'utilisent que des composants déclarés, et les composants que des tokens d'usage (test).
    - [ ] Aucune valeur issue du modèle n'est rendue en HTML ; texte brut seulement (test).
    - [ ] Chaque écriture est un lot d'opérations = un commit, avec le trailer `Koklo-Ops` et un numéro `OPB-nnn` (B14, test).
    - [ ] Captures d'un écran de démonstration dans 3 viewports, thème clair et sombre du produit ; axe sans violation sur le rendu.
  - Questions : B14 (garder le trailer `Koklo-Ops: <uuid>` et y ajouter `OPB-nnn`, compteur par projet).
- [ ] **[TK-119]** Lot 9a · Design system
  - Labels : pkg:api, pkg:web, pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-116, TK-118
  - Source : `docs/refonte/passations/13-lot-9-design-passation.md` §1, §2.1, §2.2, §5 (design system), §8, `14-principe-proposer-avec-agent.md` §3 (Design · système), §5 (formulaire `charte`) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/17-Lot9Design.html` (Design system ; Démo / Volume réel)
  - À faire :
    - Formats `design/tokens/core.json` et `semantic.json` (DTCG, valeurs claire et sombre ; la v0.6 nomme `*.tokens.json`), `design/components/C-*.json` (niveau, props, variants, états, slots, tokens), `design/assets/`.
    - Route `/projects/[id]/spec/design` : en-tête, **stepper 4 étapes** qui remplace les onglets (Design system, Règles UI/UX, Écrans, Parcours).
    - Étape 1 : colonne Couleurs, Typographie, Espaces · rayons · mouvement, Composants, Assets ; bandeau charte avec bascule Clair / Sombre de l'aperçu ; composants rendus aux couleurs du client par TK-118.
    - Contraste WCAG 2.x calculé côté serveur (`design.contrast`), même code que la règle a11y ; jamais saisi. Token `color.text.unavailable` (13 §8, et non `color.text.disabled`).
    - Proposition de l'agent sur les tokens (bouton commun, choix « Corriger les contrastes », « Compléter la bibliothèque », « Revoir le thème sombre ») : ratios avant → après et portée ; Accepter = lot d'opérations `token.set`, toast avec n° d'OPB.
    - `design.tokens.list`, `design.components.list`, `design.assets.list` ; formulaire `SpecItemSheet` `charte` (« Modifier la charte » : contrastes recalculés avant l'enregistrement).
    - Validation du design system par l'équipe (owner, admin, designer) ; le client voit la charte en lecture.
  - Critères d'acceptation :
    - [ ] Stepper 4 étapes ; Design system (5 sections, contraste calculé, aperçus aux couleurs et au thème du client, proposition de l'agent appliquée par lot).
    - [ ] Ratios de contraste calculés, jamais saisis (formule WCAG 2.x, luminance relative) ; tokens décoratifs « Non vérifié · décoratif » (test).
    - [ ] Tableau des tokens défilant avec en-tête collant ; `pnpm seed:large` fluide.
    - [ ] Droits côté serveur (13 §7) : modifier la charte réservé à owner, admin et designer ; développeur en lecture et commentaires ; client en lecture (test 403).
    - [ ] Rien n'est écrit par l'agent sans Accepter (test).
    - [ ] Captures : étape 1 × chaque section, aperçu clair et sombre du produit, équipe et client, clair, sombre, 375 px ; axe sans violation.
- [ ] **[TK-120]** Lot 9b · Règles UI/UX : paquets, sévérités, dérogations, `design.lint`
  - Labels : pkg:rules, pkg:api, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-119
  - Source : `docs/refonte/passations/13-lot-9-design-passation.md` §1 (`design/rules.yaml`, `.koklo/waivers.yaml`), §2.3, §6, `14-principe-proposer-avec-agent.md` §3 (Design · règles) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/17-Lot9Design.html` (Règles)
  - À faire :
    - Moteur de règles UI : paquets `core`, `a11y`, `coh`, `mq`, `pr` ; reprendre la composition et les dérogations de `packages/rules` (seule la composition se réutilise, pas l'évaluation).
    - `design/rules.yaml` (paquets actifs, référentiel WCAG 2.2 AA, sévérités surchargées, règles projet) remplace `.koklo/rules.yaml` posé par `spec-scaffold.ts:78` ; dérogations `.koklo/waivers.yaml` sur une cible `écran › nœud`.
    - Règles de référence de 13 §2.3 (`core.etats-obligatoires`, `core.tokens-uniquement`, …, `a11y.mouvement-reduit`, `coh.formats-fr`, `mq.*`, `pr.*`).
    - Écran étape 2 : paquets avec interrupteurs (Socle Koklo toujours actif), encadré Référentiel, tableau Règle · Ce qu'elle vérifie · Sévérité · En défaut, règles projet proposées par l'agent (Ajouter / Ignorer), dérogations.
    - `design.rules.get`, `.rules.setPack`, `.rules.setSeverity`, `.waivers.list`, `design.lint({ screenId? })` (diagnostics et correctifs par portée).
  - Critères d'acceptation :
    - [ ] Règles (paquets, sévérités, cadenas, dérogations, règles proposées).
    - [ ] Le Socle Koklo ne se désactive pas ; une règle cadenassée ne se déroge pas : refus côté serveur (test).
    - [ ] `design.lint` renvoie diagnostics et correctifs classés par portée (nœud, composant, token global) (test).
    - [ ] Droits côté serveur (13 §7) : déroger réservé à owner, admin et designer (règle non cadenassée) ; développeur et client refusés (test 403).
    - [ ] Une règle proposée par l'agent n'entre dans `design/rules.yaml` qu'après « Ajouter » (test).
    - [ ] Captures : étape 2 × chaque paquet, dérogations, clair, sombre, 375 px ; axe sans violation.

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px de chaque écran touché, comparées à la planche
- [ ] axe sans violation sur chaque état
- [ ] Listes vérifiées avec `pnpm seed:large`

## 🚧 Risks
- Moteur de rendu : aucun paquet `ir` ni `render-web` ; c'est le plus gros chantier de la refonte.
- `ScreenSchema` sans interactions, props typées ni fixture ; `NodeSchema.composant` libre.
- Tokens : le nommage v0.6 `*.tokens.json` diverge de `core.json` / `semantic.json`.
- Deux fichiers de règles (`.koklo/rules.yaml` et `design/rules.yaml`) ; dérogations aujourd'hui par fichier dans `packages/rules`.
- Le contraste doit utiliser le même code que la règle a11y.
- `OPB-nnn` : compteur `ProjectCounter` disponible, à ajouter au trailer existant (B14).
