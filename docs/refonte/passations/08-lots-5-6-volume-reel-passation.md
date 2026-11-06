# Refonte UI · Lots 5 et 6 en volume réel : complément de passation

> Validé par Brice le 05/11/2026 après recette visuelle.
> Complète `lot-5-fonctionnel-passation.md` et `lot-6-donnees-passation.md`, en application de `principe-listes-longues.md`. **En cas d'écart, ce document prime.**
> Maquettes : planches **Lot 5 · Fonctionnel** et **Lot 6 · Données**. Un second sélecteur en pointillés, « Démo / Volume réel » (propre à la maquette), bascule entre les petits jeux de lecture et des volumes réalistes. Elles s'ouvrent en **Volume réel** : c'est la référence d'implémentation.

## 1. Lot 5 · Fonctionnel

### 1.1 Liste équipe et vue client
| Onglet | Volume de la maquette | Comportement |
|---|---|---|
| Fonctionnalités | 248 | Barre de compte « 248 fonctionnalités · 50 chargées » ; liste virtualisée dans un cadre à défilement interne (hauteur max. 600 px à 1080 px d'écran, sinon jusqu'au bas de la fenêtre) ; pages de 50 ; pied de liste (suite / chargement / erreur / fin). |
| Règles métier | 86 | Barre de compte + recherche « Rechercher une règle ou R-nnn » ; grille de cartes par pages de 24 ; pied de liste séparé. |
| Rôles et permissions | 3 rôles, 47 actions | Au-delà de 20 actions, la matrice est **groupée par ressource** : ligne de groupe (`th scope="rowgroup"`, fond `--surface`, chevron, « Paiement et caisse · 12 actions ») ; groupes de moins de 5 actions ouverts par défaut, les autres repliés ; filtre « Filtrer les actions » dans la légende du tableau. |
| Parcours | 18 | Barre de compte + recherche ; cartes par pages de 6 ; pied de liste. |

- Résumé de l'en-tête et compteurs d'onglets : vrais totaux (`spec.deliverables` / `total` des listes), jamais la longueur des pages chargées.
- **Vue client** : progression sur les totaux (« Fonctionnalités 6/248 · parcours 0/18 · règles et rôles 0/2 ») ; barre de compte « 50 chargées · 242 à traiter » ; après Valider / Demander un changement, passage à la suivante non traitée, en chargeant la page suivante si besoin.

### 1.2 Relecture en volume
- Bandeau de relecture : **barre de progression** pleine largeur (6 px, acceptées `--primary`, rejetées `--muted-foreground` à 50 %, fond `--border-strong`) sous la ligne de compteurs.
- Liste des propositions (330 px) : défilement interne (hauteur max. 880 px).
- **Au-delà de 30 propositions dans l'onglet** :
  - en tête de liste, filtres « À relire · N » (par défaut) et « Toutes · N » + mention « Groupées par zone » / « Groupées par type » ;
  - **Fonctionnalités groupées par zone** (Réservation, Clients, Catalogue, Paiement, Personnel, Notifications), **règles par type** (Contraintes, Calculs, Workflows à états) ; rôles et parcours restent à plat sous le seuil ;
  - en-tête de groupe collant (`--surface`, contour `--border`, rayon 8) : chevron + nom (`aria-expanded`), bouton « Accepter les N » (`done_all`), ligne 11 px « 42 · 18 acceptées · 22 à relire » ;
  - le groupe de la proposition affichée est ouvert, les autres repliés ;
  - 8 éléments par groupe, puis « Afficher 20 de plus · N restantes » ;
  - « Accepter les N » accepte toutes les propositions en attente **du groupe**, y compris celles non affichées ; annulable par élément (« Remettre à relire ») tant que rien n'est enregistré.
- La zone d'une fonctionnalité est proposée par l'agent (en-tête `zone:` de `features/F-nnn-*.md`), modifiable.

## 2. Lot 6 · Données

### 2.1 Diagramme
- **Au-delà de 25 tables, le diagramme s'ouvre sur la vue des zones** (maquette : 65 tables, 6 zones).
  - Au-dessus du lecteur : fil « **Toutes les zones · 65 tables** / Prise de rendez-vous · 6 tables · 17 liens vers d'autres zones », et champ « **Aller à une table…** » (touche `/`, recherche serveur, ouvre la zone et sélectionne la table).
  - Zone : carte 300 × 180 px, contour pointillé 1,5 px `--border-strong`, rayon 14, icône 20 `--primary`, nom 15/600, « 9 tables · cliquez pour ouvrir » (en relecture : « · 4 à relire »), puis les noms des 7 premières tables en puces mono 10 px + « +N ».
  - Liens entre zones : trait dont l'épaisseur croît avec le nombre de relations, étiquette « 5 relations ».
  - Cliquer une zone l'ouvre à 100 % ; la zone « Prise de rendez-vous » est le diagramme détaillé du lot 6.
