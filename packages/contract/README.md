# @koklo/contract

Contrat oRPC (Zod) de l'API Koklo : procédures `health` (`GET /health`) et `project.list` (`GET /projects`), erreurs typées (`INTERNAL` 500 avec `requestId`, `UNAUTHORIZED` 401, `FORBIDDEN` 403) et génération de l'OpenAPI.

- Chemin et méthode sont explicites par route : `.meta(openapi({ method, path }))`.
- `generateOpenApi()` est pure et déterministe (clés triées). Les statuts d'erreur sont dérivés du contrat.
- Dépendances oRPC épinglées en `2.0.0-beta.46` : c'est la seule version publiée qui offre `.meta(openapi(...))` (la stable 1.16.1 utilise `.route()`). À remplacer par la 2.0 stable à sa sortie.

## Garde-fou « l'OpenAPI ne change pas sans changement de version »

- `openapi/openapi.json` est le document de référence, `openapi/versions.json` associe chaque version au sha256 de son document.
- Le test `test/contract.test.ts` échoue si le document généré diffère du fichier, si `info.version` ≠ `version` de `package.json` ou si l'empreinte de la version courante diffère.
- Pour modifier le contrat : changer la version dans `package.json` **et** `src/version.ts`, puis `pnpm --filter @koklo/contract openapi:generate`. `versions.json` ne doit qu'ajouter des lignes : `openapi:generate` échoue si la version courante est déjà enregistrée avec une autre empreinte (test CT-8b).
