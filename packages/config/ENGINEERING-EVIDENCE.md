# Preuves des règles d'ingénierie — TK-1 (`packages/config`)

Commande : `engineering-rules.sh validate --root . --agent developer --path packages/config --evidence packages/config/ENGINEERING-EVIDENCE.md`

| Règle                        | Preuve                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global.scope`               | Diff limité à `packages/config` et aux fichiers racine autorisés (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `tsconfig.json`, `.nvmrc`, `docs/adr`). |
| `global.verification`        | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (4 tests, couverture 100 %), `pnpm build` verts ; job CI `ci` vert sur db49549 (run 40417358677).                 |
| `global.dependency-currency` | Versions résolues au registre le 2026-10-26 (`npm view <pkg> version`) : table `package \| version retenue \| dernière stable \| source` dans le corps de la PR #6.                            |
| `docs.continuous`            | ADR `docs/adr/0000-template.md` et `docs/adr/0001-monorepo-pnpm-turborepo.md` ; rapport `docs/changelog/reports/2026-10-26-TK-1.md`.                                                           |
| `privacy.minimization`       | Sans objet : le paquet ne contient que de la configuration d'outillage, aucune donnée personnelle.                                                                                             |
| `privacy.rights`             | Sans objet : aucune donnée personnelle collectée ni stockée.                                                                                                                                   |
| `privacy.sensitive-logging`  | Sans objet : aucun code applicatif, aucun log.                                                                                                                                                 |
| `security.authorization`     | Sans objet : aucun endpoint ni code d'accès, uniquement de la configuration.                                                                                                                   |
