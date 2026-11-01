import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const fixturesDir = resolve(import.meta.dirname, "fixtures");
export const readFixture = (name: string): string =>
  readFileSync(resolve(fixturesDir, name), "utf8");

type Json = Record<string, unknown>;

/** Catalogue minimal valide, au format JSON d'entrée (snake_case, schema_version 1). */
export const minimalCatalog = (): Json => ({
  schema_version: 1,
  catalog_version: "2026.11.0",
  protected_rule_ids: ["global.secrets"],
  profiles: {
    core: { kind: "global", description: "Socle commun" },
    node: { kind: "language", description: "Node.js" },
  },
  rules: [
    {
      id: "global.secrets",
      title: "Aucun secret versionné",
      profiles: ["core"],
      agents: ["developer", "qa-reviewer"],
      severity: "blocking",
      protected: true,
      enforcement: { kind: "gate", adapter: "secret-scan" },
      description: "Aucun secret dans les sources.",
    },
    {
      id: "node.esm",
      title: "ESM uniquement",
      profiles: ["node"],
      agents: ["developer"],
      severity: "advisory",
      protected: false,
      enforcement: { kind: "instruction" },
      description: "Modules ECMAScript.",
    },
    {
      id: "global.scope",
      title: "Périmètre",
      profiles: ["core"],
      agents: ["developer"],
      severity: "blocking",
      protected: false,
      enforcement: { kind: "evidence", evidence: "Liste des fichiers modifiés" },
      description: "Rester dans le périmètre.",
    },
  ],
});

type Mutate = (c: Json & { rules: Json[] }) => void;
/** Copie profonde du catalogue minimal, modifiée par `mutate`, sérialisée en JSON. */
export const catalogJson = (mutate?: Mutate): string => {
  const c = minimalCatalog() as Json & { rules: Json[] };
  mutate?.(c);
  return JSON.stringify(c);
};

/** Une fixture INVALIDE par code d'erreur de parseCatalog (sauf too-large : voir parse-catalog). */
export const INVALID_FIXTURES: ReadonlyArray<{
  code: string;
  name: string;
  json: () => string;
  path?: string;
}> = [
  { code: "catalog.invalid-json", name: "JSON syntaxiquement invalide", json: () => "{ not json" },
  { code: "catalog.invalid-json", name: "document vide", json: () => "" },
  {
    code: "catalog.unknown-version",
    name: "schema_version 2",
    json: () => catalogJson((c) => (c.schema_version = 2)),
    path: "schema_version",
  },
  {
    code: "catalog.duplicate-id",
    name: "id de règle dupliqué",
    json: () =>
      catalogJson((c) => {
        c.rules.push({ ...(c.rules[1] as Json) });
      }),
    path: "rules.3.id",
  },
  {
    code: "catalog.missing-enforcement",
    name: "règle sans enforcement",
    json: () =>
      catalogJson((c) => {
        delete (c.rules[1] as Json).enforcement;
      }),
    path: "rules.1.enforcement",
  },
  {
    code: "catalog.unknown-enforcement",
    name: "type d'enforcement inconnu",
    json: () =>
      catalogJson((c) => {
        (c.rules[1] as Json).enforcement = { kind: "magic" };
      }),
    path: "rules.1.enforcement.kind",
  },
  {
    code: "catalog.unknown-profile",
    name: "profil inconnu référencé par une règle",
    json: () =>
      catalogJson((c) => {
        (c.rules[1] as Json).profiles = ["node", "cobol"];
      }),
    path: "rules.1.profiles.1",
  },
  {
    code: "catalog.unknown-protected-id",
    name: "id protégé inexistant",
    json: () =>
      catalogJson((c) => {
        c.protected_rule_ids = ["global.secrets", "ghost.rule"];
      }),
    path: "protected_rule_ids.1",
  },
  {
    code: "catalog.protected-mismatch",
    name: "règle protected hors de protected_rule_ids",
    json: () =>
      catalogJson((c) => {
        (c.rules[1] as Json).protected = true;
      }),
    path: "rules.1.protected",
  },
  {
    code: "catalog.invalid-shape",
    name: "agents vide",
    json: () =>
      catalogJson((c) => {
        (c.rules[1] as Json).agents = [];
      }),
    path: "rules.1.agents",
  },
  {
    code: "catalog.invalid-shape",
    name: "clé inconnue (schéma strict)",
    json: () =>
      catalogJson((c) => {
        (c.rules[1] as Json).surprise = true;
      }),
  },
  {
    code: "catalog.invalid-shape",
    name: "sévérité inconnue",
    json: () =>
      catalogJson((c) => {
        (c.rules[1] as Json).severity = "fatal";
      }),
    path: "rules.1.severity",
  },
  {
    code: "catalog.invalid-shape",
    name: "rôle d'agent inconnu",
    json: () =>
      catalogJson((c) => {
        (c.rules[1] as Json).agents = ["intern"];
      }),
  },
  { code: "catalog.invalid-shape", name: "racine tableau", json: () => "[]" },
];
