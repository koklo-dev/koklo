import { screen } from "@testing-library/react";
import { DataPage } from "../../src/components/data-page.tsx";
import { head, PROJECT_ID, serve } from "./features.tsx";
import { serveProposals } from "./proposals.tsx";
import { renderWithQuery } from "./render.tsx";
import { procedures, setUrl } from "./web-mocks.ts";

/** Faux serveur du modèle de données (contrat 3.6.0) : tables, diagramme, positions, jeux d'exemple, propositions. */
export { PROJECT_ID };
export const SHA40 = "a".repeat(40);

export const tableRow = (n: number, over: Record<string, unknown> = {}) => {
  const slug = `table-${String(n).padStart(3, "0")}`;
  return {
    specId: `T-${slug}`,
    name: `Table ${String(n).padStart(3, "0")}`,
    zone: `Zone ${(n % 3) + 1}`,
    fieldCount: 5,
    relationCount: 1,
    usedBy: ["F-001"],
    personalData: false,
    filePath: `data/tables/${slug}.yaml`,
    ...over,
  };
};

export const TABLES = [
  tableRow(1, {
    specId: "T-client",
    name: "Client",
    zone: "Clients et fidélité",
    fieldCount: 5,
    relationCount: 2,
    usedBy: ["F-001", "R-004"],
    personalData: true,
  }),
  tableRow(2, {
    specId: "T-reservation",
    name: "Réservation",
    zone: "Prise de rendez-vous",
    fieldCount: 6,
    relationCount: 3,
    usedBy: ["F-001"],
  }),
  tableRow(3, { specId: "T-service", name: "Service", zone: "Catalogue et stock", usedBy: [] }),
];

export const MODEL = `erDiagram
  T_client {
    uuid id PK
    string nom
    string telephone
  }
  T_reservation {
    uuid id PK
    uuid client_id FK
    timestamp debut
  }
  T_service {
    uuid id PK
    string libelle
  }
  T_reservation }o--|| T_client : "n → 1"
`;

export const FIXTURES = [
  {
    specId: "FX-clients",
    title: "Clients",
    table: "T-client",
    locale: "fr-FR",
    rowCount: 60,
    filePath: "data/fixtures/FX-clients.yaml",
  },
];

/** Page `n` des lignes du jeu « Clients » (60 par défaut) : 25, 50 ou 100 par page. */
export const fixtureRows = (page: number, size = 25, total = 60) => {
  const all = Array.from({ length: total }, (_, i) => ({
    nom: `Client ${i + 1}`,
    telephone: `+33 6 00 00 00 ${String(i + 1).padStart(2, "0")}`,
    email: `client${i + 1}@exemple.fr`,
  }));
  return {
    items: all.slice((page - 1) * size, page * size),
    total: all.length,
    totalIsEstimate: false,
    columns: ["nom", "telephone", "email"],
  };
};

/** Fiche d'une table (`spec.item.get`, type `table`) : le formulaire de modification la relit. */
export const TABLE_DETAIL = {
  specId: "T-client",
  name: "Client",
  description: "Une personne qui réserve.",
  zone: "Clients et fidélité",
  sources: ["F-001", "R-004"],
  fields: [
    { name: "id", type: "uuid", primaryKey: true, personalData: false },
    {
      name: "nom",
      type: "texte(80)",
      constraints: "obligatoire",
      primaryKey: false,
      personalData: false,
    },
    { name: "telephone", type: "texte(20)", primaryKey: false, personalData: true },
  ],
  relations: [{ to: "T-service", cardinality: "n → 1" }],
  filePath: "data/tables/client.yaml",
  commitSha: SHA40,
};

/** Source d'une table (`spec.data.tables.source`) : le fichier du dépôt, ou le YAML généré. */
export const TABLE_YAML = `id: T-client
nom: Client
champs:
  - nom: id
    type: uuid
    cle: primaire
`;

interface TablesOptions {
  /** Relations entre tables (`[de, vers]`), pour les liens des zones. */
  links?: ReadonlyArray<readonly [string, string]>;
  rows?: ReadonlyArray<ReturnType<typeof tableRow>>;
  /** Fait échouer la lecture de la liste. */
  fail?: Error;
}

type Row = ReturnType<typeof tableRow>;

/** Tables dont le nom contient la recherche, dans la zone choisie. */
const matching = (rows: readonly Row[], q: unknown, zone: unknown): Row[] =>
  rows.filter(
    (row) =>
      (!zone || row.zone === zone) &&
      (!q || row.name.toLowerCase().includes(String(q).toLowerCase())),
  );

/** Début de la page : le curseur, ou la page qui contient `around` (NOT_FOUND s'il est absent). */
function pageStart(items: readonly Row[], input: Record<string, unknown>, size: number): number {
  if (input.cursor) return Number(input.cursor);
  if (!input.around) return 0;
  const at = items.findIndex((row) => row.specId === input.around);
  if (at === -1) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  return Math.floor(at / size) * size;
}

/** `spec.data.tables.list` : recherche sur le nom, filtre de zone, pages à curseur, `around`. */
export function serveTables({ rows = TABLES, fail }: TablesOptions = {}): void {
  procedures.specDataTablesList.mockImplementation(async (input: unknown) => {
    if (fail) throw fail;
    const args = (input ?? {}) as Record<string, unknown>;
    const size = Number(args.limit ?? 50);
    const items = matching(rows, args.q, args.zone);
    const from = pageStart(items, args, size);
    const zones: Record<string, number> = {};
    for (const row of rows) zones[row.zone] = (zones[row.zone] ?? 0) + 1;
    return {
      items: items.slice(from, from + size),
      nextCursor: from + size < items.length ? String(from + size) : null,
      previousCursor: from > 0 ? String(Math.max(0, from - size)) : null,
      offset: from,
      total: items.length,
      facets: { zone: zones },
    };
  });
}

