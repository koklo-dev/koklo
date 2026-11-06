---
tags: [sprint/035, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 035 — Refonte : Recette et mises en ligne

## 🎯 Sprint Goal
Koklo lit dans GitHub les environnements, les déploiements et les aperçus de PR, sans rien déployer ; l'équipe ouvre une campagne de recette sur une version précise, le client joue ses scénarios et signale ses retours ; les notes de version sont publiées, le client seul signe le procès-verbal, et les indicateurs de livraison se calculent sans saisie.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passation validée par Brice le 06/11/2026 : `docs/refonte/passations/22-lot-15-recette-passation.md` (dépôt `koklo`). Hors périmètre : tout l'aspect financier (jalons, montants, facturation).
- Sprints prérequis : 030 (Qualité, TK-125), 032 (kanban et panneau, TK-129).
- Questions ouvertes liées : A10 (TK-134), A9 (TK-136) ; lecture prudente appliquée. C2 : le sprint 017 « Bascule » est à réécrire et à placer après ce sprint.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-134]** Lot 15a · Lecture GitHub : environnements, déploiements, aperçus, écart
  - Labels : pkg:worker, pkg:api, pkg:github, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-129
  - Source : `docs/refonte/passations/22-lot-15-recette-passation.md` §0, §1, §2.1, §4, §5 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/25-Lot15Recette.html` (Équipe · campagne, onglet Environnements ; Volume réel)
  - Note : Absorbe TK-80 (Worker : exécution des merges et `deployed_staging`, devient la lecture `deployment` / `deployment_status` / `workflow_run`) et la partie Environnements de TK-83 (vue de livraison).
  - À faire :
    - Webhooks `deployment`, `deployment_status` et `workflow_run` traités par le worker (`apps/worker/src/jobs/webhook-delivery.ts:43` ignore aujourd'hui tout sauf `push` et `installation`) ; reprendre `GitProvider.listDeployments` et `packages/domain/src/git-deployment.ts`
    - Procédures `deploy.environments({ projectId })`, `deploy.list({ projectId, env?, cursor })`, `deploy.previews({ projectId })`, `release.gap({ from: 'production', to: 'recette' })`
    - Entrée « Recette » (`rocket_launch`) après Tickets en phase Itérations, badge ; route `/projects/[id]/releases`
    - Onglet Environnements : carte par environnement (Production, Recette : adresse, statut, version et commit, date et auteur, contenu, données, approbation requise ; « Approuver dans GitHub » est un lien), aperçus des PR (Prêt / Échec / En cours ; Essayer, Journaux GitHub, Suivre), « En recette, pas encore en production », derniers déploiements
    - Contrôle « Aperçu déployé » (adresse, fournisseur, ancienneté) dans l'onglet Pull request du ticket (lot 12) ; dans la vue client du lot 12, « Prête à essayer » renvoie vers la recette
  - Critères d'acceptation :
    - [ ] Aucune action de déploiement depuis Koklo ; tout vient de l'API GitHub
    - [ ] Test avec des événements `deployment_status` et `workflow_run` simulés (repris de TK-80)
    - [ ] Lecture générique des déploiements, sans traitement propre à un hébergeur (test)
    - [ ] Derniers déploiements paginés par curseur ; états de pied de liste capturés
    - [ ] Captures : onglet Environnements, contrôle « Aperçu déployé », clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : A10 (lecture prudente : lecture générique des `deployment` / `deployment_status` GitHub)
- [ ] **[TK-135]** Lot 15b · Campagne de recette, retours, vue client
  - Labels : pkg:api, pkg:web, pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-134, TK-125
  - Source : `docs/refonte/passations/22-lot-15-recette-passation.md` §0, §2.2, §3, §5 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/25-Lot15Recette.html` (Équipe · campagne, Vue client ; panneau de retour)
  - À faire :
    - `campaign.create({ version, scenarioIds, testers })`, `campaign.get`, `campaign.result({ scenarioId, result })` : la campagne porte sur une version précise (tag + commit), scénarios choisis depuis les tickets de la version et le livrable Qualité
    - Onglet Campagne : en-tête (`R-n`, version, date, scénarios, testeurs, « Ouvrir la recette », barre passent / échouent / à jouer), filtres, groupes par parcours, boutons Passe / Échoue pour le testeur concerné
    - Échoue → `SpecItemSheet` formulaire `anomaly` prérempli (version, scénario), « Envoyer le retour » ; `feedback.create({ kind: 'anomaly' | 'change', … })` : une anomalie crée un ticket, un changement crée une demande de changement (« hors baseline : impact évalué avant décision »)
    - Panneau Retours (gravité Bloquante / Majeure / Mineure, ticket créé, état) et « Signaler » (équipe et client) ; encadré « Le procès-verbal se signe quand » (tous les scénarios joués, aucune anomalie bloquante ouverte ; les demandes de changement ne bloquent pas)
    - Vue client : onglet Campagne avec le filtre « À moi » par défaut, sans identifiants techniques, en-tête « À vous de jouer » ; retours affichés « L'équipe corrige » / « L'équipe évalue l'impact »
  - Critères d'acceptation :
    - [ ] Campagne : résultats par testeur, Échoue ouvre un retour prérempli, conditions de signature
    - [ ] Un testeur ne saisit de résultat que pour ses scénarios, vérifié côté serveur (test 403)
    - [ ] Vue client sans identifiant technique (test)
    - [ ] Aucune donnée financière (montant, jalon, facture) nulle part
    - [ ] Filtres testés sur des scénarios non chargés ; états de pied de liste capturés
    - [ ] Captures : campagne équipe et client, panneau de retour, clair, sombre, 375 px, comparées à la planche ; axe sans violation
