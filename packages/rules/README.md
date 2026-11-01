# @koklo/rules

Catalogue des règles d'ingénierie Koklo : schémas zod, analyse (`parseCatalog`) et catalogue
livré (`loadBuiltInCatalog`). Paquet privé, tag `rules`, **pur** : seule dépendance `zod`, ni
horloge, ni aléa, ni E/S dans `src`. Lot A de TK-71 : catalogue ; lot B : composition en
couches, règles verrouillées, dérogations, résolution et explication ; le lot C ajoute
`koklo-strict` et `validateEvidence`.

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

## Composition et résolution (lot B)

```ts
import { loadBuiltInCatalog, renderExplanation, resolveEffectiveRules } from "@koklo/rules";

const result = resolveEffectiveRules({
  catalog: loadBuiltInCatalog(),
  layers: [
    {
      level: "project",
      author: "jane",
      override: [
        /* surcharges tracées */
      ],
    },
  ],
  role: "developer",
  path: "packages/api/src/a.ts",
  now: "2026-11-01", // injecté : aucune horloge dans le paquet
  profiles: ["node", "typescript"],
});
if (result.ok) console.log(renderExplanation(result.value));
else console.error(result.error.code); // ne lève jamais
```

- **Couches** : `organization` < `group` < `project`, au plus une par niveau, quel que soit
  l'ordre du tableau. Le catalogue (niveau `catalog`) n'est jamais une couche : une couche de
  niveau `catalog` ou inconnu est une erreur `layer.invalid-level`.
- **Verrou monotone** : une règle protégée (ou listée dans `lock` d'un niveau supérieur, ou
  ajoutée avec `protected: true`) ne peut plus être affaiblie par un niveau inférieur. Toute
  surcharge qui l'affaiblit est rejetée en bloc (`Conflict` `locked`), la règle reste
  strictement identique, trace comprise ; durcir reste permis.
- **Surcharges et dérogations tracées** : auteur, justification, `expires` (`YYYY-MM-DD`,
  borne incluse). Expirées, elles sont ignorées et signalées (`expired`). Une dérogation exige
  `expires` et ne vaut que pour son fichier.
- **`Resolution`** : JSON-sérialisable, gelée en profondeur, triée par id ; `rules`,
  `conflicts`, `disabled`, `waivers`. Les entrées ne sont jamais modifiées.
- **Matcher de chemins maison (D6)** : `*` dans un segment, `**` = 0..n segments, dotfiles
  inclus, ni `?` ni `[]` ; un motif sans joker couvre le chemin et ses descendants.
- **Sources de vérité (D5)** : le catalogue de koklo est la source de vérité ; il n'y a pas de
  synchronisation automatique avec Shipyard (la copie est vérifiée par un test de dérive).

## Profil `koklo-strict` et preuves (lot C)

`kokloStrictProfile` regroupe les 16 règles `strict.*` tirées de la vision §17.1 à 17.3. Le
profil est de kind `standard` : il est activé explicitement (couche, sélection racine ou
paquet), **jamais déduit** des autres profils. Les limites chiffrées sont des `params` typés de
l'enforcement (`{ max: 50 }`), pas du texte : fn-lines 50, complexité cognitive 15, fichier
source 300, fichier de test 500, paramètres 4, `noExplicitAny`.

```ts
import {
  loadBuiltInCatalog,
  resolveEffectiveRules,
  validateEvidence,
  withKokloStrict,
} from "@koklo/rules";

const catalog = withKokloStrict(loadBuiltInCatalog()); // ajoute profil, règles et verrous
const resolution = resolveEffectiveRules({
  catalog,
  layers: [{ level: "project", profiles: ["koklo-strict"] }], // activation explicite
  role: "developer",
  path: "packages/api/src/a.ts",
  now: "2026-11-01",
});
const report = validateEvidence(resolution.value, {
  gates: [{ ruleId: "strict.fn-lines", status: "pass" }],
});
```

- **Verrous (D3)** : les limites chiffrées, `strict.domain-purity` et
  `strict.conventional-commits` sont protégées ; un niveau inférieur ne peut ni les désactiver ni
  les affaiblir (y compris relever un `max`) ; seul le durcissement est permis. Les autres règles
  `strict.*` se surchargent ou se dérogent avec trace.
- **`checkBiomeLimits(config)`** compare les `params` des gates Biome à une configuration
  (`packages/config/biome.json`, déjà lue par l'appelant) et renvoie les dérives.
- **`validateEvidence(resolution, artefact)`** rend PASS, FAIL ou UNVERIFIED par règle `gate`
  ou `evidence`. Une règle `blocking` sans preuve est UNVERIFIED, jamais PASS ; une preuve
  incomplète (sans référence) ou un gate non exécuté l'est aussi. Les règles `advisory` ne
  bloquent pas `canPass`. Rien n'est exécuté ici : les résultats de gates viennent de la CI, et
  aucune erreur ne reprend le texte d'une preuve.

## Codes d'erreur

`catalog.too-large`, `catalog.invalid-json`, `catalog.invalid-shape`, `catalog.unknown-version`,
`catalog.duplicate-id`, `catalog.missing-enforcement`, `catalog.unknown-enforcement`,
`catalog.unknown-profile`, `catalog.unknown-protected-id`, `catalog.protected-mismatch`
(liste `CATALOG_ERROR_CODES`). Composition : `layer.invalid-shape`, `layer.invalid-level`,
`layer.duplicate-level`, `layer.collision`, `layer.invalid-pattern`, `waiver.missing-expires`,
`waiver.invalid-expires`, `resolve.invalid-role`, `resolve.invalid-path`, `resolve.invalid-now`,
`resolve.unknown-profile` (`RULES_ERROR_CODES`). Détail : `docs/domain-model.md`, sections
« Rules catalog » et « Rules composition ».

## Catalogue livré

`src/catalog.json` est une copie du catalogue Shipyard 2026.08.3, importée avec
`with { type: "json" }` ; `tsc` la copie dans `dist/`. Un test de dérive la compare au
catalogue du vault quand celui-ci est présent.

## Commandes

`pnpm --filter @koklo/rules test` (couverture : branches 90 %, lignes 80 %), `lint`, `typecheck`,
`build`.
