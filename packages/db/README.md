# @koklo/db

Schéma Prisma 7 (PostgreSQL 17) et migrations réversibles. Tables Better Auth
(`users`, `sessions`, `accounts`, `verifications`, `organizations`, `members`,
`invitations`), table métier `projects` et les 11 tables du ticket (TK-28) : `tickets`,
`ticket_labels`, `ticket_features`, `acceptance_criteria`, `ticket_dependencies`, `sprints`,
`project_states`, `leases`, `ticket_comments`, `audit_log`, `project_counters`. Modèles PascalCase, tables et colonnes en
snake_case (`@@map`/`@map`), identifiants UUID v7 générés par Prisma, `created_at` et
`updated_at` partout.

## Usage local

```bash
KOKLO_DB_PORT=5433 docker compose up -d postgres   # depuis la racine ; 5432 par défaut
cp packages/db/.env.example packages/db/.env       # ajuster le port si besoin
pnpm db:migrate                                    # prisma migrate deploy
pnpm db:rollback                                   # annule la dernière migration
pnpm db:seed                                       # jeu de démo déterministe (idempotent), jamais en production
pnpm --filter @koklo/db generate                   # client dans packages/db/src/generated (ignoré par git)
```

`DATABASE_URL` est lu dans l'environnement ou dans `packages/db/.env`.
`SHADOW_DATABASE_URL` (base jetable distincte) n'est requis que pour `migrate dev` et
`migrate diff --to-migrations`.

## Créer une migration (avec `down.sql`)

Chaque dossier de `prisma/migrations/` doit contenir un `down.sql` non vide (vérifié par les tests).

1. Modifier `prisma/schema.prisma`.
2. Générer le `down.sql` AVANT `migrate dev` : à ce moment la base de migrations ne contient pas
   encore le changement, donc le diff schéma vers migrations est exactement l'inverse.

   ```bash
   pnpm --filter @koklo/db exec prisma migrate diff \
     --from-schema prisma/schema.prisma --to-migrations prisma/migrations \
     --script --output /chemin/hors-depot/down.sql
   ```

   Première migration (dossier vide) : `--from-schema prisma/schema.prisma --to-empty` donne le même résultat.
3. `pnpm --filter @koklo/db migrate:dev --name <nom>`.
4. Copier `down.sql` dans le dossier de migration créé, puis le relire (ordre inverse des dépendances, types/enums supprimés).
5. Objet SQL hors Prisma (index partiel, CHECK, trigger) : l'ajouter à la main en fin de `migration.sql`
   et son inverse (`DROP FUNCTION`, etc.) dans `down.sql` ; le test up -> down -> up contrôle qu'il ne reste rien.

## Tickets, sprints, baux (TK-28)

- Aucune colonne tableau (incident 6) : `labels` et `linkedFeatures` du domaine sont les tables de
  liaison `ticket_labels` / `ticket_features` (clé primaire composite). Les listes fermées du domaine
  sont des enums Postgres natifs (test de parité avec `@koklo/domain`).
- Objets SQL écrits à la main dans `migration.sql` (Prisma ne les exprime pas et `migrate diff`
  les ignore, le diff reste vide) : index uniques partiels (`leases(ticket_id) WHERE released_at IS NULL`,
  `sprints(project_id) WHERE status = 'active'`), CHECK, triggers d'immutabilité d'`audit_log`
  (UPDATE, DELETE, TRUNCATE refusés ; seule la cascade de suppression de l'organisation passe) et
  trigger de non-régression de `project_counters`. Les `down.sql` suppriment aussi fonctions et triggers.
- Clé lisible `TK-n` / `SP-n` : dans la transaction qui insère le ticket,
  `UPDATE project_counters SET last_value = last_value + 1 WHERE project_id = $1 AND name = 'ticket' RETURNING last_value`
  (verrou de ligne), puis `formatTicketKey` du domaine. Un rollback ne consomme pas de valeur.
- Bail : l'unicité porte sur « non libéré » (un index partiel ne peut pas dépendre de `now()`).
  L'acquisition exécute d'abord, dans la même transaction,
  `UPDATE leases SET released_at = now() WHERE ticket_id = $1 AND released_at IS NULL AND expires_at <= now()`,
  puis l'`INSERT` : un bail expiré libère ainsi le ticket (CDC §7.5).
- État de projet (écriture optimiste) : `UPDATE project_states SET version = version + 1, content = $2 WHERE project_id = $1 AND version = $attendue` ; 0 ligne = conflit.
- Titulaire d'un bail et assigné : `(kind, id)` sans clé étrangère (le runner n'a pas de table).

## Rollback

`pnpm db:rollback` exécute le `down.sql` de la dernière migration (`prisma db execute --file`)
puis retire sa ligne de `_prisma_migrations`, ce qui permet de la ré-appliquer avec
`pnpm db:migrate`. Le rollback n'est pas transactionnel : à réserver au développement et à la reprise
après incident, avec sauvegarde préalable ailleurs.

## Tests

`pnpm --filter @koklo/db test` démarre un Postgres 17 éphémère via Docker (port hôte aléatoire,
jamais 5432) ou utilise `TEST_DATABASE_URL`. Sans l'un ni l'autre, le test échoue (pas de skip).

## Seed de démo

`pnpm db:seed` charge l'organisation, un admin, un client, le « Projet de démo », le sprint
actif `SP-1` et six tickets `TK-1` à `TK-6` (dépendances, labels, features, critères),
compteurs à 6 et 1. Il est déterministe (ids et date fixes), idempotent (upserts par clés
naturelles, enfants des tickets seedés réinsérés, compteurs en `GREATEST`) et transactionnel.
Les tickets créés hors seed ne sont jamais touchés. **Jamais en production** : `seed()` lève
une erreur avant toute connexion quand `NODE_ENV=production`. Code : `src/seed-data.ts`,
`src/seed-statements.ts`, `src/seed-guard.ts`, `src/seed.ts`.