- [ ] **[TK-136]** Lot 15c · Notes de version, procès-verbal signé, indicateurs
  - Labels : pkg:api, pkg:github, pkg:web, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-135
  - Source : `docs/refonte/passations/22-lot-15-recette-passation.md` §2.3 à §2.5, §3, §4, §5 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/25-Lot15Recette.html` (Équipe, Vue client, PV signé)
  - À faire :
    - Notes de version : liste Brouillon / Publiée ; `releaseNotes.propose({ version })` (clé d'IA de l'organisation, depuis les tickets fusionnés depuis la version précédente), `releaseNotes.publish` (e-mail au client) ; sections Ce qui est nouveau, Ce qui est corrigé, Ce qui change pour vous
    - Procès-verbal : version + commit, environnement, campagne, référence (baseline et demandes de changement acceptées), Résultats, Réserves, Décision du client (sans réserve, avec réserves, refusée) ; `pv.send`, `pv.sign({ decision })` (client seul, actif quand tous ses scénarios sont joués et une décision choisie), `pv.export`
    - Après signature : bandeau vert, export PDF, tag `recette-vX.Y.Z` posé dans GitHub (`createTag`), production proposée à l'approbation dans GitHub
    - Onglet Indicateurs (équipe) : `metrics.delivery({ projectId, days })` (mises en production, délai fusion → production en médiane, échecs au 1er passage, anomalies en production, sur 30 jours ; tableau par version)
    - Journal d'audit : envoi et signature du PV, publication des notes ; vue client : notes publiées seulement, onglet Procès-verbal
  - Critères d'acceptation :
    - [ ] PV signé par le client seul (sans client invité : propriétaire ou administrateur, D1), lié à un commit, tag posé (test avec le faux fournisseur GitHub)
    - [ ] Ni un membre de l'équipe ni un appel de l'agent ne signe le PV (test 403)
    - [ ] Notes de version sans identifiant technique côté client
    - [ ] Indicateurs calculés sans saisie
    - [ ] Aucune donnée financière (montant, jalon, facture) nulle part
    - [ ] Captures : 3 états × onglets, clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : A9 (lecture prudente : pas de relance automatique ; « Copier le lien » comme au lot 3)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche pour chaque écran touché
- [ ] axe sans violation sur chaque écran touché

## 🚧 Risks
- Le worker ignore aujourd'hui les événements de déploiement (`webhook-delivery.ts:43`) ; les formats varient selon l'hébergeur.
- Campagne, retours, notes, PV et indicateurs sont absents : modèles `Baseline` / `Review` à imiter. La signature engage le client : preuve et journal d'audit solides.
- Le sprint 017 « Bascule » reposait sur `koklo deliver`, annulé : à réécrire après ce sprint (question C2).