- **Niveau de détail** : sous 60 % de zoom, les tables n'affichent que leur en-tête ; la ligne d'aide devient « Zoom sous 60 % : seuls les noms des tables s'affichent. Zoomez pour voir les champs. »
- **Mini-carte** (150 × 154 px, en bas à gauche) : reprend la vue courante (zones, ou tables de la zone), table ou zone sélectionnée en `--primary`, cadre de la vue.
- Champ `domaine:` (identifiant de zone) obligatoire dans `data/tables/<slug>.yaml` dès que le modèle dépasse 25 tables ; l'agent le propose ; `data/_zones.yaml` porte nom et icône de chaque zone.

### 2.2 Tables et jeux d'exemple
- **Tables** : barre de compte « 65 tables · 50 chargées » + recherche « Rechercher une table ou un champ » ; nouvelle colonne **Zone** ; en-tête de tableau collant ; défilement interne (max. 700 px) ; pages de 50 ; pied de liste.
- **Jeux d'exemple** : pagination numérotée par jeu (« 26–50 sur 1 240 », 25 lignes par page, précédent / suivant, numéros avec ellipses, page courante `aria-current="page"`) ; méta « 1 240 lignes · T-reservation · locale fr-FR ». Les lignes sont générées côté serveur à partir du fichier `data/fixtures/FX-*.yaml` (graine + règles de génération), pas stockées ligne à ligne au-delà de 50.

### 2.3 Relecture
- Mêmes règles que §1.2 : 67 propositions groupées par zone + un groupe « Relations et jeux d'exemple » ; filtres, en-têtes collants, « Accepter les N », « Afficher 20 de plus », barre de progression.
- Dans la vue des zones en relecture, chaque zone affiche son nombre de tables à relire ; dans une zone, les tables à relire gardent le contour pointillé.

## 3. Contrat (en plus du principe)

| Procédure | Usage |
|---|---|
| `spec.functional.list({ tab, q?, filters?, cursor?, limit })` | listes paginées des 4 onglets (remplace `spec.functional.get`) |
| `spec.roles.matrix({ projectId, group?, q? })` | groupes de ressources avec compte ; actions d'un groupe à l'ouverture |
| `spec.data.tables.list({ q?, zone?, cursor?, limit })` | onglet Tables |
| `data.zones`, `data.zone`, `data.search` | diagramme (cf. principe §3) |
| `spec.data.fixture.page({ fixtureId, page, size })` | jeux d'exemple paginés |
| `proposal.list({ runId, tab, groupBy, status, cursor })`, `proposal.decideMany` | relecture groupée |

## 4. Critères d'acceptation ajoutés

- [ ] Avec `seed:large` (248 fonctionnalités, 86 règles, 47 actions, 18 parcours, 65 tables, 1 240 réservations d'exemple), chaque onglet des lots 5 et 6 se comporte comme la planche en Volume réel.
- [ ] Vue des zones dès 25 tables ; « Aller à une table » ; niveau de détail sous 60 % ; mini-carte synchronisée.
- [ ] Relecture groupée au-delà de 30 propositions, « Accepter les N » limité au groupe.
- [ ] Captures en Volume réel : chaque onglet, relecture groupée, vue des zones, zone détaillée, zoom 50 %, page 2 d'un jeu d'exemple.

## 5. Tickets (format du vault)

```
- [ ] **[TK-?]** Lots 5-6 · volume réel : listes paginées des onglets Fonctionnel (spec.functional.list), matrice des rôles groupée, relecture groupée (proposal.list groupBy, decideMany, barre de progression). Réf. design/refonte/lots-5-6-volume-reel-passation.md §1, §3. — dépend du ticket « Socle listes longues »
- [ ] **[TK-?]** Lot 6 · volume réel : vue des zones, Aller à une table, niveau de détail, mini-carte, onglet Tables paginé avec colonne Zone, jeux d'exemple paginés (spec.data.fixture.page), champ domaine et data/_zones.yaml. Réf. §2, §3. — dépend de 6b
```
