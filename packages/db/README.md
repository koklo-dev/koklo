# @koklo/db

Schéma Prisma 7 (PostgreSQL 17) et migrations réversibles. Tables Better Auth
(`users`, `sessions`, `accounts`, `verifications`, `organizations`, `members`,
`invitations`) et table métier `projects`. Modèles PascalCase, tables et colonnes en
snake_case (`@@map`/`@map`), identifiants UUID v7 générés par Prisma, `created_at` et
`updated_at` partout.

## Usage local

```bash
KOKLO_DB_PORT=5433 docker compose up -d postgres   # depuis la racine ; 5432 par défaut
cp packages/db/.env.example packages/db/.env       # ajuster le port si besoin
pnpm db:migrate                                    # prisma migrate deploy
pnpm db:rollback                                   # annule la dernière migration
pnpm --filter @koklo/db generate                   # client dans packages/db/generated (ignoré par git)
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

## Rollback

`pnpm db:rollback` exécute le `down.sql` de la dernière migration (`prisma db execute --file`)
puis retire sa ligne de `_prisma_migrations`, ce qui permet de la ré-appliquer avec
`pnpm db:migrate`. Le rollback n'est pas transactionnel : à réserver au développement et à la reprise
après incident, avec sauvegarde préalable ailleurs.

## Tests

`pnpm --filter @koklo/db test` démarre un Postgres 17 éphémère via Docker (port hôte aléatoire,
jamais 5432) ou utilise `TEST_DATABASE_URL`. Sans l'un ni l'autre, le test échoue (pas de skip).
