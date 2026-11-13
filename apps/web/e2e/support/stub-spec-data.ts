import type { IncomingMessage } from "node:http";
import { createdTables } from "./stub-feature-write.ts";

/**
 * Faux API de l'écran Données (TK-107, contrat 3.5.0) : `spec.data.tables.list`, `spec.data.mermaid`,
 * `spec.data.fixtures.list` et `.rows`, et la lecture d'édition `spec.item.get` du type `table`. Deux jeux : « démo » (6 tables,
 * 6 relations, 2 jeux de 3 lignes : la maquette 11) et « volume » (80 tables, deux jeux de 312 et 1 240 lignes), choisi par le
 * mode de spec `large*`. Aucun appel réel, aucune donnée réelle (e-mails à domaine réservé).
 */
type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string): Reply =>
  reply(status, { defined: true, code, message: code });

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

type Kind = "pk" | "fk" | "";
type Field = [name: string, type: string, constraint: string, kind: Kind, personal: boolean];
interface Table {
  specId: string;
  name: string;
  zone: string;
  description: string;
  fields: Field[];
  sources: string[];
  relations: Array<{ to: string; cardinality: string }>;
}

const ZONES = [
  "Prise de rendez-vous",
  "Clients et fidélité",
  "Catalogue et stock",
  "Personnel",
  "Paiement et caisse",
  "Communication",
];
const ID: Field = ["id", "uuid", "", "pk", false];

const DEMO: Table[] = [
  {
    specId: "T-client",
    name: "Client",
    zone: ZONES[1] as string,
    description: "Personne qui réserve, sans compte. Identifiée par son téléphone.",
    fields: [
      ID,
      ["nom", "texte(100)", "obligatoire", "", true],
      ["telephone", "texte(20)", "obligatoire", "", true],
      ["email", "texte(254)", "", "", true],
      ["consentement_sms", "booleen", "", "", false],
    ],
    sources: ["F-001", "F-002", "F-003"],
    relations: [],
  },
  {
    specId: "T-reservation",
    name: "Réservation",
    zone: ZONES[0] as string,
    description: "Cœur du produit : un client, un créneau, un service.",
    fields: [
      ID,
      ["client_id", "ref(T-client)", "obligatoire", "fk", false],
      ["creneau_id", "ref(T-creneau)", "unique", "fk", false],
      ["service_id", "ref(T-service)", "obligatoire", "fk", false],
      ["statut", "enum", "confirmee, honoree, annulee, absente", "", false],
      ["jeton_lien", "texte(64)", "unique", "", false],
    ],
    sources: ["F-001", "F-002", "R-004"],
    relations: [
      { to: "T-client", cardinality: "n → 1" },
      { to: "T-creneau", cardinality: "1 → 0..1" },
      { to: "T-service", cardinality: "n → 1" },
    ],
  },
  {
    specId: "T-service",
    name: "Service",
    zone: ZONES[2] as string,
    description: "Prestation proposée par le salon, avec sa durée et son prix affiché.",
    fields: [
      ID,
      ["nom", "texte(80)", "obligatoire", "", false],
      ["duree_min", "entier", "15 à 240", "", false],
      ["prix", "decimal", "", "", false],
    ],
    sources: ["F-004"],
    relations: [],
  },
  {
    specId: "T-creneau",
    name: "Créneau",
    zone: ZONES[0] as string,
    description: "Plage horaire d'un employé, générée depuis ses horaires.",
    fields: [
      ID,
      ["employe_id", "ref(T-employe)", "obligatoire", "fk", false],
      ["debut", "horodatage", "obligatoire", "", false],
      ["fin", "horodatage", "", "", false],
      ["statut", "enum", "libre, reserve, bloque", "", false],
    ],
    sources: ["F-001", "F-006"],
    relations: [{ to: "T-employe", cardinality: "n → 1" }],
  },
  {
    specId: "T-employe",
    name: "Employé",
    zone: ZONES[3] as string,
    description: "Membre du personnel qui réalise les prestations.",
    fields: [
      ID,
      ["nom", "texte(100)", "obligatoire", "", true],
      ["actif", "booleen", "", "", false],
    ],
    sources: ["F-006"],
    relations: [{ to: "T-service", cardinality: "n ↔ n" }],
  },
  {
    specId: "T-rappel",
    name: "Rappel SMS",
    zone: ZONES[5] as string,
    description: "Trace des SMS de rappel envoyés la veille.",
    fields: [
      ID,
      ["reservation_id", "ref(T-reservation)", "obligatoire", "fk", false],
      ["envoye_le", "horodatage", "", "", false],
      ["statut", "enum", "en attente, envoye, echec", "", false],
    ],
    sources: ["F-003", "R-003"],
    relations: [{ to: "T-reservation", cardinality: "n → 1" }],
  },
];

