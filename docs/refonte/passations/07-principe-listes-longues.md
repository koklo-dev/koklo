# Refonte UI · Principe transversal · Listes longues (pagination et chargement progressif)

> Validé par Brice le 05/11/2026 après recette visuelle.
> Maquette de référence : canevas « Koklo — maquettes » (copie locale qui fait foi : `docs/refonte/maquettes/12-PrincipeListes.html` ; lire le code avec `pnpm maquette <numéro>`), planche **Principe · listes longues**. Le sélecteur en haut à droite montre les 4 schémas ; la colonne de droite reprend les règles ci-dessous. Les planches des lots 3 à 6 ont été mises à jour (compteurs, pieds de liste, pagination, mini-carte, filtres de relecture).
> **S'applique à tous les lots (0 à 13).** Toute vue qui affiche des données venant de la base suit un des 4 schémas ci-dessous. Une passation de lot qui ne le précise pas applique ce document par défaut.

## 0. Règle de base

Rien de ce qui vient de la base n'est chargé en entier côté client. Un projet réel aura des centaines de fonctionnalités, de règles, de tables, de tickets, de propositions. Les maquettes montrent 3 à 7 éléments pour la lisibilité ; le code doit fonctionner avec 1 000.

- **Toujours afficher le total réel** (« 248 fonctionnalités · 50 chargées »), calculé côté serveur.
- **Recherche, filtres, tri et compteurs de filtres côté serveur**, jamais sur les seules lignes chargées.
- **État dans l'URL** (`?q=`, filtres, `?page=`, `?sel=`), pour les liens directs et le retour arrière.
- **Lien direct vers un élément** (`?sel=F-187`) : le serveur renvoie la page qui le contient, la ligne est amenée à l'écran et sélectionnée.
- Bibliothèques : TanStack Query (`useInfiniteQuery` / `useQuery` avec `placeholderData: keepPreviousData`) et `@tanstack/react-virtual`.

## 1. Les 4 schémas

### 1.1 Liste + fiche : défilement infini
Pour parcourir et ouvrir des éléments un par un.

- Pages de **50 par curseur** ; la page suivante est demandée à **80 %** du défilement (sentinelle `IntersectionObserver`), sans clic. Le bouton « Charger la suite » reste en repli clavier et lecteur d'écran.
- **Liste virtualisée** (hauteur de ligne fixe : 52 px pour les listes, 44 px pour la relecture) : seules les lignes visibles + 10 de marge sont dans le DOM.
- Barre de compte au-dessus (`role="status"`) : « **248 fonctionnalités** · 50 chargées · 31 à valider » + tri.
- **Pied de liste** (composant `ListFooter`), 4 états :
  - suite à charger : `expand_circle_down`, « Les 50 suivantes se chargent automatiquement en approchant du bas. », « Charger la suite » ;
  - chargement : 4 lignes squelettes (`motion-safe:`) + « Chargement des 50 suivantes… » ;
  - erreur : fond erreur clair, « Impossible de charger la suite. Les N premières restent affichées. », « Réessayer » ;
  - fin : `check`, « Fin de la liste · 248 fonctionnalités », « Revenir en haut » si la liste dépasse deux écrans.
- **Recherche sans résultat** : `EmptyState` `search_off`, « Aucune fonctionnalité ne correspond à « … » », « La recherche porte sur les 248 fonctionnalités, pas seulement celles affichées. », « Effacer la recherche ».
- Retour depuis une fiche : pages chargées et position de défilement restaurées (cache de requêtes + `scrollRestoration`).
- Grilles de cartes (projets, règles, parcours) : même schéma, pages de **24**, virtualisation par rangée.

### 1.2 Tableau : pagination numérotée
Pour des données qu'on compare ou retrouve par position.

- Pagination par décalage : « 1–25 sur 1 240 », précédent / suivant, numéros avec ellipses (`1 … 19 20 21 … 50`), page courante en `--primary` avec `aria-current="page"`.
- Taille **25 / 50 / 100**, mémorisée par utilisateur. Changer un filtre ou la taille revient en page 1.
- En-tête de tableau collant ; défilement interne au tableau. Pendant le changement de page, la page précédente reste affichée en fondu (pas de saut de hauteur).
- Au-delà de 10 000 lignes : total estimé (« environ 12 000 ») et passage au curseur (précédent / suivant seulement).

### 1.3 Diagramme : zones et niveau de détail
Un modèle de 60 tables (ou une architecture de 40 composants) ne se lit pas d'un bloc.

