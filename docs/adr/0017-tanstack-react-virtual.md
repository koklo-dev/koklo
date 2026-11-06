---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-06
covers_commit: 39a091c
---
# 0017 — Virtualisation des listes longues : `@tanstack/react-virtual` 3.14.26

- **Statut** : accepté le 2026-11-06 par Brice (TK-94, lot B ; la passation 07 §0 nomme déjà la bibliothèque)
- **Date** : 2026-11-06
- **Décideurs** : developer, designer (ticket TK-94)

## Contexte
Toute liste issue de la base doit rester fluide avec 1 000 éléments (passation 07 §0 et §6 : 60 images par seconde au défilement, seules les lignes visibles et 10 de marge dans le DOM). Le composant `VirtualList` de `@koklo/ui` (lignes de 52 px ou 44 px, `aria-setsize` = total du serveur, `aria-posinset` = rang réel, sentinelle à 80 %, restauration du défilement, lien direct `?sel=`) a besoin d'un moteur de virtualisation. `apps/web` utilise déjà `@tanstack/react-query` 5.105.0 pour `useInfiniteQuery`.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. `@tanstack/react-virtual` 3.14.26 | Headless : on garde le balisage `role="list"` / `listitem`, `aria-setsize`, `aria-posinset` et les jetons du produit ; même famille que `react-query` ; `scrollToIndex` avec alignement centré, `initialOffset` (restauration), `getItemKey` stable pour garder le focus quand la liste grandit ; pairs React 16.8 à 19 ; licence MIT ; aucune vulnérabilité connue (OSV, GitHub Advisories) ; 64 ko dépaquetés, une seule dépendance (`@tanstack/virtual-core`) | Rien n'est rendu pour nous : le positionnement et l'accessibilité sont écrits dans `VirtualList` |
| B. `react-window` 2.5.3 | Léger, API courte, composants de lignes prêts à l'emploi | Composants qui rendent le conteneur et les lignes à notre place : moins de maîtrise du balisage `list` / `listitem` et des attributs ARIA par ligne ; non évalué plus avant (écartée sur ce critère, non par une mesure) |
| C. `react-virtuoso` 4.18.20 | Complet : chargement infini, groupes, pied de liste intégrés | Ses fonctions intégrées recouvrent `ListFooter`, `CountBar` et `GroupSection`, déjà spécifiés par la passation 07 avec leur texte exact ; plus lourd ; non évalué plus avant (écartée sur ce critère, non par une mesure) |
| D. Virtualisation maison | Aucune dépendance | Lignes de hauteur fixe seulement au départ, mais il faut réécrire mesure, marge, `scrollToIndex`, restauration de position et correctifs de navigateurs ; coût de maintenance sans bénéfice |

## Décision
Option A, version exacte **3.14.26** (dernière version stable au 2026-11-06, publiée le 2026-11-03), ajoutée aux dépendances de `@koklo/ui` seulement (`pnpm --filter @koklo/ui add @tanstack/react-virtual@3.14.26 --save-exact`).
- Le moteur reste caché derrière `VirtualList` ; aucune application ne l'importe directement.
- Hauteurs fixes (52 px, 44 px) : `estimateSize` constant, pas de `measureElement`.
- Si le conteneur mesure 0 px (rendu serveur, onglet caché), `VirtualList` suppose une fenêtre de 10 lignes plutôt que de ne rien rendre.
- Le kanban ne virtualise pas ses colonnes dans ce ticket (cartes de hauteur variable, 30 par page) : hypothèse H8 de l'analyse, à rouvrir par ADR si la mesure de fluidité échoue sur 300 cartes.

## Conséquences
- Une dépendance de production en plus (`@tanstack/virtual-core` en transitif), à suivre dans `dependency-audit` ; montée de version par Dependabot comme les autres paquets `@tanstack/*`.
- Les tests de `VirtualList` simulent la hauteur du conteneur (`offsetHeight`) et `IntersectionObserver`, car jsdom ne calcule aucune mise en page ; la fluidité réelle (T23) se mesure en e2e dans un navigateur.
- `@tanstack/react-virtual` est la seule bibliothèque de virtualisation autorisée dans le dépôt : toute autre demande passe par un nouvel ADR.
