# Refonte UI · Lot 6 · Spec · Données : passation à l'agent dev

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/11-Lot6Donnees.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Lot 6 · Données (tous les états)**. Le sélecteur en pointillés en haut à droite (Prêt, Génération, Relecture, Liste · équipe, Vue client) est propre à la maquette. Dans chaque état, les onglets, les tables du diagramme, le zoom et le sélecteur Fiche / YAML / Mermaid sont cliquables ; en relecture, Accepter / Rejeter fonctionnent ; en liste, « Valider le modèle » fonctionne.
> À lire avant : `design/refonte/decisions-2026-11-05-spec-sans-brief.md` et `design/refonte/lot-5-fonctionnel-passation.md` (socle commun : `ProposalReview`, `SpecCollection`, `proposal.decide`, `spec.deliverables`, validation liée au commit, impact amont).
> Prérequis : lot 5 (5a à 5c).

Ce lot livre la page **Spec · Données** (route `/projects/[id]/spec/data`) : le modèle de données du projet, proposé par l'agent depuis le cahier fonctionnel, relu par l'équipe, **validé par l'équipe** (le client lit et commente). Il réutilise tout le socle du lot 5 ; ce document ne décrit que ce qui est propre aux données.

## 1. Format dans le dépôt de spec (décision)

- **Source de vérité : un fichier YAML par table**, `data/tables/<slug>.yaml`. C'est ce que l'agent lit et modifie : un format structuré, petit à relire en différences, qui porte ce qu'aucun autre format ne porte (contraintes, valeurs d'énumération, données personnelles, provenance).
- **Générés, jamais édités à la main** (régénérés à chaque `specBatch.submit` touchant `data/`) :
  - `data/model.mmd` : `erDiagram` Mermaid du modèle entier, affiché nativement par GitHub ;
  - le SQL de migration : **au lot Technique**, une fois la base choisie (pas dans ce lot).
- `data/_layout.yaml` : positions des tables dans le diagramme (`{ T-xxx: { x, y } }`), écrit quand un membre déplace une table ; absent → placement automatique.
- `data/fixtures/FX-<slug>.yaml` : jeux d'exemple (lignes fictives typées d'après les tables), utilisés par les maquettes (lot 9) et les tests (lot 10).

Schéma d'un fichier table (Zod côté serveur, invalide → proposition écartée) :

```yaml
id: T-reservation
nom: Réservation
description: >
  Cœur du produit : un client, un créneau, un service.
source: [F-001, F-002, F-006]        # fonctionnalités, règles qui justifient la table
champs:
  - nom: id
    type: uuid
    cle: primaire
  - nom: client_id
    type: ref(T-client)
    contraintes: "Obligatoire"
  - nom: statut
    type: enum
    valeurs: [confirmee, honoree, annulee, absente]
    regle: R-004
  - nom: telephone
    type: texte(20)
    contraintes: "Obligatoire, unique, E.164"
    donnees_personnelles: true        # relié à NFR-001
relations:
  - vers: T-client
    cardinalite: "n → 1"
```

Types autorisés : `uuid`, `texte(n)`, `entier`, `decimal`, `booleen`, `horodatage`, `date`, `enum`, `json`, `ref(T-xxx)`. Cardinalités : `1 → 1`, `1 → 0..1`, `1 → n`, `n ↔ n`. Références vérifiées à l'enregistrement (`ref` et `vers` vers une table existante ou du même lot, `source` vers des F / R existants).

## 2. En-tête (`ProjectHeader`)

- Ligne 1 : « <projet> / Spec / Données ».
- Ligne 2 : h1 « Modèle de données », statut, résumé 13 px, actions :

