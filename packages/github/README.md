# @koklo/github

Adaptateur GitHub du port `GitProvider` (vision §8, défini dans `@koklo/domain`) et faux en
mémoire partagé par les tests des autres paquets. Privé au monorepo, aucune dépendance vers
`apps/*`.

## Rôle

- **Adaptateur** `createOctokitGitProvider(options)` : les 13 opérations du port sur l'API REST
  de GitHub (GitHub App). Octokit est utilisé comme bibliothèque (`@octokit/core` + plugins
  `rest-endpoint-methods`, `paginate-rest`, `throttling`, `retry`, et `auth-app` pour le jeton
  d'installation), jamais le métapaquet `octokit`.
- **Faux** `InMemoryGitProvider` (import `@koklo/github/testing`) : même contrat, sans réseau.
- **Suite de conformité** unique, exécutée contre les deux.

L'adaptateur ne lit jamais `process.env` ni un fichier : tout (App ID, clé PEM, secret client,
horloge `now`, `fetch`) est injecté par l'appelant.

## Layout

```text
src/
  index.ts                  exports publics : createOctokitGitProvider, OctokitGitProvider, options
  octokit-git-provider.ts   la classe, une méthode par opération du port
  client.ts                 client Octokit composé, politique de retry/quota, cache de clients
  gateway.ts                point de passage unique : client, journal, traduction d'erreurs
  errors-map.ts             HTTP -> erreurs typées du port (fonction pure)
  mappers.ts, pagination.ts réponses d'API -> types du port, pagination bornée
  options.ts                OctokitGitProviderOptions
  ops/                      une famille d'opérations par fichier (repository, git-data,
                            pull-request, deployment, authentication) + shared.ts
  testing/                  InMemoryGitProvider (export ./testing) : fake-authority,
                            repository-state, pull-views
test/
  conformance/suite.ts      la suite commune (corps unique)
  conformance/fake.test.ts  point d'entrée CI : la suite contre le faux
  real/github.real.ts       point d'entrée MANUEL : la suite contre GitHub réel
  support/mock-github.ts    transport HTTP simulé pour les tests de l'adaptateur
scripts/                    real-env.ts (variables), run-real.ts (garde de test:real)
```

## Utiliser le faux dans un autre paquet

```ts
import { InMemoryGitProvider } from "@koklo/github/testing";

let ids = 0;
const git = new InMemoryGitProvider({
  now: () => new Date("2026-10-30T12:00:00Z"), // horloge injectée : expirations de jetons
  nextId: () => String(++ids), // identifiants déterministes (jetons, SHA, commentaires)
});
const auth = await git.authenticate({
  installation: { id: "1001", owner: { kind: "organization", login: "acme" } },
});
const { ref } = await git.createRepo({
  auth,
  owner: { kind: "organization", login: "acme" },
  name: "demo",
  visibility: "private",
});
git.seedDeployment(ref, { environment: "staging", sha: "..." }); // aide de test
```

