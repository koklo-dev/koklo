---
tags: [sprint/030, vault/timeline, design/refonte]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 030 — Refonte : Qualité

## 🎯 Sprint Goal
L'agent propose les scénarios Gherkin en français depuis les critères et les parcours joués ; l'équipe relit la couverture, la stratégie, les jeux de données et le plan de test, puis valide la Qualité : les 7 livrables sont validés (7/7).

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- Passation validée par Brice le 05/11/2026 : `docs/refonte/passations/15-lot-10-qualite-passation.md` (dépôt `koklo`). Lue avec la règle des 7 livrables (21 §0) : quand la passation dit « 6 livrables », lire « 7 ».
- Sprints prérequis : 026 (Technique et Sécurité, TK-116 et TK-117) et 029 (parcours jouable, TK-123).
- Questions ouvertes liées (non bloquantes, lecture prudente appliquée) : B1 (ordre de disponibilité de Qualité), B5, B7, B12.

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [ ] **[TK-124]** Lot 10a · Qualité : formats, Scénarios, Jeux de données, relecture
  - Labels : pkg:api, pkg:worker, pkg:contract, pkg:web, pkg:schema, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-117, TK-123
  - Source : `docs/refonte/passations/15-lot-10-qualite-passation.md` §1 à §4.1, §4.4, §6 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/20-Lot10Qualite.html` (Relecture, Liste · équipe, À revoir, Vue client ; Volume réel : 14 fonctionnalités, 44 critères, 70 scénarios) et `docs/refonte/maquettes/21-PrincipeAgent.html` (bouton commun)
  - À faire :
    - Formats `quality/scenarios/F-nnn.feature` (Gherkin français `# language: fr`, étiquettes `@F-003 @AC-4 @TS-021 @e2e`), `quality/strategy.yaml`, `quality/fixtures/FX-*.yaml`, `quality/plan/NN-<slug>.md` dans `packages/schema` (spec v2) ; remplace `TestScenarioSchema` (`tests/scenarios/*.yaml`)
    - Parseur Gherkin, avec son ADR (feuille de route §4)
    - Page `/projects/[id]/spec/quality` : en-tête (h1, statut, résumé sous le titre, « Proposer avec l'agent », « Nouveau scénario » en `SpecItemSheet` type `scenario`, « Valider » désactivé en pointillé tant qu'un critère n'a pas de scénario), onglets Scénarios, Couverture, Stratégie, Jeux de données, Document ; états Prêt, Génération, Relecture, Liste · équipe, À revoir, Vue client
    - Onglet Scénarios : recherche, filtres par niveau, groupes repliables par fonctionnalité (au-delà de 8 : « Afficher 8 fonctionnalités de plus »), puis par critère ; critère sans scénario : encadré ambre « Aucun scénario ne vérifie ce critère. » + « Proposer un scénario » (`scope: { ac: 'F-003#AC-3' }`) ; fiche Fiche · Gherkin (440–560 px) avec liens Parcours `P-01 · SC-02`, Écrans, Opération, Règle, Jeux de données
    - Onglet Jeux de données : encadré « Données fictives uniquement… aucune donnée réelle (NFR-001) », tableau Jeu · Table · Lignes · Contenu · Utilisé par
    - Procédures `spec.quality.scenarios.list({ feature?, level?, q?, cursor, limit })`, `.byId`, `spec.quality.fixtures.list()`, `ai.proposeDeliverable({ deliverable: 'quality', mode })`, `specBatch.submit` (`scenario.*`, `fixture.*`) ; relecture groupée (liste 420 px, « Enregistrer N », Accepter · Modifier · Rejeter)
    - Disponibilité de Qualité : après Technique, Sécurité et Design (B1) ; un scénario de parcours est le même que celui joué dans le parcours jouable (TK-123)
  - Critères d'acceptation :
    - [ ] Relecture, Liste, À revoir, Vue client ; Gherkin français source de vérité
    - [ ] Onglets Scénarios et Jeux de données ; critère sans scénario signalé, « Proposer un scénario » ne propose que celui-là (test)
    - [ ] `SpecItemSheet` sur Nouveau scénario / Modifier ; bouton agent commun ; rien n'est écrit sans relecture (test)
    - [ ] Vue client : lecture et commentaires, fiche sans vue Gherkin (test)
    - [ ] Chaque vue reste fluide (60 i/s au défilement, première page < 300 ms côté serveur sur le jeu de charge)
    - [ ] Recherche et filtres testés sur des éléments non chargés ; lien direct vers un scénario hors de la première page
    - [ ] États de pied de liste capturés (suite, chargement, erreur, fin) et recherche vide
    - [ ] Captures : chaque état × onglet livré, équipe et client, clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : B1 (lecture prudente : Qualité ← Technique, Sécurité et Design) ; B5 (source unique `data/fixtures/FX-*.yaml`, `quality/fixtures` y fait référence) ; B7 (un scénario a une seule source : `quality/scenarios/`)
- [ ] **[TK-125]** Lot 10b · Qualité : Couverture, Stratégie, Document, validation
  - Labels : pkg:api, pkg:web, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-124
  - Source : `docs/refonte/passations/15-lot-10-qualite-passation.md` §4.2, §4.3, §4.5, §5 (dépôt `koklo`) ; maquette `docs/refonte/maquettes/20-Lot10Qualite.html` (onglets Couverture, Stratégie, Document ; Liste · équipe, À revoir, Vue client)
  - À faire :
    - `spec.quality.coverage()` : 5 indicateurs (critères, exigences, règles métier testées, écrans en test visuel, parcours en bout en bout), tableau par fonctionnalité et par niveau, cartes des exigences non fonctionnelles avec « Proposer un scénario » ; reprendre `packages/schema/src/rules/rule5.ts`
    - Statut de couverture des exigences repris par l'onglet Exigences du Technique (lot 8 §4.3), qui affichait « Couverture : après la Qualité » (B12)
    - Onglet Stratégie : cartes par niveau avec l'outil de la stack retenue, encadré « Une pull request ne fusionne pas si… » (scénario lié en échec, critère qui perd son dernier scénario, capture différente d'un écran validé, règle a11y en erreur, contrat généré désynchronisé)
    - Onglet Document : `SpecDocument` dans la disposition de l'espace Idée, `spec.document.sections({ deliverable: 'quality' })`, sections `quality/plan/NN-*.md` (dont « Recette avec le client », qui décrit la campagne et le PV, 22 §4)
    - Validation (owner, admin, développeur) seulement si chaque critère d'acceptation a au moins un scénario, liée au commit ; message « Qualité validée · les 7 livrables sont validés : la Baseline 0 peut être posée » ; compteur « SPEC 7/7 »
    - Changement amont (fonctionnel, design, technique) → « À revoir » sur les scénarios concernés, bandeau avec la version et la liste
  - Critères d'acceptation :
    - [ ] Couverture calculée (critères, exigences, règles, écrans, parcours) et reprise par le lot 8
    - [ ] Validation bloquée tant qu'un critère n'a pas de scénario, côté serveur (test) ; déblocage de la Baseline 0
    - [ ] Validation réservée à owner, admin et développeur côté serveur ; le client lit et commente, un appel de l'agent ne valide jamais (test 403)
    - [ ] Document en disposition espace Idée ; bouton agent commun
    - [ ] Un changement amont repasse les scénarios concernés « À revoir » (test)
    - [ ] Captures : chaque état × onglet, équipe et client, clair, sombre, 375 px, comparées à la planche ; axe sans violation
  - Questions : B12 (lecture prudente : avant la Qualité, aucune exigence ne bloque la validation du Technique ; la couverture se calcule à partir d'ici) ; B1

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Captures clair / sombre / 375 px comparées à la planche pour chaque écran touché
- [ ] axe sans violation sur chaque écran touché

## 🚧 Risks
- Format contraire à l'existant : `TestScenarioSchema` (`tests/scenarios/*.yaml`) à remplacer par du Gherkin, sans parseur aujourd'hui ; les étapes des critères permettent d'en générer.
- `strategy.yaml`, `quality/fixtures`, `quality/plan/` absents ; couverture seulement partielle (`rule5.ts`).
- Le statut Passe / Échoue (CI de `main`, via `publishCheck`) n'a de sens qu'après la Baseline 0 : il n'est pas livré ici.
