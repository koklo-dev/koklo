---
tags: [sprint/001, release/R0, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 001 — Amorçage du monorepo et des gates

Release : **R0**

## 🎯 Sprint Goal
Un workspace vide qui passe tous les gates du §17 en CI, avec commitlint, Trivy, Release Please et Dependabot.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [x] H-1 — Avec un compte ADMIN de l'organisation `koklo-dev` : renommer `koklo-dev/koklo` en `koklo-legacy` et l'archiver ; renommer `koklo-dev/koklo-cli` en `koklo-cli-legacy` et l'archiver (décision 32, annexe E §E.4 étape 1). Le compte `josias-koffi` n'a que le droit MAINTAIN sur `koklo` — ✅ fait le 2026-10-26 (branches locales non poussées sauvegardées avant archivage)
- [x] H-2 — Créer `koklo-dev/koklo` en privé, pousser `main` et `develop`, branche par défaut `develop` — ✅ fait le 2026-10-26 : `koklo-dev/koklo` **public** (plan Free : protections impossibles en privé)
- [x] H-3 — Protéger `develop` : check requis `ci` ; protéger `main` : PR humaine uniquement (§20.2) — ✅ fait le 2026-10-26 : `develop` check `ci` strict + admins ; `main` PR + check `ci`
- [ ] H-4 — Lancer la boucle : `/deliver` dans `koklo-new/koklo` (mode `vault` déjà réglé dans `.project/state.json`)

<!-- shipyard-progress:start -->
> [!info] Avancement — 6/6 livrée(s)
> `████████████████`  ·  🟡 0 en cours  ·  🔴 0 bloquée(s)  ·  ⚪ 0 à faire
> _Mis à jour par la boucle de livraison le 2026-10-27._
<!-- shipyard-progress:end -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [x] **[TK-1]** Workspace pnpm + Turborepo et packages/config
  - Statut : ✅ **livrée** · TK-1 · PR #6 · 2026-10-27 <!-- shipyard-status:TK-1 -->
  - Labels : pkg:config, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : aucune
  - Source : CDC §16.1, §16.2, §16.3, §17.2, §22 point 1 ([[vision]])
  - À faire :
    - `package.json` racine : `packageManager` pnpm (version résolue sur le registre), `engines.node` 24, scripts `lint`, `typecheck`, `test`, `build`, `dev` du §16.3
    - `.nvmrc` = 24 ; `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `e2e`)
    - `turbo.json` : tâches `lint`, `typecheck`, `test`, `build`, `dev` ; sorties de dev `.next/dev/**` exclues du cache (`!.next/dev/**`)
    - `packages/config` : `tsconfig` de base (`strict`, `noUncheckedIndexedAccess`), `biome.json` partagé, config Vitest partagée avec les seuils du §19.2
    - Biome : `complexity/noExcessiveLinesPerFunction` `maxLines: 50`, `complexity/noExcessiveCognitiveComplexity` `maxAllowedComplexity: 15`, `suspicious/noExplicitAny` en erreur
    - `docs/adr/0000-template.md` et `docs/adr/0001-monorepo-pnpm-turborepo.md` (§17.1)
  - Critères d'acceptation :
    - [x] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` passent sur le workspace
    - [x] Une fonction de test de 51 lignes fait échouer `biome ci` (fixture dans `packages/config`, test Vitest)
    - [x] Le job CI `ci` (CI minimale posée à l'init) est vert sur la PR
- [x] **[TK-2]** Script check:size et dérogations
  - Statut : ✅ **livrée** · TK-2 · PR #11 · 2026-10-27 <!-- shipyard-status:TK-2 -->
  - Labels : pkg:config, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-1
  - Source : CDC §17.2 ([[vision]])
  - À faire :
    - Script `check:size` : 300 lignes max par fichier source, 500 par fichier de test ; exclut migrations et fichiers générés
    - Dérogations lues dans `.koklo/waivers.yaml` (fichier, règle, justification, auteur, expiration)
    - Branché dans `pnpm lint` (`biome ci .` + `pnpm check:size`)
  - Critères d'acceptation :
    - [x] Un fichier source de 301 lignes fait échouer `pnpm lint`
    - [x] Une dérogation non expirée le laisse passer ; une dérogation expirée échoue avec le nom du fichier
    - [x] Les migrations et fichiers générés ne sont pas comptés (test)
- [x] **[TK-3]** Frontières entre paquets (turbo boundaries)
  - Statut : ✅ **livrée** · TK-3 · PR #12 · 2026-10-27 <!-- shipyard-status:TK-3 -->
  - Labels : pkg:config, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-1
  - Source : CDC §16.4 ([[vision]])
  - À faire :
    - Une étiquette par paquet du §16.2 ; règles `boundaries.tags` (allow/deny) dans `turbo.json` qui encodent la table du §16.4
    - Interdiction des imports profonds (`pkg/src/...`) : seuls les `exports` déclarés
    - `turbo boundaries` branché dans `pnpm lint`
    - Documenter dans le README de `packages/config` : chaque futur paquet déclare son étiquette dans son `turbo.json`
  - Critères d'acceptation :
    - [x] Un workspace de fixture où `domain` dépend de `db` fait échouer `turbo boundaries` (test)
    - [x] Un import profond dans une fixture est refusé
- [x] **[TK-4]** CI complète : install, lint, typecheck, test avec couverture, build
  - Statut : ✅ **livrée** · TK-4 · doublon de #1 · 2026-10-26 <!-- shipyard-status:TK-4 -->
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-2, TK-3
  - Source : CDC §16.3, §19.2, §22 point 8 ([[vision]])
  - À faire :
    - Remplacer `.github/workflows/ci.yml` (CI minimale de l'init) en partant du gabarit Shipyard `templates/ci/ci.yml.tpl` adapté au §16.3
    - Garder le job `ci` (nom stable, check requis) ; ajouter le job `skills in sync` du gabarit
    - `turbo run … --affected` sur les PR ; versions des actions résolues à la date du ticket
  - Critères d'acceptation :
    - [x] Le job `ci` exécute install, lint, typecheck, test (couverture), build
    - [x] La couverture sous les seuils du §19.2 fait échouer la CI (fixture)
    - [x] Une PR qui ne touche aucun paquet ne lance que les jobs nécessaires
- [x] **[TK-5]** Trivy et commitlint en CI
  - Statut : ✅ **livrée** · TK-5 · PR #2 · 2026-10-26 <!-- shipyard-status:TK-5 -->
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-4
  - Source : CDC §10.2, §17.3, §22 point 8 ([[vision]])
  - À faire :
    - Gabarits Shipyard `templates/ci/security.yml.tpl` et `commitlint.yml.tpl`
    - Trivy : scan du système de fichiers (dépendances, secrets) ; commitlint : commits et titre de PR en Conventional Commits
  - Critères d'acceptation :
    - [x] Un titre de PR non conventionnel fait échouer le check commitlint
    - [x] Une vulnérabilité critique connue (fixture de lockfile) fait échouer Trivy
- [x] **[TK-6]** Release Please et Dependabot
  - Statut : ✅ **livrée** · TK-6 · PR #3 · 2026-10-26 <!-- shipyard-status:TK-6 -->
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-4
  - Source : CDC §16.2 (versionnement), §16.1 (versions) ([[vision]])
  - À faire :
    - Release Please en manifeste (`release-please-config.json`, `.release-please-manifest.json`) ; une version commune pour `apps/*`, versions propres pour `cli`, `schema`, `contract` (ajoutées quand ces paquets existent)
    - `dependabot.yml` : npm, github-actions, docker
  - Critères d'acceptation :
    - [ ] Le workflow Release Please s'exécute sur `main` et ouvre une PR de release
      - _Non vérifiable avant la promotion de `develop` vers `main` : le workflow est déclenché sur `push` vers `main`, qui ne le contient pas encore (audit du 2026-10-27)._
    - [x] `dependabot.yml` est valide (check GitHub vert)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK du sprint sont mergés sur `develop`
- [ ] CI verte sur le dernier commit de `develop`

## 🚧 Risks
- La CI minimale ne fait que valider la couche agent tant que TK-1 n'est pas mergé : TK-1 est la seule PR jugée par cette CI réduite.