export function serveData(
  role: Parameters<typeof serve>[0] = "owner",
  options: TablesOptions = {},
) {
  serve(role);
  procedures.specHead.mockResolvedValue(
    head({
      counts: {
        features: 7,
        tables: (options.rows ?? TABLES).length,
        endpoints: 0,
        rules: 4,
        roles: 3,
        flows: 2,
        relations: 2,
        fixtures: 1,
      },
    }),
  );
  serveTables(options);
  const previous = procedures.specItemGet.getMockImplementation();
  procedures.specItemGet.mockImplementation(async (input) => {
    const { type, id } = input as { type?: string; id: string };
    if (type !== "table") return previous?.(input);
    return {
      type: "table",
      id,
      values: { ...TABLE_DETAIL, specId: id },
      validated: false,
      referencedBy: { items: [], total: 0 },
    };
  });
  procedures.specDataMermaid.mockResolvedValue({ text: MODEL, generated: false, commitSha: SHA40 });
  procedures.specDataLayoutGet.mockResolvedValue({ positions: {}, commitSha: SHA40 });
  procedures.specDataLayoutSave.mockResolvedValue({ commitSha: SHA40 });
  procedures.specDataTablesSource.mockImplementation(async (input: unknown) => {
    const { tableId } = input as { tableId: string };
    return {
      path: `data/tables/${tableId.slice(2)}.yaml`,
      text: TABLE_YAML,
      commitSha: SHA40,
      generated: false,
    };
  });
  procedures.specDataFixturesList.mockResolvedValue({ items: FIXTURES });
  procedures.specDataFixturesRows.mockImplementation(async (input: unknown) =>
    fixtureRows(Number((input as { page: number }).page)),
  );
  procedures.specDataFixturesPage.mockImplementation(async (input: unknown) => {
    const { page, size } = input as { page: number; size: number };
    return fixtureRows(Number(page), Number(size));
  });
  serveZones(options.rows ?? TABLES, options.links);
  // TK-109 : décisions du livrable (Validé par) et commentaires de table, vides par défaut
  procedures.reviewList.mockResolvedValue({ items: [], nextCursor: null });
  procedures.commentList.mockResolvedValue({ items: [], nextCursor: null });
  serveProposals([]);
}

export function renderData({ search = "" }: { search?: string } = {}) {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  setUrl(`/projects/${PROJECT_ID}/spec/data${query}`);
  return renderWithQuery(<DataPage projectId={PROJECT_ID} />);
}

export const tabNamed = (name: RegExp | string): HTMLElement =>
  screen.getByRole("link", { name, hidden: true });

/** Identifiant d'une zone : son libellé en minuscules, sans accent, tirets (comme le serveur). */
export const zoneIdOf = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Faux serveur des zones (contrat 3.8.0) d'après les lignes de `tables.list` : `spec.data.zones` (cartes, aperçu de 7
 * noms, liens), `spec.data.zone` (tables, relations internes, liens sortants) et `spec.data.search` (20 au plus).
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: faux serveur des trois lectures de zones
export function serveZones(
  rows: readonly Row[],
  links: ReadonlyArray<readonly [string, string]> = [],
): void {
  const zoneOf = new Map(rows.map((row) => [row.specId, row.zone]));
  const names = [...new Set(rows.map((row) => row.zone))].sort((a, b) => a.localeCompare(b, "fr"));
  const between = (name: string) => {
    const counts = new Map<string, number>();
    for (const [from, to] of links) {
      const a = zoneOf.get(from);
      const b = zoneOf.get(to);
      if (!a || !b || a === b || (a !== name && b !== name)) continue;
      const other = zoneIdOf(a === name ? b : a);
      counts.set(other, (counts.get(other) ?? 0) + 1);
    }
    return [...counts].map(([to, count]) => ({ to, count }));
  };
  const summary = (name: string) => ({
    id: zoneIdOf(name),
    name,
    icon: "folder_open",
    tableCount: rows.filter((row) => row.zone === name).length,
  });
  procedures.specDataZones.mockResolvedValue({
    zones: names.map((name) => ({
      ...summary(name),
      preview: rows
        .filter((row) => row.zone === name)
        .slice(0, 7)
        .map((row) => row.name),
      links: between(name),
    })),
    tableCount: rows.length,
    commitSha: SHA40,
  });
  procedures.specDataZone.mockImplementation(async (input: unknown) => {
    const name = names.find((entry) => zoneIdOf(entry) === (input as { zone: string }).zone);
    if (!name) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
    const members = rows.filter((row) => row.zone === name);
    const ids = new Set(members.map((row) => row.specId));
    return {
      zone: summary(name),
      tables: members.map((row) => ({
        specId: row.specId,
        name: row.name,
        zone: row.zone,
        fields: [{ name: "id", type: "uuid", primaryKey: true, personalData: false }],
        personalData: false,
      })),
      relations: links
        .filter(([from, to]) => ids.has(from) && ids.has(to))
        .map(([from, to]) => ({ from, to, cardinality: "n → 1" })),
      outgoing: between(name).map(({ to, count }) => ({ zone: to, count })),
      truncated: false,
      commitSha: SHA40,
    };
  });
  procedures.specDataSearch.mockImplementation(async (input: unknown) => {
    const q = String((input as { q: string }).q).toLowerCase();
    return {
      items: rows
        .filter((row) => row.name.toLowerCase().includes(q))
        .slice(0, 20)
        .map((row) => ({ id: row.specId, name: row.name, zone: row.zone })),
    };
  });
}
