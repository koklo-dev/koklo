---
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_commit: 476c046
---
# 0003 — Better Auth, garde de session par procédure et session de test bornée à `APP_ENV=test`

- **Statut** : accepté
- **Date** : 2026-10-27
- **Décideurs** : tech-lead

## Contexte
TK-11 remplace le `OrganizationContext` fermé de TK-10 par une vraie session. Le CDC §16.1 impose
Better Auth avec GitHub OAuth. `/health` et `/openapi.json` doivent rester publics, et les e2e
ont besoin d'une session injectable qui ne doit jamais exister en production.

## Décision
- Better Auth (`apps/api/src/auth/auth.ts`) : fournisseur GitHub, adaptateur Prisma sur le client
  partagé, plugin `organization()` ; monté sur `/api/auth/*` par `AuthController`.
- `SessionGuard` appliqué **par procédure** (`@UseGuards`), pas globalement. Le port
  `SessionResolver` rend `{ userId, organizationId }` ou `null` ; le résolveur réel exige une
  organisation active **et** une ligne `member`, sans organisation par défaut.
- L'organisation vient uniquement de la session, jamais du client.
- Le garde s'exécutant avant oRPC, `OrpcErrorFilter` rend son `ORPCError` au format typé ; la table
  de statuts (`ERROR_STATUS_MAP`) est partagée avec `ORPCModule`.
- Session de test `x-test-session: <userId>:<organizationId>` : le résolveur n'est enregistré que si
  `APP_ENV=test`, ailleurs l'en-tête est ignoré.

## Conséquences
- Toute nouvelle procédure protégée porte `@UseGuards(SessionGuard)` : l'oubli la laisse publique.
- `APP_ENV=test` en environnement déployé ouvrirait une porte dérobée : à interdire côté infra.
- Quatre variables d'environnement obligatoires de plus (`BETTER_AUTH_*`, `GITHUB_*`).

## Preuves
- `apps/api/test/auth-session.test.ts` (401 sans session, forgée, expirée, sans organisation, non
  membre ; en-tête de test ignoré hors test ; routes publiques).
- `apps/api/test/auth-oauth.test.ts` (flux OAuth avec GitHub simulé).
