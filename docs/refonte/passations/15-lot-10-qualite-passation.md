# Refonte UI · Lot 10 · Spec · Qualité : passation à l'agent dev

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette : canevas « Koklo — maquettes » (https://claude.ai/artifact/F6nuypdhrWp1Y7x8QwRiFm), planche **Lot 10 · Qualité**. Sélecteurs de maquette : Relecture, Liste · équipe, À revoir, Vue client ; Démo / **Volume réel** (référence : 14 fonctionnalités, 44 critères, 70 scénarios).
> À lire avant : `lot-8-technique-passation.md` (§8 : Document façon Idée, en-têtes), `lot-9-design-passation.md`, `principe-listes-longues.md`, `principe-creer-modifier.md`, `principe-proposer-avec-agent.md`.

Ce lot livre **Spec · Qualité** (route `/projects/[id]/spec/quality`) : les scénarios de test reliés aux critères d'acceptation, la couverture, la stratégie de test tirée de la stack, les jeux de données de test et le plan de test. Proposé par l'agent depuis les livrables validés ; **validé par l'équipe** (le client lit et commente). Sa validation termine le cadrage : les 6 livrables validés ouvrent la **Baseline 0** (lot 11).

## 1. Format dans le dépôt de spec

| Fichier | Contenu | Rôle |
|---|---|---|
| `quality/scenarios/F-nnn.feature` | Gherkin **en français** (`# language: fr`, `Fonctionnalité`, `Scénario`, `Étant donné`, `Et`, `Quand`, `Alors`), un fichier par fonctionnalité ; étiquettes `@F-003 @AC-4 @TS-021 @e2e` | source |
| `quality/strategy.yaml` | niveaux de test : outil (de la stack), source dans la spec, moment, bloquant ; règles de fusion | source |
| `quality/fixtures/FX-*.yaml` | données fictives par table, générées depuis `data/` (types et contraintes vérifiés) | source |
| `quality/plan/NN-<slug>.md` | sections du plan de test | source (`SpecDocument`) |

Le code des tests vit dans le dépôt de code et porte l'étiquette `@TS-nnn` : c'est le lien scénario ↔ test. Statut d'un scénario : **Spécifié** (pas encore de test), puis, après la Baseline 0, **Passe / Échoue** (dernière CI de `main`).

## 2. En-tête

h1 « Qualité », statut, actions à droite : **Proposer avec l'agent** (primaire, principe commun), **Nouveau scénario** (`SpecItemSheet` type `scenario`), **Valider** (désactivé en pointillé tant qu'un critère n'a pas de scénario) ; **résumé sous le titre** : « 70 scénarios · 41 critères couverts sur 44 · 7 niveaux de test · 7 jeux de données · 3 critères sans scénario avant de valider ». Onglets : **Scénarios** (`checklist`, compteur), **Couverture** (`donut_large`, « 41/44 »), **Stratégie** (`stacked_bar_chart`), **Jeux de données** (`dataset`), **Document** (`description`) ; Relecture devant en relecture.

## 3. États

- **Prêt / Génération** : comme les lots 7 et 8.
- **Relecture** : groupée (Scénarios, Stratégie, Jeux de données, Document · plan de test) ; liste à gauche (420 px, barre accepté / rejeté, « Enregistrer N ») ; détail à droite : type, id, titre, « Proposé par l'agent depuis le critère d'acceptation et le parcours joué dans le design », **Gherkin** en bloc mono (ou texte simple pour stratégie / jeux / sections), puces de liens, Accepter · Modifier · Rejeter.
- **Liste · équipe** (référence).
- **À revoir** : « Le design a changé depuis la validation (version b72e014). S-creneaux a un nouvel état « Créneau pris » et le parcours P-01 un scénario de plus. Sont concernés : TS-021, TS-022, 2 tests visuels. » ; scénarios concernés en pastille ambre « À revoir » + filet gauche ambre.
- **Vue client** : lecture ; fiche sans vue Gherkin ; « Ce scénario sera vérifié automatiquement à chaque modification du produit. »

## 4. Onglets

### 4.1 Scénarios (par défaut)
- Recherche, filtres en pastilles par niveau (Tous, Bout en bout, Unitaire, Intégration, Visuel, Accessibilité), barre de compte + pastille ambre « 3 sans scénario ».
- **Groupes par fonctionnalité** repliables (id, titre, nb de scénarios, pastille « 3 / 4 critères » verte ou ambre) ; au-delà de 8 groupes « Afficher 8 fonctionnalités de plus ». Dans un groupe : **par critère** (`AC-n` + texte 12 px), puis les lignes de scénario : id mono, titre, pastille de niveau (bout en bout `--secondary`, unitaire contour, intégration pointillé…), statut. Critère sans scénario : encadré ambre « Aucun scénario ne vérifie ce critère. » + **Proposer un scénario** (l'agent ne propose que celui-là).
- **Fiche** à droite (440–560 px) : niveau, id, Modifier ; titre ; Fiche · Gherkin. Fiche : critère vérifié (encadré `--surface`), étapes Étant donné / Et / Quand / Alors (mot-clé `--primary` 12/600), liens en puces (Parcours `P-01 · SC-02`, Écrans, Opération `reservations.create · 409`, Règle, Jeux de données), encadré « Le test (Playwright) est écrit pendant le ticket de F-003 et porte l'étiquette @TS-021… ». Gherkin : chemin + « Source de vérité ».
- **Lien avec le design** : un scénario de parcours (`P-01 · SC-02`) est le même que celui qu'on joue dans le parcours jouable (lot 9b).

### 4.2 Couverture
- 5 indicateurs : Critères couverts (41 / 44), Exigences couvertes (21 / 28), Règles métier testées, Écrans en test visuel, Parcours en bout en bout ; jauge verte si complet, ambre sinon.
- Tableau **par fonctionnalité** : critères couverts (jauge + « 3 / 4 »), puis un nombre par niveau (Contrat, Unitaire, Intégration, Bout en bout, Visuel, Accessibilité), « — » estompé pour 0.
- **Exigences non fonctionnelles** : cartes (id, titre, Couverte / À couvrir, cible en gras · moyen de vérification) ; à couvrir : bordure ambre + « Proposer un scénario ». Alimente le statut de couverture du lot 8 §4.3.

### 4.3 Stratégie
Cartes par niveau : icône, nom, outil (**de la stack retenue**), nombre ; Part de · Tourne · Bloquant. Niveaux : Unitaire (Vitest, règles R-*), Intégration (Vitest + PostgreSQL éphémère), Contrat (généré depuis `api/endpoints`), Bout en bout (Playwright, parcours P-*), Visuel (captures des écrans validés × états × thèmes), Accessibilité (axe-core, erreurs bloquantes), Performance (k6, la nuit, alerte). Encadré **« Une pull request ne fusionne pas si… »** : scénario lié en échec ; critère qui perd son dernier scénario ; capture différente d'un écran validé sans demande de changement acceptée ; règle a11y en erreur ; contrat généré désynchronisé. Si la stack change, les outils changent, les scénarios restent.

### 4.4 Jeux de données
Encadré « Données fictives uniquement… aucune donnée réelle (NFR-001) » ; tableau Jeu · Table · Lignes · Contenu · Utilisé par.

### 4.5 Document
`SpecDocument` **dans la disposition de l'espace Idée** (identique aux lots 7 et 8, `lot-8-technique-passation.md` §8.1) : sections `quality/plan/NN-*.md` (Objet et périmètre, Niveaux de test, Environnements de test, Données de test, Critères d'entrée et de sortie, Recette avec le client), section proposée « Suivi des régressions », proposition de l'agent dans le cadre pointillé, section à rédiger, colonne Agent (vue client : Questions et commentaires).

## 5. Validation

Valider (owner, admin, développeur) seulement si **chaque critère d'acceptation a au moins un scénario** ; validation liée au commit ; message « Qualité validée · les 6 livrables sont validés : la Baseline 0 peut être posée » ; compteur Spec 6/6. Changement amont (fonctionnel, design, technique) → « À revoir » sur les scénarios concernés.

## 6. Contrat

| Procédure | Usage |
|---|---|
| `spec.quality.scenarios.list({ feature?, level?, q?, cursor, limit })`, `.byId` | Scénarios |
| `spec.quality.coverage()` | indicateurs, tableau, exigences (consommé aussi par le lot 8) |
| `spec.quality.strategy()`, `spec.quality.fixtures.list()` | Stratégie, jeux |
| `spec.document.sections({ deliverable: 'quality' })` | Document |
| `ai.proposeDeliverable({ deliverable: 'quality', mode: 'gaps' \| 'update' \| 'nfr' \| 'fx', scope? })` | propositions `scenario`, `strategy`, `fixture`, `doc_section` ; `scope: { ac: 'F-003#AC-3' }` pour « Proposer un scénario » sur un critère |
| `specBatch.submit` | `scenario.*`, `strategy.update`, `fixture.*`, `doc.section.*` |

## 7. Droits
Comme le lot 8 ; client : lecture (sans Gherkin), commentaires.

## 8. Critères d'acceptation
- [ ] Relecture, Liste, À revoir, Vue client ; 5 onglets ; Gherkin français source de vérité.
- [ ] Couverture calculée (critères, exigences, règles, écrans, parcours) et reprise par le lot 8.
- [ ] Validation bloquée tant qu'un critère n'a pas de scénario ; déblocage de la Baseline 0.
- [ ] Document en disposition espace Idée ; `SpecItemSheet` sur Nouveau scénario / Modifier ; bouton agent commun.
- [ ] Captures : chaque état × onglet, équipe et client, clair, sombre, 375 px.

## 9. Tickets

```
- [ ] **[TK-?]** Lot 10a · Spec · Qualité : formats quality/*, onglets Scénarios (groupes, critères sans scénario, fiche + Gherkin) et Jeux de données, relecture groupée, ai.proposeDeliverable 'quality'. Réf. design/refonte/lot-10-qualite-passation.md §1 à §4.1, §4.4. — dépend du lot 9
- [ ] **[TK-?]** Lot 10b · Spec · Qualité : Couverture (et statut des exigences du lot 8), Stratégie et règles de fusion, Document, validation et déblocage de la Baseline 0. Réf. §4.2, §4.3, §4.5, §5. — dépend de 10a
```
