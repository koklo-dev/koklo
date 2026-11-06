---
tags: [sprint/031, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 031 — Refonte : Baseline 0

## 🎯 Sprint Goal
L'équipe soumet la Baseline 0 quand les 7 livrables sont validés et qu'aucun contrôle ne bloque ; le client la relit, la signe ou demande des changements ; à sa validation Koklo pose le tag `baseline-0` et le projet passe en phase Itérations. Un test de bout en bout rejoue tout le parcours, de l'Idée à la Baseline 0, côté équipe et côté client.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passation validée par Brice le 05/11/2026 : `docs/refonte/passations/16-lot-11-baseline-passation.md` (dépôt `koklo`), complétée par `21-lot-14-securite-passation.md` §0 et §1.5 (carte Sécurité, résumé client, deux contrôles bloquants). Lue avec la règle des 7 livrables : « 6 livrables » se lit « 7 ».
- Sprints prérequis : 018 à 030 (tous les livrables de la spec, Qualité validable en TK-125).
- Questions ouvertes liées : B13 (qui pose la baseline, fusion `cadrage` → `main` ou tag seul) à trancher au plus tard au démarrage de TK-127 ; B17 et B1 (lecture prudente appliquée).

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-126]** Lot 11a · Baseline 0 : page équipe, contrôles, soumission
  - Labels : pkg:api, pkg:contract, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-125
  - Source : `docs/refonte/passations/16-lot-11-baseline-passation.md` §1 à §4, §6 ; `docs/refonte/passations/21-lot-14-securite-passation.md` §0 (contrôles, carte Sécurité) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/22-Lot11Baseline.html` (Prête, Chez le client ; Volume réel)
  - À faire :
    - Procédures `baseline.get({ projectId })`, `baseline.checks({ projectId })`, `baseline.submit({ projectId, sha })` (owner, admin ; 409 si contrôle bloquant), `baseline.withdraw({ projectId })` ; création réelle d'une `Baseline` (`schema.prisma:1139`, jamais créée aujourd'hui), état retiré / annulé et SHA soumis (migration)
    - Route `/projects/[id]/baseline`, entrée « Baseline 0 » entre Qualité et Tickets avec badge d'état ; carte de phase « Baseline 0 · 3 sur 4 »
    - Gabarit : en-tête (h1, statut, résumé sous le titre, actions à droite), 3 étapes en cartes de 52 px (Les 7 livrables validés « 7 sur 7 » → Validation du client → Baseline posée), deux colonnes (principale `flex: 999 1 620px`, Validation 340–420 px) ; états Prête et Chez le client (encadré ambre, Copier le lien, Retirer la demande)
    - Onglet Récapitulatif : grille des 7 livrables (`minmax(280px, 1fr)`) dont la carte Sécurité (« validée par l'équipe, résumé client joint »), SHA côté équipe ; récapitulatif client `baseline/recap.md` rédigé via « Proposer avec l'agent » (`ai.proposeDeliverable({ deliverable: 'baseline', mode: 'recap' | 'check' | 'risks' })`), modifiable par l'équipe
    - Onglet Contrôles (`baseline.checks`, recalculés à chaque version) : les 7 contrôles de 16 §4.2 et les deux contrôles bloquants de 21 §0 (« Aucune menace de gravité élevée sans parade », « Chaque donnée personnelle est classée ») ; action orange sous le texte, pastille Bloquant / Informatif dans une colonne de 96 px, valeur mono alignée à droite
    - Onglet Historique (frise, schéma 1.2) ; soumission annulée si la spec change entre soumission et validation (bandeau « La spec a changé depuis la soumission », `STALE_VERSION`) ; notification au client et `JournalAudit` à la soumission
  - Critères d'acceptation :
    - [ ] États Prête et Chez le client, 3 étapes, onglets Récapitulatif, Contrôles et Historique
    - [ ] Soumission impossible avec un contrôle bloquant (409, test)
    - [ ] Soumission et retrait réservés à owner et admin côté serveur ; un appel de l'agent ne soumet jamais et ne pose pas de baseline (test 403)
    - [ ] Une spec modifiée après la soumission annule la soumission (test)
    - [ ] Contrôles : actions orange sous le texte, colonnes de droite alignées
    - [ ] États de pied de liste de l'Historique capturés (suite, chargement, erreur, fin)
    - [ ] Captures : chaque état livré × onglet, clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : B17 (lecture prudente : les vérifications de livrable restent des avertissements, seul le contrôle de Baseline bloque) ; B1
- [ ] **[TK-127]** Lot 11b · Baseline 0 : vue client signée, tag, phase Itérations
  - Labels : pkg:api, pkg:github, pkg:web, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-126
  - Source : `docs/refonte/passations/16-lot-11-baseline-passation.md` §1, §3, §5, §6 ; `docs/refonte/passations/21-lot-14-securite-passation.md` §1.5 (résumé dans le récapitulatif) (dépôt `koklo`) ; maquette `docs/refonte/maquettes/22-Lot11Baseline.html` (Vue client, Changements, Posée)
  - À faire :
    - Vue client : encadré d'accueil « Dernière étape du cadrage », pas d'onglet Contrôles ni de SHA ; colonne « Votre validation » : case « J'ai relu le récapitulatif et je l'accepte comme référence du projet », champ « Votre nom, pour signer », « Valider la baseline 0 » (désactivé tant que la case n'est pas cochée), « Demander des changements » (demandes ancrées sur un élément ou un écran), mention de la version
    - `baseline.approve({ projectId, sha, signedName })`, client seulement (sans client invité : propriétaire ou administrateur, D1) : Koklo pose `baseline-0` sur le dépôt de spec avec `createTag`, écrit `tagSha`, `taggedAt` et `signedName`, met `project.phase = 'iterations'` ; selon la lecture prudente B13, fusion `cadrage` → `main` puis tag sur `main`, `cadrage` fermée en écriture
    - Spec figée après la pose : `apps/api/src/spec-read/spec-head-resolver.ts:8` ne lit plus `cadrage` ; toute modification passe par une demande de changement
    - `baseline.requestChanges({ projectId, sha, items: [{ target, text }] })` : cibles passées « À revoir », retour à l'étape 1 ; état Changements côté équipe (bandeau ambre, « Traiter les demandes »)
    - État Posée : bandeau vert, colonne Tag · Version · Validée par · Le, encadré « Ce qui change maintenant », « Récapitulatif PDF · bientôt » désactivé, « Générer les tickets du premier sprint » qui mène au lot 12 (TK-128) ; carte de phase « Itérations · 4 sur 4 » (lot 3)
    - Section « Vos données et leur sécurité » dans le récapitulatif client, tirée du résumé Sécurité (`security/summary.md`)
    - Notifications (validation et changements demandés, à l'équipe) et `JournalAudit` (baseline posée)
  - Critères d'acceptation :
    - [ ] Avec TK-126 : 5 états, 3 étapes, 3 onglets, vue client avec signature
    - [ ] Validation par le client seul (sans client invité : propriétaire ou administrateur, D1, test des deux cas), liée au SHA ; tag `baseline-0` posé (test avec le faux fournisseur GitHub)
    - [ ] Ni un membre de l'équipe ni un appel de l'agent ne peut valider la baseline ni poser le tag (test 403) ; la pose est faite par Koklo à la validation
    - [ ] Changements demandés : cibles « À revoir », retour à l'étape 1
    - [ ] Phase du projet et carte de phase mises à jour (lot 3) ; « Générer les tickets du premier sprint » mène au lot 12
    - [ ] Après la pose, une écriture directe de la spec est refusée (test)
    - [ ] Le client ne voit ni l'onglet Contrôles ni de SHA ; le résumé Sécurité apparaît dans le récapitulatif
    - [ ] Captures : chaque état × onglet, clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : B13 (lecture prudente : Koklo pose le tag à la validation du client ; fusion `cadrage` → `main` puis tag sur `main` ; `cadrage` ensuite fermée en écriture)
- [ ] **[TK-62]** e2e : parcours complet Idée → Baseline 0, équipe et client
  - Labels : pkg:e2e, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-127
  - Source : `docs/refonte/feuille-de-route.md` §3 ; `docs/refonte/passations/16-lot-11-baseline-passation.md` §7 et les passations des lots 2 à 10 et 14 (dépôt `koklo`) ; maquettes `docs/refonte/maquettes/06-Lot2Idee.html` à `22-Lot11Baseline.html` (états parcourus)
  - Note : Réécrit le 2026-11-06 (refonte). Ancien libellé : « e2e R3 » (parcours complet avec modèle simulé : client valide une feature, `baseline-0`, tickets proposés puis validés ; dépendait de TK-59, TK-60, TK-61). Les tickets sont désormais couverts au sprint 032.
  - À faire :
    - Un test de bout en bout avec deux sessions (équipe, client) et le faux fournisseur d'IA : dossier d'idée, « Passer au cadrage » (`idea-v1`, Synthèse)
    - Fonctionnel proposé, relu, enregistré, validé élément par élément par le client ; Données, Architecture, Technique et Sécurité validés par l'équipe
    - Design : inventaire trié, écrans conçus un à la fois, chaque écran validé par le client dans le parcours jouable ; Qualité validée (7/7)
    - Baseline : soumission, signature du client, tag `baseline-0` sur le faux dépôt, phase Itérations
    - Remplacer les parcours e2e devenus caducs (`e2e/tests/r1`, `r2-journeys`) par celui-ci
  - Critères d'acceptation :
    - [ ] e2e vert en CI
    - [ ] Aucun appel réseau vers un fournisseur d'IA ni vers GitHub réels (faux fournisseurs)
    - [ ] Le parcours vérifie au passage qu'un client ne publie pas le dossier d'idée et qu'un membre de l'équipe ne valide pas à la place du client
    - [ ] axe sans violation sur chaque écran du parcours

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche pour chaque écran touché
- [ ] axe sans violation sur chaque écran touché

## 🚧 Risks
- Aucun code ne crée de `Baseline` ni ne pose de tag : `createTag` existe, `tagSha` et `taggedAt` ne sont jamais écrits.
- Rien n'empêche aujourd'hui d'écrire après le tag : `spec-head-resolver.ts:8` lit toujours `cadrage`.
- La validation passe aujourd'hui par `review.submit`, sans `signedName` ; l'index unique partiel « une seule non taguée » est à reprendre pour l'état retiré.
- TK-62 traverse tous les lots refondus : il ne peut être vert qu'après eux, et il remplace des e2e (`r1`, `r2-journeys`) cassés par les retraits.
