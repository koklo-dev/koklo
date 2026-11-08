---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-08
covers_commit: 0666e7b
---
# 0020 — Réordonnancement : `@dnd-kit` (core 6.3.1, sortable 10.0.0, utilities 3.2.2)

- **Statut** : accepté le 2026-11-08 (TK-89, lot C ; la passation 02 nomme déjà la bibliothèque)
- **Date** : 2026-11-08
- **Décideurs** : developer, designer (ticket TK-89)

## Contexte
Les pages du dossier d'idée se réordonnent à la souris et au clavier (WCAG 2.2 : 2.5.7, mouvement de glisser avec alternative ; 2.1.1, clavier). `ReorderableList` rejoint la bibliothèque `@koklo/ui`.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. `@dnd-kit` (core, sortable, utilities) | Capteurs pointeur et clavier séparés ; poignée comme vrai `button` ; annonces et instructions personnalisables ; sans style ; MIT ; **aucune faille connue** sur `@dnd-kit/sortable` 10.0.0 (OSV, 2026-11-08) | Trois paquets exacts ; son propre `role="status"` vide pour les annonces |
| B. `react-beautiful-dnd` | Connu | Plus maintenu ; écartée |
| C. Glisser natif HTML5 | Aucune dépendance | Pas de clavier ni de tactile ; écartée |
| D. Boutons Monter et Descendre seuls | Aucune dépendance | Pas de glisser pour qui le préfère |

## Décision
Option A, versions exactes **6.3.1**, **10.0.0** et **3.2.2**, ajoutées aux dépendances de `@koklo/ui` seulement.
- Clavier : Espace saisit, flèches déplacent, Espace dépose, Échap annule ; Alt + flèche haut ou bas déplace d'un cran depuis la poignée.
- Annonces en `aria-live="polite"` écrites par le composant (« Périmètre déplacée en position 4 sur 11 ») ; celles de la bibliothèque sont neutralisées.
- Aucune animation si l'utilisateur réduit les animations.
- Sous 768 px, pas de glisser tactile : le menu de la page propose Monter et Descendre.

## Conséquences
- `@dnd-kit` n'est importé que par `reorderable-list.tsx` ; aucune application ne l'importe.
- Trois dépendances de production à suivre dans `dependency-audit`.