const VOLUME_COUNT = 80;
const pad = (n: number): string => String(n).padStart(3, "0");

/** Tables générées du volume : `T-table-007` à `T-table-080`, zones en rotation. */
const GENERATED: Table[] = Array.from({ length: VOLUME_COUNT - DEMO.length }, (_, i) => {
  const n = DEMO.length + i + 1;
  return {
    specId: `T-table-${pad(n)}`,
    name: `Table ${pad(n)}`,
    zone: ZONES[n % ZONES.length] as string,
    description: `Table générée ${n}.`,
    fields: [
      ID,
      ["nom", "texte(80)", "obligatoire", "", n % 5 === 0],
      ["actif", "booleen", "", "", false],
    ],
    sources: [`F-${pad(8 + ((n * 7) % 240))}`],
    relations: [],
  };
});

const isLarge = (mode: string): boolean => mode.startsWith("large");
const isEmpty = (mode: string): boolean =>
  mode === "dataEmpty" || mode === "empty" || mode === "building";

/** Tables enregistrées pendant le scénario (`table.create` du faux API) : elles s'ajoutent au jeu. */
const added = (): Table[] =>
  createdTables().map((entry) => ({
    specId: entry.specId,
    name: entry.name,
    zone: entry.zone,
    description: entry.description,
    fields: entry.fields.map<Field>((f) => [
      f.name,
      f.type,
      f.constraints ?? "",
      f.primaryKey ? "pk" : f.type.startsWith("ref(") ? "fk" : "",
      f.personalData === true,
    ]),
    sources: entry.sources,
    relations: [],
  }));

const tablesOf = (mode: string): Table[] =>
  isEmpty(mode) ? added() : [...DEMO, ...(isLarge(mode) ? GENERATED : []), ...added()];

/** Compteurs de `spec.head.counts` pour la page Données. */
export const dataCounts = (mode: string) => {
  const tables = tablesOf(mode);
  const relations = tables.reduce((n, t) => n + t.relations.length, 0);
  return {
    tables: tables.length,
    relations: isLarge(mode) ? relations + 88 : relations,
    fixtures: isEmpty(mode) ? 0 : 2,
  };
};

const summaryOf = (table: Table, tables: Table[]) => ({
  specId: table.specId,
  name: table.name,
  zone: table.zone,
  fieldCount: table.fields.length,
  relationCount:
    table.relations.length +
    tables.filter((t) => t.relations.some((r) => r.to === table.specId)).length,
  usedBy: table.sources,
  personalData: table.fields.some((f) => f[4]),
  filePath: `data/tables/${table.specId.slice(2)}.yaml`,
});

const PAGE = 50;

function listTables(url: URL, mode: string): Reply {
  const tables = tablesOf(mode);
  const q = url.searchParams.get("q")?.toLowerCase();
  const zone = url.searchParams.get("zone");
  const around = url.searchParams.get("around");
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit") ?? PAGE) || PAGE;
  const filtered = tables.filter(
    (t) =>
      (!zone || t.zone === zone) &&
      (!q ||
        t.name.toLowerCase().includes(q) ||
        t.specId.toLowerCase().includes(q) ||
        t.fields.some((f) => f[0].toLowerCase().includes(q))),
  );
  let start = 0;
  if (cursor) start = Number(cursor.split(":")[1]);
  else if (around) {
    const index = filtered.findIndex((t) => t.specId === around);
    if (index === -1) return typed(404, "NOT_FOUND");
    start = Math.floor(index / limit) * limit;
  }
  const end = Math.min(filtered.length, start + limit);
  const zones: Record<string, number> = {};
  for (const t of tables.filter((x) => !q || x.name.toLowerCase().includes(q))) {
    zones[t.zone] = (zones[t.zone] ?? 0) + 1;
  }
  return reply(200, {
    items: filtered.slice(start, end).map((t) => summaryOf(t, tables)),
    nextCursor: end < filtered.length ? `a:${end}` : null,
    previousCursor: start > 0 ? `b:${start}` : null,
    offset: start,
    total: filtered.length,
    facets: { zone: zones },
  });
}

