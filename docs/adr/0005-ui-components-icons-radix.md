---
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_commit: f442681
---
# 0005 — Bâtir les composants de `@koklo/ui` sur Radix, avec des icônes Material Symbols en SVG à la demande

- **Statut** : accepté
- **Date** : 2026-10-27
- **Décideurs** : tech-lead, developer

## Contexte
TK-84 livre les icônes et treize composants shadcn de `DESIGN.md` §4-§5. shadcn/ui s'appuie par défaut
sur Lucide pour ses glyphes internes, ce que `DESIGN.md` §4 remplace par Material Symbols Rounded.
Les icônes ne doivent ni charger la police complète ni faire de requête réseau (test e2e « aucune
requête distante »).

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| Police Material Symbols | Un seul fichier, axes variables | Lourde, rendu dépendant du chargement, requête distante |
| Iconify à l'exécution | Catalogue complet | Requêtes réseau au rendu |
| SVG générés depuis `@material-symbols/svg-400`, un module par icône | Chargement à la demande, aucune requête, registre fermé typé | Étape de génération à relancer pour ajouter une icône |

## Décision
- `Icon` rend un `<svg>` (viewBox `0 -960 960 960`) dont le tracé est importé dynamiquement depuis
  `src/icons/generated/<nom>.ts`, produit par `pnpm --filter @koklo/ui icons:generate` à partir de
  `@material-symbols/svg-400` (devDependency, non embarquée). Les trois icônes de `StatusBadge` sont
  importées statiquement pour un rendu sans attente.
- Composants : paquet unifié `radix-ui`, `class-variance-authority`, `react-resizable-panels` v4.
- Aucune dépendance Lucide : règle Biome `noRestrictedImports` et test de scan du dépôt.
- Animations : deux `@keyframes` dans `index.css` (`animate-overlay-in`, `animate-content-in`),
  toujours sous `motion-safe:`. `tw-animate-css` n'est pas adopté : son `package.json` n'a pas
  d'export résolvable par `require.resolve`, ce que les tests de compilation CSS existants exigent.
- `pnpm-workspace.yaml` : `@material-symbols/svg-400@0.48.2` ajouté à `minimumReleaseAgeExclude`
  (publié le jour même, plus récent que le délai de maturité).

## Conséquences
Le point d'entrée `@koklo/ui` est l'unique API (aucun sous-chemin). Ajouter une icône = éditer
`ICON_NAMES` dans `scripts/generate-icons.ts` puis régénérer et committer.

## Version retenue
| package | version retenue | dernière stable observée | source | docs consultées |
|---|---|---|---|---|
| radix-ui | 1.8.1 | 1.8.1 | `npm view radix-ui dist-tags.latest` (2026-10-27) | Context7 `/radix-ui/primitives` |
| class-variance-authority | 0.7.1 | 0.7.1 | `npm view` (2026-10-27) | API cva connue, inchangée |
| react-resizable-panels | 4.15.0 | 4.15.0 | `npm view` (2026-10-27) | Context7 `/bvaughn/react-resizable-panels` (Group, Panel, Separator) |
| @material-symbols/svg-400 | 0.48.2 | 0.48.2 | `npm view` (2026-10-27) | README du paquet |

## Preuves
`pnpm --filter @koklo/ui lint|typecheck|test|build|e2e`, `pnpm lint`, `pnpm audit` : voir `.workflow/TK-84/04-green.md`.