Le faux est à état (graphe de commits avec contenu complet, branches, tags, PR, checks,
fusion à trois voies par fichier), déterministe, isolé par instance et refuse les jetons
expirés (401). Ajouter `@koklo/github` en `devDependencies` (`workspace:*`) du paquet
consommateur ; l'export `./testing` est le seul point d'entrée autorisé (pas d'import profond).
Ne pas le confondre avec le faux minimal de `packages/domain/test`, qui prouve seulement que
le port compile.

## Suite de conformité commune (incident 33)

`test/conformance/suite.ts` est un corps de tests unique, paramétré par une fabrique
(fournisseur, propriétaires, identifiants d'installation, capacités). Deux points d'entrée :
le faux en CI (`fake.test.ts`) et GitHub réel à la main (`github.real.ts`). Toute divergence
constatée en réel devient un cas de la suite et c'est le faux qui se corrige, jamais l'inverse
sans preuve. Les capacités (`deployments`, `mergeableComputed`, `templates`) font sauter, avec
leur raison, les cas que le réel ne peut pas produire sans montage (workflow de déploiement,
dépôt modèle).

## Mappage d'erreurs

Toutes les erreurs sortantes sont des sous-classes de `GitProviderError`. Une `RequestError`
Octokit n'est jamais relayée ni gardée en `cause` (elle embarque la requête).

| HTTP                                                                         | Erreur du port                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 401                                                                          | `GitAuthExpiredError` (`refreshable` selon le jeton)                             |
| 429, ou 403 avec `retry-after`, `x-ratelimit-remaining: 0` ou « rate limit » | `GitRateLimitedError` (`retryAfterMs`)                                           |
| 403 sur `createRepo`                                                         | `RepoCreationForbiddenError` (`resource-not-accessible` ou `missing-user-token`) |
| 403 ailleurs                                                                 | `GitProviderError`                                                               |
| 404                                                                          | `GitNotFoundError`                                                               |
| 405                                                                          | `GitConflictError` `not-mergeable`                                               |
| 409                                                                          | `GitConflictError` (`stale-sha` par défaut, ou la raison de l'opération)         |
| 422 « already exists » / « not a fast forward »                              | `GitConflictError` `exists` / `stale-sha`                                        |
| autre 422, autre 4xx, erreur inconnue                                        | `GitProviderError`                                                               |
| 5xx, réseau                                                                  | `GitProviderUnavailableError`                                                    |

Un compte personnel sans jeton utilisateur est refusé localement (`UserTokenRequiredError`),
sans appel réseau (ADR 0009). Retries : seules les lectures (GET) sont rejouées, sur 5xx ou
erreur réseau ; jamais une écriture. Sur quota, une lecture est rejouée une fois si l'attente
est courte (`maxAutoRetryMs`), sinon `GitRateLimitedError` remonte au worker.

## Sécurité

- **Jamais de jeton dans les logs ni dans les erreurs.** Le journal injectable ne reçoit que
  l'opération, le statut et la durée (jamais d'URL, d'en-tête, de corps). Les erreurs ne
  portent que `operation` et des identifiants non secrets. Le logger d'Octokit est neutralisé.
  Les clients sont mis en cache par empreinte SHA-256 du jeton, jamais par le jeton.
- Aucune clé, aucun jeton ni secret dans le dépôt ni dans les fixtures
  (`test/secrets-scan.test.ts`) ; `.env.real` est ignoré par git, `.env.real.example` (valeurs
  vides) ne l'est pas.
- Les fichiers `*.real.ts` ne sont jamais collectés par la CI.

## Décision : pas d'ADR pour Octokit

Octokit est une **bibliothèque** cliente HTTP, pas un framework : elle ne structure pas
l'application, se remplace derrière le port `GitProvider` sans toucher au domaine, et reste
confinée à ce paquet. La règle « pas de nouveau framework sans ADR » ne s'applique donc pas.
Seule la décision structurante (création de dépôt sur compte personnel) a son ADR :
`docs/adr/0009-github-app-creation-repo-compte-personnel.md`.

## Commandes

| Commande                                                   | Effet                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm --filter @koklo/github test`                         | tests + couverture (seuils 80 % lignes, 70 % branches), environ 2 s |
| `pnpm --filter @koklo/github typecheck` / `lint` / `build` | gates habituels                                                     |
| `pnpm --filter @koklo/github test:real`                    | suite de conformité contre GitHub réel (manuel)                     |

L'espacement d'une seconde entre écritures du plugin de throttling est coupé dans les tests
par l'option `spaceWrites: false` de l'adaptateur (`test/support/mock-github.ts`). Par défaut
(production) il reste actif.

## Tests réels (procédure manuelle)

Jamais en CI. À lancer par une personne disposant d'une App de test.

1. **Montage** : une GitHub App de test (jamais celle de production), une organisation de
   test et un compte personnel de test, l'App installée sur les deux, « user authorization »
   activée avec jetons expirants.
2. **Permissions de l'App de test** (repository) : _Repository creation_ (écriture),
   _Contents_ (écriture), _Pull requests_ (écriture), _Checks_ (écriture), _Deployments_
   (lecture), _Metadata_ (lecture), et **Administration (écriture) si l'on veut que le test
   supprime les dépôts bac à sable** (la suppression d'un dépôt l'exige). Aucune permission
   « account ».
3. **Variables** : `cp packages/github/.env.real.example packages/github/.env.real`, renseigner
   les 10 variables `KOKLO_GH_*` (la clé peut venir de `KOKLO_GH_PRIVATE_KEY_PATH`), puis
   `set -a; . packages/github/.env.real; set +a`. Le jeton utilisateur dure 8 h.
4. **Lancement** : `pnpm --filter @koklo/github test:real`. Sans toutes les variables, le
   script s'arrête en code 1 en les listant (jamais « sauté = vert »).
5. **Bac à sable** : chaque dépôt créé s'appelle `koklo-sandbox-<horodatage>-<cas>-<n>` (préfixe
   modifiable par `KOKLO_GH_SANDBOX_PREFIX`) et vit dans l'organisation de test.
6. **Nettoyage** : en fin d'exécution le test tente de supprimer ces dépôts avec le jeton
   d'installation de l'organisation (`DELETE /repos/...`, échecs ignorés). Cela réussit
   seulement si l'App a la permission Administration (écriture) ; sinon les dépôts restent et
   se suppriment à la main par leur préfixe `koklo-sandbox-`.
7. **Preuve** : consigner dans l'ADR 0009 le statut HTTP, le corps d'erreur et l'en-tête
   `x-accepted-github-permissions` des appels `createRepo` (organisation, puis compte
   personnel avec et sans jeton utilisateur), pour la faire passer de « proposé » à « accepté ».