const MERMAID_TYPE: Record<string, string> = {
  uuid: "uuid",
  entier: "int",
  decimal: "decimal",
  booleen: "bool",
  horodatage: "timestamp",
  date: "date",
  enum: "enum",
  json: "json",
};
const GLYPH: Record<string, string> = {
  "1 → n": "||--o{",
  "n → 1": "}o--||",
  "1 → 1": "||--||",
  "1 → 0..1": "||--o|",
  "n ↔ n": "}o--o{",
};
const entity = (id: string): string => id.replaceAll("-", "_");
const mermaidType = (type: string): string =>
  type.startsWith("texte(")
    ? "string"
    : type.startsWith("ref(")
      ? "uuid"
      : (MERMAID_TYPE[type] ?? "string");

function mermaidOf(tables: Table[]): string {
  const sorted = [...tables].sort((a, b) => (a.specId < b.specId ? -1 : 1));
  const blocks = sorted.map((t) =>
    [
      `  ${entity(t.specId)} {`,
      ...t.fields.map(
        (f) => `    ${mermaidType(f[1])} ${f[0]}${f[3] ? ` ${f[3].toUpperCase()}` : ""}`,
      ),
      "  }",
    ].join("\n"),
  );
  const relations = sorted.flatMap((t) =>
    t.relations.map(
      (r) =>
        `  ${entity(t.specId)} ${GLYPH[r.cardinality] ?? "||--||"} ${entity(r.to)} : "${r.cardinality}"`,
    ),
  );
  return `%% Généré par koklo depuis data/tables : ne pas modifier à la main.\nerDiagram\n${[...blocks, ...relations].join("\n")}\n`;
}

interface Fixture {
  specId: string;
  title: string;
  table: string;
  locale: string;
  rowCount: number;
  columns: string[];
  row: (n: number) => Record<string, string | number | boolean>;
}

const NAMES = [
  "Léa Martin",
  "Karim Haddad",
  "Sophie Dubois",
  "Hugo Leroy",
  "Inès Moreau",
  "Yanis Petit",
];
const SERVICES = ["Coupe femme", "Barbe", "Couleur", "Brushing", "Soin"];
const STATES = ["confirmée", "honorée", "annulée", "absente"];

const fixturesOf = (mode: string): Fixture[] => {
  const large = isLarge(mode);
  return [
    {
      specId: "FX-clients",
      title: "Clients",
      table: "T-client",
      locale: "fr-FR",
      rowCount: large ? 312 : 3,
      columns: ["nom", "telephone", "email", "consentement_sms"],
      row: (n) => ({
        nom: NAMES[(n - 1) % NAMES.length] as string,
        telephone: `+33 6 12 34 ${String(10 + (n % 90)).padStart(2, "0")} ${String(10 + ((n * 7) % 90))}`,
        email: `client${n}@exemple.fr`,
        consentement_sms: n % 3 === 0 ? "non" : "oui",
      }),
    },
    {
      specId: "FX-reservations",
      title: "Réservations",
      table: "T-reservation",
      locale: "fr-FR",
      rowCount: large ? 1240 : 3,
      columns: ["client", "service", "créneau", "statut"],
      row: (n) => ({
        client: NAMES[(n - 1) % NAMES.length] as string,
        service: SERVICES[(n - 1) % SERVICES.length] as string,
        créneau: `mar. ${9 + (n % 8)} h ${n % 2 === 0 ? "00" : "30"}`,
        statut: STATES[(n - 1) % STATES.length] as string,
      }),
    },
  ];
};

