# @koklo/schema

Modèle d'entités du dépôt de spec Koklo (vision §12 et §16) : schémas Zod, JSON Schema générés,
parseurs durcis (YAML, JSON, Markdown), règles de cohérence 4, 5 et 7 et rapport de validation.
Paquet privé du monorepo, tag `schema` : aucune dépendance vers un autre paquet applicatif.

## Rôle

Le dépôt de spec est un ensemble de fichiers texte. Ce paquet les lit, les valide et les
signale, **sans jamais lire le disque ni le réseau** : l'appelant fournit `{ path, content }`,
le paquet rend des entités typées et un rapport trié.

## Entités

| Fichier du dépôt de spec  | Type                                                        | Schéma Zod                               |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `koklo.project.yaml`      | manifeste projet                                            | `ProjectManifestSchema`                  |
| `features/F-*.md`         | feature (front matter + `## Description` + critères `AC-n`) | `FeatureSchema`                          |
| `data/tables/T-*.yaml`    | table                                                       | `TableSchema`                            |
| `data/relations.yaml`     | relations entre champs                                      | `RelationsFileSchema` / `RelationSchema` |
| `api/endpoints/E-*.yaml`  | endpoint                                                    | `EndpointSchema`                         |
| `design/screens/S-*.json` | écran (arbre de nœuds annotés)                              | `ScreenSchema`                           |
| `tests/scenarios/*.yaml`  | scénario de test lié à une feature                          | `TestScenarioSchema`                     |

Tous les objets sont des `z.strictObject` (clé inconnue refusée), sauf le nœud d'écran
(`z.looseObject`) : seules les clés utiles aux règles sont typées, les autres passent. Le type de
fichier se déduit du chemin (`parse/kinds.ts`) ; un fichier hors modèle est ignoré. Le nom du
fichier doit être l'identifiant de l'entité (ou commencer par `<id>-`).

## JSON Schema générés

`src/json-schemas.ts` produit un JSON Schema draft 2020-12 par entité avec `z.toJSONSchema`
(`io: "input"`, `$id` = `https://koklo.dev/schemas/spec/v1/<nom>.schema.json`). Les sept fichiers
sont versionnés dans `schemas/` (`endpoint`, `feature`, `project`, `relation`, `screen`, `table`,
`test-scenario`) et régénérés par :

```bash
pnpm --filter @koklo/schema schemas:generate
```

Un test anti-dérive compare le contenu de `schemas/` à la sortie de Zod : modifier un schéma sans
régénérer fait échouer la CI. `schemas/` est exclu du formateur Biome (`biome.json` du paquet)
pour que la sérialisation canonique reste intacte.

## Sérialisation canonique

`canonicalize(value)` rend un JSON déterministe : clés triées (unités de code UTF-16), tableaux
dans l'ordre, indentation de 2 espaces, un seul `\n` final. Une propriété `undefined` est omise ;
toute autre valeur non JSON (nombre non fini, `bigint`, fonction, objet non simple, référence
circulaire) lève une `CanonicalizeError` dont `path` est le pointeur JSON fautif.

## Parseurs durcis

- **YAML** (`yaml` 2.9.1, `parseDocument`, jamais `parse`) : YAML 1.2, schéma `core`, clé dupliquée
  refusée, fusion `<<` désactivée, un seul document, alias / ancres / étiquettes explicites
  refusés, `toJS({ maxAliasCount: 0 })`.
