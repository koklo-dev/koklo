---
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-27
covers_commit: e084ff1
---
# 0002 — Le port du module `project` vit dans `apps/api`

- **Statut** : accepté
- **Date** : 2026-10-27
- **Décideurs** : tech-lead

## Contexte
TK-10 livre `apps/api` (NestJS + `@orpc/nest`) avec le module `project` : contrôleur mince,
service, port. Le CDC §17.1 définit un module comme « un dossier avec contrôleurs, services,
ports ». `packages/domain` n'existe pas encore, et le tag `db` de `turbo.json` n'autorise que
`domain` et `config` : `@koklo/db` ne peut donc pas importer `@koklo/contract`.

## Options envisagées
| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| Port dans `apps/api/src/project/` | Conforme au §17.1, aucun paquet prématuré | Le port migrera vers `domain` plus tard |
| Créer `packages/domain` pour une interface | Cible finale | Paquet sans logique métier, hors périmètre du ticket |
| Port dans `packages/db` | Proche de Prisma | Couple le port à l'adaptateur, inverse la dépendance |

## Décision
Le port `ProjectRepository`, le service, le contrôleur, l'adaptateur Prisma et le jeton
`OrganizationContext` vivent dans `apps/api/src/project/`. Aucune méthode du port ne liste
sans organisation (isolation tenant, §18.4). `OrganizationContext` est fermé par défaut
(401) jusqu'à la session Better Auth (TK-11). L'injection passe par des jetons `@Inject`
explicites : pas de dépendance à `emitDecoratorMetadata`.

## Conséquences
- Quand `packages/domain` sera créé, le port y migrera sans changer le service.
- `@koklo/db` exporte `createDbClient`, `seed`/`SEED_IDS` et, en sous-chemin déclaré
  `@koklo/db/testing`, les helpers de test (base éphémère, `migrateDeploy`).
- L'extension Prisma de filtrage d'organisation (§18.4) reste à planifier.

## Preuves
- `apps/api/test/project-list.test.ts` (isolation, tri, 401 par défaut, erreur 500 typée).
- `pnpm lint` (`turbo boundaries`, `check-deep-imports`) vert.
