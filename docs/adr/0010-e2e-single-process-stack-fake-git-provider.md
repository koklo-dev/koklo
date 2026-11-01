---
doc_version: 0.1.0
status: accepted
last_reviewed: 2026-11-01
covers_commit: a202ce1
---
# 0010 — Pile e2e à processus unique (API + worker) avec le faux fournisseur Git injecté

- **Statut** : accepté (TK-49b : les parcours R2 `e2e/tests/r2-journeys.spec.ts` passent 3 fois de suite sur la pile ; la CI doit encore les exécuter)
- **Date** : 2026-11-01
- **Décideurs** : tech-lead, developer (ticket TK-49, lot 49a). Étend l'[ADR 0007](0007-real-stack-e2e-orchestration.md).

## Contexte
L'ADR 0007 orchestre `pnpm e2e` (Postgres, migrate, seed, build, API + web, Playwright) sans worker ni
fournisseur Git. Or, depuis R2, créer le dépôt de spec (`repo.createSpec`), écrire une feature
(`specBatch.submit`, file pg-boss `spec-write`) et indexer un `push` (file `webhook-delivery`) exigent un
worker et un fournisseur Git. Le vrai GitHub est exclu de l'e2e (instable, secrets, nettoyage manuel : preuve
humaine séparée). Le faux `InMemoryGitProvider` (`@koklo/github/testing`) garde son état en mémoire, par
instance : deux processus (API, worker) auraient deux dépôts distincts.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Lanceur e2e à processus unique : API et worker dans le même processus, un seul faux injecté | Aucune ligne de production modifiée ; même mécanisme que les tests d'intégration de l'API ; le faux est partagé | Topologie différente de la production (un processus au lieu de deux conteneurs) |
| B. Crochet de production (`AppModuleOptions.gitProvider` ou variable `KOKLO_GIT_PROVIDER=fake`) | Deux processus fidèles | Une variable est une porte activable en production par erreur ; un paramètre élargit le code livré pour un besoin de test |
| C. Faux serveur HTTP GitHub (`baseUrl` d'Octokit) | Exerce l'adaptateur réel | Exige une option `baseUrl` en production, réimplémente une partie de l'API REST et le JWT de l'App (plus de 800 lignes) : relève de la conformité réelle, hors périmètre |

## Décision
Option A.
- `e2e/scripts/stack.ts` (exécuté par `node`, en type-stripping) démarre le worker (`startWorker(config, { gitProvider })`, qui crée aussi le schéma pg-boss) puis l'API (`Test.createTestingModule(AppModule.forRoot(config)).overrideProvider(GIT_PROVIDER).useValue(fake)`, `listen(PORT)`), avec **un seul** `InMemoryGitProvider`. `run.ts` le lance à la place de `apps/api/dist/main.js`.
- `nextId` du faux est un compteur numérique : `repository.id` des webhooks de test doit être un entier sûr.
- L'installation graine (`provider_installations`, `external_id` entier) est acceptée sans déclaration préalable (`authenticate` du faux ne vérifie rien). Un petit pool de logins `e2e-link-1..3` (installations 9100001..9100003, organisations `e2e-link-org-N`, rôle admin) est pré-injecté pour le futur parcours « installer l'App » (OAuth factice, usage unique par code).
- Le faux n'émet aucun webhook : les tests postent des `push` signés (HMAC avec `GITHUB_WEBHOOK_SECRET`) par le web, chemin de production.
- Variables factices ajoutées par `run.ts` : `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (jamais parsée, fournisseur surchargé), `GITHUB_APP_CLIENT_ID/SECRET`, `KOKLO_ENCRYPTION_KEY` (32 caractères alphanumériques), `SPEC_BATCH_WAIT_MS=15000`.
- Dépendances de test ajoutées à `@koklo/e2e` (devDependencies, versions du monorepo) : `@nestjs/testing` 12.2.0, `@koklo/github`, `@koklo/worker`. Aucun nouveau framework.

### Invariant : le faux n'est jamais sélectionnable par la configuration
Aucune variable d'environnement, aucun `if (APP_ENV === "test")`, aucune branche de production ne choisit le faux ; `git-provider.module.ts` ne l'importe pas. Gardes :
1. `stack.ts` lit `APP_ENV` en premier et refuse de démarrer en `staging` ou `production` (message sur stderr, avant tout import de `dist`, connexion ou port) ;
2. test statique `packages/config/test/e2e-stack-guard.test.ts` : aucun fichier de `apps/*/src` ou `packages/*/src` (hors `packages/github/src/testing` et tests) n'importe `@koklo/github/testing`, et le lanceur refuse `staging`/`production` ;
3. `e2e/` est exclu du contexte Docker (`.dockerignore`) : les trois images ne contiennent ni le lanceur ni `@nestjs/testing`.

## Conséquences
- Écarts avec la production : API et worker partagent un processus (la communication reste pg-boss sur Postgres, sans appel direct) ; le journal Nest par défaut remplace le logger pino de `main.ts` ; le faux diverge peut-être de GitHub (conformité réelle : preuve humaine, hors e2e).
- Le lanceur dépend des `dist` (`pnpm build` est déjà dans `run.ts`) ; il les charge par chemin, avec des interfaces locales minimales, pour que `tsc` d'`e2e` n'exige pas le build.
- Les tests partagent le faux et pg-boss (workers: 1) : noms uniques, installations à `external_id` uniques.
- Accepté au lot 49b (parcours R2 complets verts en local, 3 passages consécutifs) ; les lots 49b et 49c ont été fusionnés.