- **Taille** : 1 048 576 caractères au plus par fichier (`STRUCT_FILE_TOO_LARGE`).
- **JSON** (écrans) : `JSON.parse` sous `try/catch`. Limite connue : une clé dupliquée n'y est pas
  détectée, la dernière valeur gagne (`JSON.parse` ne l'expose pas).
- **Markdown de feature** : front matter entre deux lignes `---`, section `## Description`,
  section `## Critères d'acceptation` avec `### AC-n — titre` et puces `**Étant donné**`,
  `**Quand**`, `**Alors**`, `**Et**`. Le corps **remplace** les clés `description` et `criteres`
  d'un éventuel front matter, sans issue.
- **Émetteur** `emitFeatureMarkdown(feature)` (TK-44a) : l'inverse du parseur, pure, qui ne lève que
  `EmitFeatureError` (`path` = pointeur JSON de la valeur refusée). Front matter à ordre de clés
  FIXE (`id, titre, statut, priorite, tables, endpoints, ecrans, roles, regles, nfr`, listes en
  style flux), puis `## Description` et les critères ; ordre des listes et des critères conservé,
  identifiants `AC-n` jamais renumérotés. `parseFeatureMarkdown(emit(f))` rend `f` et l'émission est
  idempotente (la fixture F-001 est réémise à l'octet près). Refus : feature invalide au sens de
  `FeatureSchema`, identifiants de critères dupliqués, titre, titre de critère ou texte d'étape sur
  plusieurs lignes (ou avec NUL, ou espace de bord pour les deux derniers), description contenant
  une ligne `## ...` ou `---` (injection de front matter ou de section). Le titre est cité en YAML
  si nécessaire, jamais d'ancre ni d'étiquette.
- Aucun parseur ne lève : toute erreur devient une `Issue` `STRUCT_*`.

## Règles et codes d'issue

Le rapport est une liste d'`Issue` `{ rule, code, severity, path, pointer, entityId?, message }`,
triée par `path`, `pointer`, `code`, `message`. `ok` vaut `true` s'il n'y a aucune erreur ; les
avertissements (règle 7) ne le font pas échouer. Les 27 codes de `ISSUE_CODES` font partie du
contrat public.

| Règle                                                                        | Gravité       | Codes                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 : tout lien pointe vers une entité existante                               | erreur        | `R4_UNKNOWN_FEATURE`, `R4_UNKNOWN_CRITERION`, `R4_UNKNOWN_TABLE`, `R4_UNKNOWN_FIELD`, `R4_UNKNOWN_ENDPOINT`, `R4_UNKNOWN_SCREEN`, `R4_MALFORMED_DATA_REF`                                                                                                                                                                     |
| 5 : `specifiee` a un écran ou un endpoint, `implementee` un test par critère ; dès `specifiee`, chaque critère a ses étapes dans l'ordre Étant donné, Quand, Alors | erreur        | `R5_SPECIFIED_WITHOUT_SCREEN_OR_ENDPOINT`, `R5_IMPLEMENTED_CRITERION_WITHOUT_TEST`, `R5_IMPLEMENTED_WITHOUT_CRITERIA`, `R5_CRITERION_INCOMPLETE`                                                                                                                                                                                                         |
| 7 : aucune entité orpheline                                                  | avertissement | `R7_ORPHAN_TABLE`, `R7_ORPHAN_ENDPOINT`, `R7_ORPHAN_SCREEN`, `R7_ORPHAN_TEST`                                                                                                                                                                                                                                                 |
| structure                                                                    | erreur        | `STRUCT_YAML_SYNTAX`, `STRUCT_DUPLICATE_KEY`, `STRUCT_YAML_FORBIDDEN_FEATURE`, `STRUCT_MULTIPLE_DOCUMENTS`, `STRUCT_FILE_TOO_LARGE`, `STRUCT_JSON_SYNTAX`, `STRUCT_FRONT_MATTER_MISSING`, `STRUCT_MARKDOWN_SYNTAX`, `STRUCT_SCHEMA_VIOLATION`, `STRUCT_UNSUPPORTED_SPEC_VERSION`, `STRUCT_ID_MISMATCH`, `STRUCT_DUPLICATE_ID` |

Une référence de donnée vaut `T-table` ou `T-table.champ`. Une entité qui échoue au parsing est
exclue du snapshot (`ParsedSpec`) et signalée ; les règles 4, 5 et 7 s'exécutent sur le reste.
Le premier identifiant rencontré gagne, les doublons sont signalés (`STRUCT_DUPLICATE_ID`).

## Pureté

`src/` n'importe ni `node:*`, ni `fetch`, ni `process`, ni `Date`, ni `Math.random`, ni `console` :
un test de pureté le vérifie. Mêmes entrées, même rapport, quel que soit l'ordre des fichiers
(ordre interne : chemin sans extension, puis chemin complet, afin que `S-register` précède
`S-register-success`). Seul `scripts/generate-schemas.ts` touche au disque.

## Exemple

```ts
import { checkSpec, type SpecFile } from "@koklo/schema";

const files: SpecFile[] = [
  { path: "koklo.project.yaml", content: "projet: demo\norganisation: acme\nspec_version: 1\n" },
  { path: "data/tables/T-user.yaml", content: "id: T-user\nchamps: []\n" },
];

const report = checkSpec(files); // parse puis règles 4, 5 et 7
if (!report.ok) {
  for (const issue of report.issues) console.error(`${issue.code} ${issue.path}${issue.pointer}`);
}
// report.counts -> { error, warning } ; ici : R7_ORPHAN_TABLE (avertissement), ok === true
```

`parseSpecFiles(files)` ne rend que `{ spec, issues }` ; `validateSpec(spec)` n'applique que les
règles sur des entités déjà parsées ; `parseFeatureMarkdown(path, content)` lit une feature seule.

## Commandes

```bash
pnpm --filter @koklo/schema test              # vitest + couverture (seuils 80 % / 70 %)
pnpm --filter @koklo/schema schemas:generate  # régénère schemas/*.schema.json
pnpm --filter @koklo/schema build             # dist/
```

## Mise en page

```text
src/
  codes.ts, types.ts, issue.ts, pointer.ts, canonical.ts, validate.ts, json-schemas.ts, index.ts
  entities/   ids, feature, project, data (table, relations, endpoint), screen (+ scénario de test)
  parse/      kinds (chemin -> type), yaml / JSON durcis, feature-markdown, markdown-sections,
              zod-issues (erreurs Zod -> issues), files (parseSpecFiles)
  rules/      index (index de résolution), rule4, rule5, rule7
scripts/generate-schemas.ts   schemas/  test/
```

### Critères structurés (`R5_CRITERION_INCOMPLETE`)

Dès `specifiee` (donc aussi `implementee` et `adoptee`), chaque critère doit contenir au moins une
étape `etant_donne`, une `quand` et une `alors`, dans cet ordre (répétitions permises). Une étape
`et` prend le rôle de l'étape précédente ; en tête, elle est une faute. Une seule issue par
critère (la première faute) : pointeur `/criteres/<i>/etapes/<j>` pour une étape mal placée,
`/criteres/<i>/etapes` pour un rôle manquant ou une liste vide. Les `brouillon` restent tolérés ;
le parseur Markdown et le schéma Zod n'ajoutent aucune contrainte. `splitFrontMatter`
(`src/parse/frontmatter.ts`) est partagé par les parseurs de feature (usage interne).
