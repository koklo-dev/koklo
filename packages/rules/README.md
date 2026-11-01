# @koklo/rules

Catalogue des règles d'ingénierie Koklo : schémas zod, analyse (`parseCatalog`) et catalogue
livré (`loadBuiltInCatalog`). Paquet privé, tag `rules`, **pur** : seule dépendance `zod`, ni
horloge, ni aléa, ni E/S dans `src`. Lot A de TK-71 ; composition, verrous, dérogations et
résolution arrivent aux lots B et C.

## Usage

```ts
import { loadBuiltInCatalog, parseCatalog } from "@koklo/rules";

const result = parseCatalog(jsonText); // ne lève jamais
if (result.ok) console.log(result.value.rules.length);
else console.error(result.error.code, result.error.path, result.error.message);

const builtIn = loadBuiltInCatalog(); // 34 règles, 13 profils, 4 règles protégées
```

L'entrée est en snake_case (`schema_version`, `catalog_version`, `protected_rule_ids`), la sortie
en camelCase. Taille maximale : `MAX_CATALOG_BYTES` (1 Mio d'octets UTF-8).

## Codes d'erreur

`catalog.too-large`, `catalog.invalid-json`, `catalog.invalid-shape`, `catalog.unknown-version`,
`catalog.duplicate-id`, `catalog.missing-enforcement`, `catalog.unknown-enforcement`,
`catalog.unknown-profile`, `catalog.unknown-protected-id`, `catalog.protected-mismatch`
(liste `CATALOG_ERROR_CODES`). Détail : `docs/domain-model.md`, section « Rules catalog ».

## Catalogue livré

`src/catalog.json` est une copie du catalogue Shipyard 2026.08.3, importée avec
`with { type: "json" }` ; `tsc` la copie dans `dist/`. Un test de dérive la compare au
catalogue du vault quand celui-ci est présent.

## Commandes

`pnpm --filter @koklo/rules test` (couverture : branches 90 %, lignes 80 %), `lint`, `typecheck`,
`build`.