- **Au-delà de 25 nœuds**, la vue de départ montre des **zones** (champ `domaine:` des fichiers, proposé par l'agent, modifiable) : cadre en pointillés, nom, icône, « 14 tables », aperçu ; traits entre zones avec « 12 relations ».
- Cliquer une zone l'ouvre ; fil « Toutes les zones · 65 tables / Réservation » pour remonter ; les liens sortants sont résumés (« → 12 liens vers Clients, Paiement… »).
- « **Aller à une table** » (touche `/`) : recherche serveur, ouvre la zone, centre et sélectionne la table.
- **Niveau de détail** : sous 60 % de zoom, une table n'affiche que son nom ; ses champs apparaissent au-dessus.
- Rendu limité aux nœuds visibles (culling) ; **mini-carte** en bas à gauche (150 px, cadre de la vue en `--primary`, cliquable pour se déplacer) ; zoom en bas à droite (lot 6).
- Mode focus depuis une fiche : la table et ses voisines directes uniquement.

### 1.4 Relecture en volume : groupes
Une génération initiale peut produire des centaines de propositions.

- Barre de relecture avec **progression** (acceptées `--primary`, rejetées grisées, reste à relire) et compteurs.
- Filtre **« À relire » par défaut** (les décisions prises sortent de la vue) / « Toutes ».
- **Au-delà de 30 propositions**, regroupement par type puis par zone ; groupes repliables, en-têtes collants (« Fonctionnalités · Réservation · 42 · 18 acceptées · 22 à relire »).
- Chaque groupe montre 8 éléments puis « Afficher 20 de plus · N restantes dans ce groupe » ; le groupe ouvert est virtualisé.
- **« Accepter les N restantes »** par groupe uniquement (jamais toute la relecture d'un coup), annulable tant que rien n'est enregistré.
- J / K passe au groupe suivant aux limites.
- **Génération par lots** : l'agent produit une zone à la fois ; les groupes apparaissent au fil de l'eau et la relecture commence avant la fin.
- Enregistrement : un seul `specBatch.submit` si ≤ 200 opérations, sinon découpé en commits par groupe, avec un récapitulatif unique.
- Vue client (validation une par une) : progression « 12 / 248 », « Aller à la suivante non traitée », filtre « Non traitées ».

## 2. Où s'applique quel schéma

| Vue | Schéma |
|---|---|
| Projets (lot 4) | 1.1 grille, pages de 24 |
| Vue d'ensemble (lot 3) : « à traiter », activité | les 5 premiers + lien vers la liste complète (1.1) ; « Voir toute l'activité » ouvre le fil complet en 1.1 |
| Idée (lot 2) : pages, commentaires, propositions | pages : pas de pagination (structure courte) ; commentaires 1.1 ; propositions 1.4 |
| Fonctionnalités, parcours (lot 5) | 1.1 |
| Règles métier (lot 5) | 1.1 grille, pages de 24, filtre par type |
| Rôles et permissions (lot 5) | matrice : actions groupées par ressource au-delà de 20, groupes repliables, filtre ; en-tête et première colonne collants |
| Données · Diagramme (lot 6) | 1.3 |
| Données · Tables (lot 6) | 1.1 |
| Données · Jeux d'exemple (lot 6) | 1.2 par jeu |
| Architecture (lot 7) | 1.3 pour le schéma, 1.1 pour les décisions (ADR) |
| Technique, Qualité (lots 8, 10) | 1.1 (exigences, cas de test) ; résultats de tests 1.2 |
| Design (lot 9) | galerie d'écrans 1.1 grille, pages de 24 |
| Relecture de tous les livrables | 1.4 |
| Versions, baselines, journal (lot 11) | 1.2 |
| Tickets (lot 12) | 1.1 **par colonne** (30 cartes puis chargement en défilant dans la colonne) ; compteur par colonne dans l'en-tête |
| Membres, invitations (lot 13) | 1.2 |
| Recherche ⌘K, sélecteurs (`EntityChip`, combobox) | 1.1, 20 résultats, recherche serveur avec anti-rebond 200 ms |
| Barre latérale (badges, compteur Spec) | agrégats serveur (`spec.deliverables`), jamais calculés depuis des listes |

## 3. Contrat (oRPC, `@koklo/contract`)

```ts
// Curseur (schémas 1.1, 1.4)
ListInput  = { projectId, q?, filters?, sort?, cursor?: string, limit?: number /* défaut 50, max 100 */, around?: string /* id à amener dans la page */ }
ListOutput<T> = { items: T[], nextCursor: string | null, total: number, facets?: Record<string, Record<string, number>> }

// Décalage (schéma 1.2)
PageInput  = { projectId, q?, filters?, sort?, page: number, size: 25 | 50 | 100 }
PageOutput<T> = { items: T[], total: number, totalIsEstimate: boolean }

// Diagramme (schéma 1.3)
data.zones({ projectId }) → { zones: { id, name, icon, tableCount, links: { to, count }[] }[] }
data.zone({ projectId, zone }) → tables + relations de la zone + liens sortants résumés
data.search({ projectId, q }) → { id, name, zone }[]

// Relecture (schéma 1.4)
proposal.list({ runId, groupBy: 'type' | 'type_zone', status?: 'pending' | 'all', cursor?, limit? }) → ListOutput + groups: { key, label, total, accepted, rejected, pending }[]
proposal.decideMany({ ids, decision }) // « Accepter les N restantes »
```

- Curseurs opaques, stables sous insertion (tri + id comme départage). `total` exact jusqu'à 10 000.
- Les procédures `*.get` des passations précédentes (`spec.functional.get`, `spec.data.get`…) deviennent des `*.list` paginées par onglet ; la fiche est chargée à part (`*.byId`).
- Index base de données sur `(project_id, <tri>, id)` pour chaque liste ; recherche plein texte (Postgres `tsvector` ou équivalent) pour `q`.

## 4. Composants à ajouter au socle (lot 0)

`VirtualList` (lignes fixes, sentinelle, restauration du défilement), `CountBar`, `ListFooter` (4 états), `Pagination` (numéros, taille, `aria-current`), `GroupSection` (repliable, en-tête collant, action de groupe, « Afficher N de plus »), `DiagramMinimap`, `ZoneNode`. Chacun avec ses états clair / sombre et ses tests d'accessibilité.

## 5. Accessibilité

- Liste virtualisée : `role="list"` / `listitem` conservés, `aria-setsize` = total et `aria-posinset` = position réelle sur chaque élément rendu.
- Arrivée d'une page annoncée dans la région `role="status"` (« 50 fonctionnalités de plus chargées · 100 sur 248 »), sans voler le focus. Le focus reste sur l'élément actif quand la liste grandit.
- Pagination : `nav aria-label="Pagination"`, boutons nommés (« Page précédente »), page courante `aria-current="page"`, ellipses non focalisables.
- Groupes : bouton d'en-tête avec `aria-expanded` ; action de groupe nommée avec son compte.
- Le chargement à 80 % ne s'applique pas au clavier pur : « Charger la suite » est toujours atteignable.

## 6. Critères d'acceptation (à ajouter à chaque lot concerné)

- [ ] Données de test de charge : 1 000 fonctionnalités, 300 règles, 80 tables, 500 tickets, 400 propositions dans un projet de démonstration (`pnpm seed:large`).
- [ ] Chaque vue reste fluide (60 i/s au défilement, première page < 300 ms côté serveur sur ce jeu).
- [ ] Recherche et filtres testés sur des éléments non chargés.
- [ ] Lien direct vers un élément hors de la première page.
- [ ] États de pied de liste capturés (suite, chargement, erreur, fin) et recherche vide.

## 7. Effets sur les passations existantes

- **Lots 0-1** : ajouter les composants du §4 au socle ; recherche ⌘K et sélecteurs en 1.1.
- **Lot 2** : commentaires en 1.1, propositions de l'agent en 1.4.
- **Lot 3** : listes de la vue d'ensemble bornées à 5 + lien ; « Voir toute l'activité ».
- **Lot 4** : grille de projets en 1.1 (24).
- **Lot 5** : `spec.functional.get` → `spec.functional.list` par onglet ; matrice des rôles groupée ; relecture en 1.4 ; validation client avec progression et « suivante non traitée ».
- **Lot 6** : champ `domaine:` dans `data/tables/*.yaml` ; diagramme en 1.3 dès 25 tables ; jeux d'exemple en 1.2 ; `spec.data.get` découpé en `spec.data.tables.list`, `data.zones`, `data.zone`.

## 8. Ticket à ajouter au sprint (format du vault)

```
- [ ] **[TK-?]** Socle listes longues : contrat ListInput/ListOutput et PageInput/PageOutput, VirtualList, CountBar, ListFooter, Pagination, GroupSection, DiagramMinimap, ZoneNode, proposal.list groupé + proposal.decideMany, seed:large. Réf. design/refonte/principe-listes-longues.md. `pkg:contract` `pkg:ui` `pkg:api` — à faire avant les lots 5 et 6, à reprendre dans chaque lot suivant
```
