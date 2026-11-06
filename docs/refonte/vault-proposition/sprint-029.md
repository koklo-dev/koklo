---
tags: [sprint/029, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 029 — Refonte : Design · parcours jouable

## 🎯 Sprint Goal
L'équipe partage un parcours que le client joue écran par écran, dans le viewport et le thème du produit, commente sur un nœud précis et valide écran par écran ; chaque validation est liée à la version de l'écran.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passation validée par Brice le 05/11/2026 : `docs/refonte/passations/13-lot-9-design-passation.md` (dépôt `koklo`), §2.5, §4, §5.
- Sprints prérequis : 027 (moteur de rendu TK-118, design system, règles UI/UX) et 028 (inventaire, file de conception, studio TK-122).
- Questions ouvertes liées (non bloquantes, lecture prudente appliquée) : B7 (emplacement des parcours et des scénarios), B5 (source unique des jeux de données).

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-123]** Lot 9e · Parcours jouable et validation client par écran
  - Labels : pkg:web, pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-122
  - Source : `docs/refonte/passations/13-lot-9-design-passation.md` §2.5, §4, §5, §7 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/19-Lot9bParcours.html` (Équipe et Vue client ; mobile, tablette, ordinateur ; thème du produit clair et sombre) et `docs/refonte/maquettes/17-Lot9Design.html` (étape 4 · Parcours)
  - À faire :
    - Format `design/flows/P-*.yaml` (étapes, scénarios liés à un critère d'acceptation, état et fixture par étape, branches de retour) ; écritures `flow.*` par `specBatch.submit`, un lot d'opérations = un commit (trailer `Koklo-Ops`)
    - Procédures `design.flows.get({ flowId })`, `design.flows.play({ flowId, scenarioId })`, `design.comments.add({ screenId, nodeId, text })`, `.comments.reply`, `.comments.resolve`, `design.validate({ screenId, sha })`, `.unvalidate`
    - Étape 4 de la page Design : liste des parcours (id, titre, « 3 écrans conçus sur 5 · 3 scénarios », points par écran), « Jouer le parcours » actif seulement quand tous ses écrans sont conçus, sinon « Jouable une fois conçu » (pointillé)
    - Route plein écran `/projects/[id]/spec/design/flows/[P-id]` (sans barre latérale du projet) : barre haute (bascule Équipe / Vue client, viewport, thème du produit, thème Koklo, « Partager avec le client » / « Envoyer mes retours ») ; gauche 268 px Scénarios et Étapes (retour arrière décalé de 14 px avec « ↺ », pied « Validé par le client n / N ») ; centre rendu depuis la spec par le moteur de TK-118 avec la fixture et l'état de l'étape, interrupteur Zones cliquables, Précédent · « 5 / 7 » · Suivant · Recommencer ; droite 360 px onglets Scénario, Commentaires, Données
    - Vue client : « Cliquer sur l'écran pour commenter » (mode épinglage, commentaire ancré sur le nœud cliqué), « Valider cet écran » / « Demander un changement » (`flex:1`, sans retour à la ligne) ; ni YAML, ni calques, ni règles
    - Validation par écran `design_validation { screenId, sha, by, at }` ; toute opération ultérieure touchant l'écran, ou un token ou composant qu'il utilise, le repasse « À revoir » (graphe écran → composants → tokens) ; livrable Design « Validé » quand tous les écrans de l'inventaire accepté sont validés et sans erreur de règle, Qualité (7ᵉ livrable) passe alors « Prêt »
    - Reprendre `ReviewTargetKind.screen` (masqué aujourd'hui par `prisma-review.repository.ts:32` et `schemas-review.ts:12`) et étendre `CommentTargetKind.screen` à une cible `écran › nœud`
  - Critères d'acceptation :
    - [ ] Parcours jouable : scénarios liés aux critères, étapes de retour, zones cliquables, 3 viewports, thème du produit, commentaires ancrés, validation client par écran liée au SHA
    - [ ] « Jouer le parcours » actif seulement quand tous les écrans du parcours sont conçus
    - [ ] Toute opération ultérieure touchant l'écran (ou un token / composant qu'il utilise) le repasse « À revoir » (test)
    - [ ] Le livrable Design est « Validé » quand tous les écrans de l'inventaire accepté sont validés et sans erreur de règle ; Qualité passe « Prêt » (test)
    - [ ] Droits §7 appliqués côté serveur : seul le client valide un écran (sans client invité : le propriétaire ou l'administrateur, D1) ; owner, admin et designer partagent un parcours ; tous commentent un nœud ; ni un membre de l'équipe ni un appel de l'agent ne valide au nom du client (test 403)
    - [ ] Le client ne voit ni YAML, ni calques, ni règles (test)
    - [ ] Captures : chaque étape × état, équipe et client, clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : B7 (lecture prudente : le parcours métier vit dans `design/flows/P-*.yaml`, un scénario a une seule source, `quality/scenarios/`) ; B5 (lecture prudente : les fixtures référencent `data/fixtures/FX-*.yaml`)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche pour chaque écran touché
- [ ] axe sans violation sur chaque écran touché

## 🚧 Risks
- Parcours jouable et commentaires ancrés sur un nœud sont absents de bout en bout (effort L) : `CommentTargetKind.screen` ne porte pas de nœud.
- La validation par écran existe en base (`ReviewTargetKind.screen`) mais est masquée par l'API et le contrat ; l'invalidation « À revoir » demande le graphe écran → composants → tokens.
- Le rendu dépend du moteur de TK-118, plus gros chantier de la refonte (aucun paquet `ir` ni `render-web` aujourd'hui).
