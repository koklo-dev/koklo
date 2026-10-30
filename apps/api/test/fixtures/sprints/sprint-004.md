---
tags: [sprint/004, release/R0, vault/timeline]
parent: "[[_README]]"
backlog: "[[sprints/backlog]]"
---
# Sprint 004 — Déploiement staging et observabilité

Release : **R0**

## 🎯 Sprint Goal
Chaque merge sur `develop` déploie le staging selon le standard infra.

## 📅 Period
<!-- Volontairement sans dates : la boucle prend alors le premier sprint qui a encore du travail,
     dans l'ordre des fichiers. Une date ne s'ajoute (Start:/End:) qu'à l'activation du sprint. -->

## 🧑 Prérequis et actions humaines (ignorés par la boucle)
- [x] H-7 — Valider la décision 30 (GlitchTip + pino) avant TK-19
- [x] H-8 — Valider la décision 31 (domaines) avant TK-18
- [x] H-9 — Infra : ajouter `koklo.dev` sous `mail:` de `zones/zones.yaml` (aujourd'hui seul `ouiti.com` y figure), `make zones-apply` deux fois (§20.5 étape 2)
- [x] H-10 — Infra : `scripts/onboard-app.sh koklo-dev/koklo <checkout>` (§20.5 étape 3) ; vérifier `gh secret list -R koklo-dev/koklo`
- [ ] H-11 — Infra : protéger l'environnement `koklo-production` avec un reviewer (§20.5 étape 4)
- [ ] H-12 — DNS : `app`, `api`, `app-staging`, `api-staging.koklo.dev` existent déjà (proxy Cloudflare, réponse 404 le 2026-10-26). Identifier leur propriétaire et les adopter via `apps/adopt/koklo.yaml` (dossier à créer, guide `deploy-an-app.md`) ; `make app-plan … ENV=staging` sans erreur (§20.5 étape 5)
- [ ] H-13 — Ne laisser merger TK-18 qu'après H-9 à H-12 (§20.5 étape 6)

## ✅ Tasks
<!-- L'ordre des tâches est l'ordre de prise par la boucle : il respecte les dépendances. -->
- [x] **[TK-16]** Dockerfiles multi-étapes et route /api/health
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-15
  - Source : CDC §16.1 (Conteneurs), §20.4, §20.5 étape 1 ([[vision]])
  - À faire :
    - `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/worker/Dockerfile` avec `turbo prune`
    - Le conteneur `api` exécute `prisma migrate deploy` avant de démarrer ; le worker ne migre jamais
    - Route `/api/health` côté web
  - Critères d'acceptation :
    - [x] Les trois images se construisent en CI
    - [x] Le conteneur api démarré contre un Postgres vide migre puis répond sur `/health`
- [x] **[TK-17]** Manifest .deploy et pnpm deploy:check
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-16
  - Source : CDC §16.3 (`deploy:check`), §20.4 ([[vision]])
  - À faire :
    - `.deploy/manifest.yaml` conforme au bloc du §20.4 (images `ghcr.io/koklo-dev/koklo-*`)
    - `pnpm deploy:check` : `scripts/validate-manifest.py` d'infra (checkout de `josias-koffi/infra` en CI)
    - Job CI sur toute PR qui touche `.deploy/`
  - Critères d'acceptation :
    - [x] `pnpm deploy:check` vert
    - [x] Un manifest invalide fait échouer le job
- [x] **[TK-18]** Workflow Deploy depuis le template infra, avec image-check
  - Labels : pkg:infra, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-17
  - Source : CDC §20.4 (workflow), §20.5 étapes 1 et 6 ([[vision]])
  - À faire :
    - Avant tout code : si `gh secret list -R koklo-dev/koklo` ne montre pas `INFRA_DEPLOY_TOKEN`, émettre `NEEDS-HUMAN:` (prérequis H-9 à H-12 non faits) et s'arrêter
    - `.github/workflows/deploy.yml` copié de `infra/templates/app-deploy.yml` ; `CHANGE-ME` remplacé, une étape `build-push` par image
    - Job `image-check` entre `build` et `deploy` (modèle `jemima-portfolio`)
    - Production : `workflow_dispatch` avec `image_tag`, sans reconstruction
    - L'API n'est pas exposée : retirer `domain: api` et les domaines `api` des environnements du manifest ; le web joint l'API par `API_INTERNAL_URL` (injecté par `uses: [api]`), `runtime-config.ts` et le proxy sont adaptés
    - `BETTER_AUTH_URL` = origine web de l'environnement (`https://app-staging.koklo.dev`, `https://app.koklo.dev`), définie par environnement dans le manifest (vérifier que le schéma d'infra le permet) ; callback GitHub : `<origine web>/api/auth/callback/github`
    - Corriger `apps/api/.env.example` et la doc (`quality-and-operations.md`, `onboarding.md`, `architecture.md`) : `BETTER_AUTH_URL` est l'URL publique du web, pas de l'API
  - Critères d'acceptation :
    - [x] Après merge : workflow `Deploy` vert, smoke test vert, `https://app-staging.koklo.dev` répond
    - [x] `api-staging.koklo.dev` ne répond pas (API non exposée) et la connexion GitHub aboutit sur `https://app-staging.koklo.dev/api/auth/callback/github`
- [x] **[TK-19]** Observabilité : SDK GlitchTip et logs pino
  - Labels : pkg:api, safe
  - Agent: orchestrateur du workflow (une session neuve par étape)
  - Workflow: [[workflows/definitions/koklo-delivery|koklo-delivery]]
  - Dépend de : TK-16
  - Source : CDC §16.5, §17.3, §22 point 10 ([[vision]])
  - À faire :
    - pino JSON avec identifiants de corrélation (requête) dans api et worker
    - SDK compatible Sentry branché sur `SENTRY_DSN` (optionnel)
  - Critères d'acceptation :
    - [x] Sans `SENTRY_DSN`, l'app démarre ; une erreur levée en test est capturée par le SDK simulé

## 🔁 Workflow Runs
<!-- Auto-appended by `sprint` / `run-workflow` skills — most recent first -->

## 📊 Sprint DoD
- [ ] DoD globale (CDC §19.4) respectée par chaque ticket
- [ ] CI verte sur `develop`
- [ ] Workflow `Deploy` vert sur le dernier commit de `develop` (smoke test compris)
- [ ] `https://app-staging.koklo.dev` accessible
- [ ] Base de staging présente dans la sauvegarde quotidienne R2 (DoD §22)

## 🚧 Risks
- Si H-12 n'est pas résolu, `check-dns.py` refuse le déploiement : TK-18 restera en revue.
