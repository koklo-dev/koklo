# 0001 — Organiser le code en monorepo pnpm workspaces + Turborepo

- **Statut** : accepté
- **Date** : 2026-10-26
- **Décideurs** : tech-lead

## Contexte
Koklo réunit plusieurs applications (`apps/web`, `apps/api`, `apps/worker`) et des paquets
partagés (`packages/domain`, `packages/ui`, `packages/config`…). L'architecture en ports et
adaptateurs (CDC §17.1) impose un domaine pur consommé par plusieurs adaptateurs, et la CI
(CDC §16.3) doit n'exécuter que ce qu'un changement touche.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| Un dépôt par paquet | Isolation forte | Versions à synchroniser, changements transverses en plusieurs PR |
| Monorepo npm/yarn workspaces seul | Peu d'outillage | Pas de cache ni d'ordonnancement des tâches |
| Monorepo pnpm + Turborepo | Installation stricte et rapide, graphe de tâches, cache, `--affected` | Un outil de plus à maintenir |

## Décision
Monorepo pnpm workspaces (`apps/*`, `packages/*`, `e2e`) orchestré par Turborepo. Les tâches
`lint`, `typecheck`, `test`, `build`, `dev` sont déclarées dans `turbo.json` ; les sorties de
dev `.next/dev/**` sont exclues du cache. `packages/config` porte les configurations
partagées (tsconfig de base strict, Biome, Vitest avec les seuils de couverture du §19.2).
Node 24 LTS (`.nvmrc`, `engines.node`), version de pnpm figée par `packageManager`.

## Conséquences
- Un changement transverse tient en une PR ; la CI cible les paquets touchés (`turbo --affected`).
- Chaque paquet expose les scripts `lint`, `typecheck`, `test`, `build` pour entrer dans le graphe.
- Les règles de qualité (fonctions ≤ 50 lignes, complexité cognitive ≤ 15, pas de `any`) vivent
  à un seul endroit, `packages/config/biome.json`.

## Preuves
- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
  verts sur le workspace.
- Versions retenues au registre le 2026-10-26 : pnpm 12.15.0, turbo 2.11.10, Biome 2.6.3,
  Vitest 5.0.5, TypeScript 7.0.2.
