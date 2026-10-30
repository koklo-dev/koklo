---
tags: [sprint/002, release/R0, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 002 — Données, contrat et API

Release : **R0**

## 🎯 Sprint Goal
Base Prisma réversible, contrat oRPC et API NestJS avec santé, connexion GitHub et liste des projets.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [x] H-5 — Valider la décision 28 (Better Auth) avant TK-7 : le schéma de TK-7 contient ses tables
- [ ] H-6 — Créer l'OAuth App GitHub de développement local (callback `localhost`) et renseigner `.env` local

<!-- shipyard-progress:start -->
> [!info] Avancement — 5/5 livrée(s)
> `████████████████`  ·  🟡 0 en cours  ·  🔴 0 bloquée(s)  ·  ⚪ 0 à faire
> _Mis à jour par la boucle de livraison le 2026-10-27._
<!-- shipyard-progress:end -->

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [x] **[TK-7]** packages/db : schéma minimal, première migration réversible
  - Statut : ✅ **livrée** · TK-7 · PR #18 · 2026-10-27 <!-- shipyard-status:TK-7 -->
  - Labels : pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-4
  - Source : CDC §18.1, §18.2, §22 point 3 ([[vision]])
  - À faire :
    - Prisma 7 avec `prisma.config.ts` ; Docker Compose Postgres 17 pour le local
    - Schéma : tables Better Auth (utilisateurs, sessions, comptes, vérifications, organisations, membres, invitations) + `project` ; `snake_case` via `@@map`, UUID v7, `created_at`/`updated_at`
    - `down.sql` par migration : `prisma migrate diff --from-schema <schéma modifié> --to-migrations prisma/migrations --script`, généré avant `migrate dev`
    - Scripts racine `db:migrate`, `db:rollback` (`prisma db execute`)
  - Critères d'acceptation :
    - [x] Test CI sur base éphémère : `up` → `down` → `up` réussit et le diff final est vide
    - [x] La migration contient son `down.sql`
- [x] **[TK-8]** Seed déterministe (périmètre R0)
  - Statut : ✅ **livrée** · TK-8 · PR #19 · 2026-10-27 <!-- shipyard-status:TK-8 -->
  - Labels : pkg:db, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-7
  - Source : CDC §18.3 ([[vision]])
  - À faire :
    - `pnpm db:seed` à identifiants fixes : une organisation de démo, deux membres (admin, client), un projet
    - Le reste du seed du §18.3 (spec fictive, sprint, 6 tickets) arrive avec les tables de R1 (TK-33)
  - Critères d'acceptation :
    - [x] Deux exécutions successives produisent la même base (test)
- [x] **[TK-9]** packages/contract : contrat oRPC v2 (health, project.list) et OpenAPI
  - Statut : ✅ **livrée** · TK-9 · PR #14 · 2026-10-27 <!-- shipyard-status:TK-9 -->
  - Labels : pkg:contract, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-4
  - Source : CDC §16.1, §17.1, §19.1 (contrat), §22 point 4 ([[vision]])
  - À faire :
    - Contrat Zod avec `@orpc/contract` ; chemin explicite par route via `.meta(openapi({ path }))` (syntaxe oRPC v2)
    - Erreurs typées déclarées dans le contrat
    - Génération de l'OpenAPI depuis le contrat
  - Critères d'acceptation :
    - [x] Test de contrat : l'OpenAPI généré ne change pas sans changement de version
- [x] **[TK-10]** apps/api : NestJS + oRPC, /health, project.list
  - Statut : ✅ **livrée** · TK-10 · PR #21 · 2026-10-27 <!-- shipyard-status:TK-10 -->
  - Labels : safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-7, TK-9
  - Source : CDC §3, §16.1, §17.1, §22 point 4 ([[vision]])
  - À faire :
    - NestJS (plateforme Express) + `@orpc/nest` (`@Implement`) ; module `project` (contrôleur mince, service, port)
    - Route `/health` (healthcheck du manifest, §20.4) ; OpenAPI servi
    - `.env.example` de l'app
  - Critères d'acceptation :
    - [x] Test d'intégration Vitest + Postgres : `project.list` renvoie les projets du seed
    - [x] `/health` répond 200 quand la base répond, une erreur sinon
- [x] **[TK-11]** Connexion GitHub (Better Auth) et garde de session
  - Statut : ✅ **livrée** · TK-11 · PR #22 · 2026-10-27 <!-- shipyard-status:TK-11 -->
  - Labels : pkg:api, sensitive
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-10
  - Source : CDC §16.1 (Auth), §14, §22 point 5 ([[vision]])
  - À faire :
    - Better Auth : fournisseur GitHub OAuth, adaptateur Prisma ; `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
    - Guard NestJS : `project.list` exige une session
    - Session de test injectable pour les e2e (désactivée hors `APP_ENV=test`)
  - Critères d'acceptation :
    - [x] Sans session, `project.list` renvoie l'erreur typée non authentifié
    - [x] La session de test est refusée hors environnement de test (test)

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] Tous les TK mergés
- [ ] `pnpm test` couvre la migration réversible et le contrat

## 🚧 Risks
- Aucun identifié à la rédaction.