function rowsOf(url: URL, mode: string, fixtureId: string): Reply {
  const fixture = fixturesOf(mode).find((f) => f.specId === fixtureId);
  if (!fixture || isEmpty(mode)) return typed(404, "NOT_FOUND");
  const page = Number(url.searchParams.get("page") ?? 1) || 1;
  const size = Number(url.searchParams.get("size") ?? 25) || 25;
  const first = (page - 1) * size + 1;
  const last = Math.min(fixture.rowCount, page * size);
  return reply(200, {
    items: Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => fixture.row(first + i)),
    total: fixture.rowCount,
    totalIsEstimate: false,
    columns: fixture.columns,
  });
}

const detailOf = (table: Table) => ({
  specId: table.specId,
  name: table.name,
  description: table.description,
  zone: table.zone,
  sources: table.sources,
  fields: table.fields.map((f) => ({
    name: f[0],
    type: f[1],
    primaryKey: f[3] === "pk",
    ...(f[1] === "enum" ? { values: f[2].split(", ") } : f[2] ? { constraints: f[2] } : {}),
    personalData: f[4],
  })),
  relations: table.relations,
  filePath: `data/tables/${table.specId.slice(2)}.yaml`,
  commitSha: SHA,
});

interface Handlers {
  send: (reply: Reply) => void;
}

// --- Diagramme (TK-108, contrat 3.6.0) : positions enregistrées dans data/_layout.yaml et source d'une table ---
type Position = { x: number; y: number };
let layoutPositions: Record<string, Position> = {};
const layoutSaves: Array<Record<string, unknown>> = [];

/** Remet à zéro les positions et le journal des dépôts (changement de scénario). */
export function resetLayout(): void {
  layoutPositions = {};
  layoutSaves.length = 0;
}

const LAYOUT_SHA = "b2c3d4e5f60718293a4b5c6d7e8f9012345678a1";

const sourceYamlOf = (table: Table): string => {
  const lines = [
    `id: ${table.specId}`,
    `nom: ${table.name}`,
    "description: >",
    `  ${table.description}`,
    `source: [${table.sources.join(", ")}]`,
    "champs:",
  ];
  for (const [name, type, constraint, kind, personal] of table.fields) {
    lines.push(`  - nom: ${name}`, `    type: ${type}`);
    lines.push(kind === "pk" ? "    cle: primaire" : `    contraintes: "${constraint}"`);
    if (personal) lines.push("    donnees_personnelles: true   # NFR-001");
  }
  if (table.relations.length > 0) lines.push("relations:");
  for (const relation of table.relations) {
    lines.push(`  - vers: ${relation.to}`, `    cardinalite: "${relation.cardinality}"`);
  }
  return `${lines.join("\n")}\n`;
};

const LAYOUT = /^\/projects\/[^/]+\/spec\/data\/layout$/;
const SOURCE = /^\/projects\/[^/]+\/spec\/data\/tables\/([^/]+)\/source$/;

/** Lecture et dépôt des positions, source d'une table, journal des dépôts (`/__layout-saves`). */
function handleDiagram(req: IncomingMessage, url: URL, h: Handlers, mode: string): boolean {
  if (url.pathname === "/__layout-saves") {
    h.send(reply(200, layoutSaves));
    return true;
  }
  if (LAYOUT.test(url.pathname)) {
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        const body = JSON.parse(raw || "{}") as { positions?: Record<string, Position> };
        layoutSaves.push(body);
        layoutPositions = body.positions ?? {};
        h.send(reply(200, { commitSha: LAYOUT_SHA }));
      });
    } else h.send(reply(200, { positions: layoutPositions, commitSha: LAYOUT_SHA }));
    return true;
  }
  const source = req.method === "GET" ? SOURCE.exec(url.pathname) : null;
  if (!source) return false;
  const found = tablesOf(mode).find((t) => t.specId === source[1]);
  h.send(
    found
      ? reply(200, {
          path: `data/tables/${found.specId.slice(2)}.yaml`,
          text: sourceYamlOf(found),
          commitSha: SHA,
          generated: false,
        })
      : typed(404, "NOT_FOUND"),
  );
  return true;
}

const DATA = /^\/projects\/[^/]+\/spec\/data\/(tables|mermaid|fixtures)(?:\/([^/]+)\/rows)?$/;
const ITEM = /^\/projects\/[^/]+\/spec\/items\/table\/([^/]+)$/;