| État | Statut | Résumé | Actions |
|---|---|---|---|
| Prêt | Prêt (`arrow_forward`) | « Le cahier fonctionnel est enregistré » | aucune (dans l'état vide) |
| Génération | Génération (`progress_activity`) | « Depuis le cahier fonctionnel » | Ajouter une table · « Proposer avec l'agent » désactivé |
| Relecture | En cours (`edit`) | « N propositions à relire » | Ajouter une table · Reproposer |
| Liste (équipe) | « Validation de l'équipe · le client lit et commente » (`groups`, `--secondary`) puis « Validé par l'équipe » (vert) | « 6 tables · 6 relations · 2 jeux d'exemple » / « Validé par <prénom> le <date> · version <sha> » | Proposer avec l'agent · Ajouter une table · **« Valider le modèle »** (principal, `verified`) |
| Vue client | « Validé par l'équipe » (vert) | « 6 tables · lecture seule » | Commenter |

- Ligne 3 : onglets **Diagramme** (`schema`), **Tables** (`table`, compteur), **Jeux d'exemple** (`dataset`, compteur). En relecture, un onglet **Relecture** (`rate_review`, compteur « à relire » sur fond `--primary`) est ajouté **devant** Diagramme ; il est ouvert par défaut, visible seulement de l'équipe et seulement tant qu'une relecture est en cours.

## 3. États

### 3.1 Prêt
`EmptyState` : icône `database`, « L'agent peut proposer le modèle de données », « À partir du cahier fonctionnel enregistré : 7 fonctionnalités, 4 règles, 3 rôles, 2 parcours. Il propose les tables, leurs champs et contraintes, les relations et des jeux de données d'exemple. », actions « Proposer le modèle de données » (principal, `auto_awesome`) et « Ajouter une table ».

### 3.2 Génération
Bandeau `role="status"` (fond `--diff-bg`) : « L'agent déduit les tables et les relations du cahier fonctionnel. Cela peut prendre une minute. Vous pouvez quitter la page. » + « Annuler l'attente ». Squelette : 6 cadres de table vides dans le cadre du diagramme (`motion-safe:`).

### 3.3 Relecture (`ProposalReview` du lot 5)
- Bandeau « **Mode relecture** · l'agent propose N éléments depuis le cahier fonctionnel · A acceptés · P à relire » + « Enregistrer A dans la spec » + « Quitter la relecture », visible sur **tous les onglets**.
- **Onglet Relecture** : liste (320 px) des propositions : une par table (« Table · 5 champs · ← F-001, F-002 »), une « Relations » (toutes les relations), une « Jeux d'exemple ». Détail : chip id, titre, état, justification de l'agent (`auto_awesome`, « Déduite de F-001, F-002 et de la règle R-004 »), **tableau** Champ / Type / Contraintes (relations : De → À / Cardinalité / Sens ; jeux : Jeu / Table / Lignes), liens en `EntityChip`, barre Accepter (A) · Modifier · Rejeter (R) + champ « Demander une modification à l'agent » (ex. « ajoute le consentement SMS »).
- **Onglets Diagramme, Tables, Jeux d'exemple** restent consultables pendant la relecture et montrent le modèle proposé : dans le diagramme, une table **à relire** a un contour en pointillés, une table **rejetée** est à 40 % d'opacité ; légende au-dessus : « Pointillés : proposition à relire · estompée : rejetée. Les décisions se prennent dans l'onglet Relecture. »
- Rejeter une table rejette aussi les relations et champs `ref` qui la visent (signalé dans le récapitulatif avant enregistrement).

### 3.4 Liste · équipe

**Diagramme** (onglet par défaut)
- Ligne d'aide 12 px : « Cliquez une table pour voir sa fiche. » + légende (`1 → n` un vers plusieurs, `n ↔ n` plusieurs vers plusieurs, `key` clé).
- **Lecteur** sur toute la hauteur disponible (de sous les onglets jusqu'au bas de la fenêtre, marge 24 px) : cadre rayon 12, fond `--surface` avec trame de points (`radial-gradient` 1 px `--border`, pas de 20 px), défilement interne quand le diagramme dépasse.
- **Tables** : cartes de 230 px, en-tête (icône `table`, nom 13/600, id mono 10 px) sur `--secondary`, une ligne de 22 px par champ : icône (`key` ambre remplie = clé primaire, `link` `--primary` = référence, `shield` `--muted-foreground` = donnée personnelle), nom mono, type mono 11 px. Table sélectionnée : en-tête `--primary`, bordure 2 px `--primary`, ombre.
- **Relations** : traits SVG entre les centres des tables (1,5 px `--border-strong`, pointillés pour `n ↔ n`), étiquette de cardinalité en mono 11 px au milieu. Les relations de la table sélectionnée passent en `--primary` 2 px.
- Déplacer une table au glisser (équipe seulement) écrit `data/_layout.yaml` (sans relecture : c'est de la mise en page).
- **Commandes de zoom** en bas à droite du lecteur (barre flottante `--background`, bordure, ombre légère, `role="toolbar"` « Zoom du diagramme ») : « − » (Dézoomer), pourcentage mono (clic = 100 %), « + » (Zoomer), séparateur, `fit_screen` (Ajuster à l'écran). Paliers 50, 67, 75, 90, 100, 110, 125, 150, 200 %. Raccourcis `Ctrl/⌘ +`, `Ctrl/⌘ −`, `Ctrl/⌘ 0` quand le lecteur a le focus ; `Ctrl/⌘ + molette` zoome sous le pointeur. Le zoom est mémorisé par utilisateur (stockage local).
- **Fiche ancrée à droite** (340–400 px) : chip id + « Modifier », titre 20/600, puis un sélecteur segmenté **Fiche · YAML · Mermaid** (équipe seulement) :
  - **Fiche** : description, tableau Champ / Type / Contraintes (mention « données personnelles »), « Relations » (cardinalité mono + phrase : « Un créneau porte au plus une réservation (R-001) »), « Utilisée par » (`EntityChip` F-nnn + libellé) ;
  - **YAML** : chemin `data/tables/<slug>.yaml` + pastille verte « Source de vérité », contenu du fichier en `pre` mono 12 px (texte brut, défilement), note « Un fichier par table : c'est ce que l'agent lit et modifie. Le diagramme, le Mermaid et le SQL en sont dérivés. » ;
  - **Mermaid** : chemin `data/model.mmd` + pastille « Généré », contenu du modèle entier, note « Régénéré à chaque enregistrement depuis les fichiers YAML. GitHub l'affiche directement dans le dépôt de spec. Le SQL de migration sera généré au lot Technique, une fois la base choisie. » + action « Copier ».

**Tables** : tableau Table (chip + nom) / Champs / Relations / Utilisée par / Données personnelles (pastille ambre « Oui · NFR-001 » ou contour « Non ») ; clic sur une ligne → Diagramme avec la table sélectionnée. Note 12 px (`shield`) : « Les champs marqués « données personnelles » sont reliés à l'exigence NFR-001 (RGPD) du cahier technique. »

**Jeux d'exemple** : phrase « Données fictives, typées d'après les tables. Elles alimentent les maquettes d'écrans (lot Design) et les tests. » ; une section par jeu (chip `FX-…`, titre, « 3 lignes · T-client · locale fr-FR ») avec un tableau des lignes. Données toujours fictives (jamais de vraies personnes ; numéros et e-mails au format de test).

### 3.5 Validation (équipe)
- « Valider le modèle » : owner, admin, développeur. Pose une validation `target: { kind: 'deliverable' }` sur le commit courant (socle §5 du lot 5), statut « Validé par l'équipe », débloque **3 Architecture** (badge « Prêt » dans la barre, compteur Spec « 2/6 »).
- Toute modification ultérieure d'une table invalide la validation (retour « Validation de l'équipe »).

### 3.6 Vue client · lecture et commentaires
- Bandeau `role="note"` (fond `--surface`, `visibility`) : « **Lecture seule.** Le modèle de données est validé par l'équipe. Vous pouvez le lire et commenter ce qui vous semble manquer ou faux. »
- Mêmes onglets Diagramme / Tables / Jeux d'exemple, sans glisser, sans « Modifier », sans sélecteur YAML / Mermaid. Dans la fiche, à la place du tableau technique : **« Ce qu'on enregistre »**, liste en langage simple (« Son nom et son téléphone (obligatoires) », « S'il accepte de recevoir des SMS »), générée avec la table (champ `resume_client` du YAML, une phrase par groupe de champs) ; bouton « Commenter » (commentaire générique attaché à la table, visible de l'équipe dans la fiche et dans l'activité).
- Le client ne voit jamais les propositions en attente ni l'onglet Relecture.

## 4. Barre et vue d'ensemble

- Entrée « 2 Données » : badge « N à relire » (`--primary`) en relecture, sinon Prêt / En cours / Validé ; cadenas + infobulle « Disponible après le fonctionnel » tant que le Fonctionnel n'est pas enregistré (au moins une fonctionnalité).
- « 3 Architecture » : cadenas « Disponible après les données » jusqu'à la validation du modèle.
- Carte « Modèle de données » de la vue d'ensemble : statut et compteurs depuis `spec.deliverables`.

## 5. Contrat

| Procédure | Entrée → sortie |
|---|---|
| `spec.data.get` | `projectId` → tables (YAML parsé), relations, fixtures, layout, statut de validation |
| `spec.data.mermaid` | `projectId` → texte de `data/model.mmd` (généré à la volée si absent) |
| `spec.data.layout.save` | `projectId, positions` → commit direct de `data/_layout.yaml` |
| `ai.proposeDeliverable` | `deliverable: 'data'`, `mode: 'initial' \| 'update'` → propositions typées `table`, `relations`, `fixtures` |
| `specBatch.submit` | opérations `table.create`, `table.update`, `fixture.create` ; le serveur régénère `data/model.mmd` dans le même commit |
| `review.submit` | `target: { kind: 'deliverable' }` (équipe) ; commentaire client : `comment.create` sur `{ kind: 'table', id }` |

## 6. Impact amont

Sources amont : le cahier fonctionnel (fonctionnalités, règles). Quand une fonctionnalité ou une règle citée dans `source:` change, le modèle passe « À revoir » : `InlineAlert` « Le cahier fonctionnel a changé : F-002, R-004 modifiées », « Proposer les mises à jour » (`mode: 'update'`, différences champ par champ dans la relecture : ajout en vert, retrait barré, modification avant → après).

## 7. Droits

| Action | Owner, admin, développeur | Designer | Client | Business |
|---|---|---|---|---|
| Lire (diagramme, tables, jeux) | Oui | Oui | Oui (vue client) | Oui (vue client) |
| Voir YAML / Mermaid | Oui | Oui | Non | Non |
| Proposer, relire, modifier, déplacer | Oui | Non (lecture) | Non | Non |
| Valider le modèle | Oui | Non | Non | Non |
| Commenter | Oui | Oui | Oui | Oui |

## 8. Responsive et accessibilité

- **< 1280 px** : fiche en panneau superposé à droite. **< 1024 px** : le diagramme est remplacé par défaut par l'onglet Tables (le diagramme reste accessible, zoom « Ajuster » appliqué) ; relecture en navigation empilée. **< 768 px** : commandes de zoom 44 px, glisser désactivé.
- Le diagramme a une **alternative textuelle complète** : l'onglet Tables + les relations listées dans chaque fiche. Chaque table est un `button` (`aria-pressed`, `aria-label` « Table Réservation, 6 champs »), parcourable au clavier (Tab, Entrée). Le SVG des relations est `aria-hidden`. Boutons de zoom nommés, pourcentage annoncé dans la région `role="status"`.
- `pre` YAML / Mermaid : texte brut uniquement (aucune sortie du modèle rendue en HTML). Contrastes AA, axe sans violation sur chaque état et onglet.

## 9. Critères d'acceptation

- [ ] 5 états ; onglets Diagramme / Tables / Jeux d'exemple ; onglet Relecture devant Diagramme en relecture, équipe seulement.
- [ ] Diagramme sur toute la hauteur, sélection d'une table qui met ses relations en évidence, glisser enregistré dans `_layout.yaml`, zoom (boutons, paliers, raccourcis, ajuster).
- [ ] Fiche avec Fiche / YAML / Mermaid ; YAML = fichier réel du dépôt ; `model.mmd` régénéré à chaque enregistrement.
- [ ] Relecture : tables, relations, jeux ; état des propositions visible sur le diagramme ; récapitulatif avant enregistrement.
- [ ] Validation par l'équipe liée au commit, invalidée par modification, déblocage d'Architecture.
- [ ] Vue client en lecture simple (« Ce qu'on enregistre ») avec commentaires.
- [ ] Captures : chaque état × chaque onglet, équipe et client, clair, sombre, 375 px, zoom 50 % et 200 %.

## 10. Tickets à ajouter au sprint (format du vault)

```
- [ ] **[TK-?]** Lot 6a · Spec · Données : format data/tables/*.yaml (schéma Zod, références), génération data/model.mmd, spec.data.get / mermaid, ai.proposeDeliverable 'data', états Prêt / Génération / Relecture (onglet Relecture + état des propositions sur le diagramme), onglets Tables et Jeux d'exemple. Réf. design/refonte/lot-6-donnees-passation.md §1 à §3.3, §3.4 (Tables, Jeux), §5. `pkg:api` `pkg:contract` `pkg:web` — dépend du lot 5c
- [ ] **[TK-?]** Lot 6b · Spec · Données : diagramme (lecteur pleine hauteur, sélection, relations, glisser + _layout.yaml, zoom et raccourcis), fiche Fiche / YAML / Mermaid. Réf. §3.4 (Diagramme), §8. — dépend de 6a
- [ ] **[TK-?]** Lot 6c · Spec · Données : validation par l'équipe (review.submit deliverable, invalidation, déblocage Architecture), vue client (« Ce qu'on enregistre », commentaires), impact amont depuis le fonctionnel. Réf. §3.5, §3.6, §4, §6, §7. — dépend de 6b
```

## 11. Questions ouvertes (non bloquantes)

- Export du SQL / DBML depuis la fiche Mermaid : au lot Technique (le SQL dépend du choix de base).
- Index et performances (index composites, contraintes de performance) : à porter par le lot Technique (`tech/`), avec un lien depuis la fiche de la table.
