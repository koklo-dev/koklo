---
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_commit: ade3f4d
---
# 0007 — e2e sur le vrai stack orchestré par un script Node, hors Turborepo

- **Statut** : accepté
- **Date** : 2026-10-27
- **Décideurs** : tech-lead, developer

## Contexte
TK-15 (vision §16.3, §19.1) demande que `pnpm e2e` démarre Postgres, migre, seede, construit et lance
Playwright, et que `pnpm dev` lance web, API, worker et Postgres en une commande. Les suites existantes
(`apps/web/e2e`, `packages/ui`) s'appuient sur une API simulée.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| Tâches Turborepo chaînées | Cache, graphe unique | Cycle de vie de processus (Compose, serveurs, nettoyage) mal adapté à Turbo |
| Script Node par commande (`e2e/scripts/run.ts`, `dev.ts`) | Démarrage, attente de santé et nettoyage explicites, même commande en local et en CI | Un script de plus à maintenir |

## Décision
- `pnpm e2e` et `pnpm dev` appellent des scripts Node (`node e2e/scripts/*.ts`) ; `dev` délègue ensuite à `turbo run dev`.
- L'e2e utilise un projet Compose jetable `koklo-e2e`, des ports dédiés (`E2E_*`), des secrets factices et une base neuve (`down -v`) avant et après.
- Le test fabrique une vraie session Better Auth en base pour l'admin du seed ; il ne passe pas par GitHub.
- `turbo run e2e` reste réservé aux suites à API simulée ; le paquet `@koklo/e2e` expose Playwright sous `stack`.
- Le job CI `e2e` exécute `pnpm e2e` ; les changements sous `e2e/` comptent comme code dans `detect-changes.sh`.

## Conséquences
Docker est requis en local comme en CI. Les variables de ports doivent figurer dans `globalPassThroughEnv` de `turbo.json`.