/** Répond aux lectures des onglets Données et à la lecture d'édition d'une table, `false` pour toute autre route. */
export function handleSpecData(req: IncomingMessage, url: URL, h: Handlers, mode: string): boolean {
  if (handleDiagram(req, url, h, mode)) return true;
  if (req.method !== "GET") return false;
  const item = ITEM.exec(url.pathname);
  if (item) {
    const found = tablesOf(mode).find((t) => t.specId === item[1]);
    h.send(
      found
        ? reply(200, {
            type: "table",
            id: found.specId,
            values: detailOf(found),
            validated: false,
            referencedBy: { items: [], total: 0 },
          })
        : typed(404, "NOT_FOUND"),
    );
    return true;
  }
  const match = DATA.exec(url.pathname);
  if (!match) return false;
  if (match[1] === "tables") h.send(listTables(url, mode));
  else if (match[1] === "mermaid") {
    h.send(reply(200, { text: mermaidOf(tablesOf(mode)), generated: false, commitSha: SHA }));
  } else if (match[2]) h.send(rowsOf(url, mode, match[2]));
  else {
    h.send(
      reply(200, {
        items: isEmpty(mode)
          ? []
          : fixturesOf(mode).map((f) => ({
              specId: f.specId,
              title: f.title,
              table: f.table,
              locale: f.locale,
              rowCount: f.rowCount,
              filePath: `data/fixtures/${f.specId}.yaml`,
            })),
      }),
    );
  }
  return true;
}

const CLIENT_DATA = /^\/client-space\/projects\/[^/]+\/data\/(model|fixtures)(?:\/([^/]+)\/rows)?$/;
const CLIENT_SUMMARIES: Record<string, string[]> = {
  "T-client": ["Le nom du client", "Son numéro de téléphone", "Son adresse e-mail"],
  "T-reservation": ["Le créneau choisi", "Le service réservé", "L'état de la réservation"],
};
const USED_BY_LABELS: Record<string, string> = {
  "F-001": "Réserver un créneau",
  "F-002": "Gérer son profil",
  "F-003": "Recevoir un rappel",
  "R-004": "Un créneau n'est réservé qu'une fois",
};

/** Ce que le client lit d'une table : ni contrainte, ni valeur, ni chemin (contrat 3.7.0, `clientSpace.dataModel`). */
function clientTableOf(table: Table, names: ReadonlyMap<string, string>) {
  return {
    id: table.specId,
    name: table.name,
    zone: table.zone,
    description: table.description,
    fields: table.fields.map(([name, type, , kind, personal]) => ({
      name,
      type,
      primaryKey: kind === "pk",
      personalData: personal,
    })),
    relations: table.relations.map((relation) => ({
      to: relation.to,
      toName: names.get(relation.to) ?? relation.to,
      cardinality: relation.cardinality,
    })),
    usedBy: table.sources.map((id) => ({
      id,
      label: USED_BY_LABELS[id] ?? `Fonctionnalité ${id}`,
    })),
    clientSummary: CLIENT_SUMMARIES[table.specId] ?? [],
  };
}

/**
 * Lectures client du modèle validé (`clientSpace.dataModel|dataFixtures|dataFixtureRows`, TK-109) ; `available` faux :
 * aucune table. `null` pour toute autre route.
 */
export function clientDataReply(url: URL, mode: string, available: boolean): Reply | null {
  const match = CLIENT_DATA.exec(url.pathname);
  if (!match) return null;
  if (match[2]) return rowsOf(url, mode, match[2]);
  const tables = available ? tablesOf(mode).slice(0, 100) : [];
  if (match[1] === "fixtures") {
    return reply(200, {
      items: available
        ? fixturesOf(mode).map(({ specId, title, table, locale, rowCount }) => ({
            specId,
            title,
            table,
            locale,
            rowCount,
          }))
        : [],
    });
  }
  const names = new Map(tablesOf(mode).map((table) => [table.specId, table.name]));
  return reply(200, {
    available,
    validation: available ? "validated" : "to_validate",
    truncated: available && tablesOf(mode).length > 100,
    items: tables.map((table) => clientTableOf(table, names)),
    positions: {},
  });
}
