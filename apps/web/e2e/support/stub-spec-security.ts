import type { IncomingMessage } from "node:http";
import {
  ACTIONS,
  ASVS_ROWS,
  CARDS,
  DATA,
  type DataRow,
  FACTS,
  OWNERSHIP,
  ROLES,
  SECTIONS,
  SURFACES,
  THREATS,
  type ThreatRow,
} from "./stub-spec-security-data.ts";

/**
 * Faux API de la page Sécurité (TK-117, contrat 3.19.0) : `security.*`, `spec.document.sections`, `spec.item.get`,
 * `clientSpace.security*`, commentaires, lots d'une opération et décision `review.submit|list`. Les données sont celles de
 * la maquette 15. Scénario `security` : « empty » (Prêt), « demo », « revise » (À revoir), « validated » (Validé),
 * « notValidated » (vue client avant validation).
 */
export type SecurityMode =
  | "empty"
  | "demo"
  | "revise"
  | "validated"
  | "notValidated"
  /** TK-115b : données et droits écrits, aucune menace. */
  | "noThreats";
export type SecurityScenario = { security?: SecurityMode };

type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const BATCH_ID = "0190cccc-0000-7000-8000-000000000117";
const REVIEW_ID = "0190cccc-0000-7000-8000-000000000118";

interface State {
  threats: ThreatRow[];
  data: DataRow[];
  level: 1 | 2 | 3;
  approved: boolean;
  contact: { name: string; phone: string } | undefined;
}
const fresh = (): State => ({
  threats: THREATS.map((row) => ({ ...row })),
  data: DATA.map((row) => ({ ...row })),
  level: 2,
  approved: false,
  contact: undefined,
});
let state = fresh();
const journal: Array<Record<string, unknown>> = [];

export function resetSecurity(): void {
  state = fresh();
  journal.length = 0;
}

const isValidated = (mode: SecurityMode): boolean => mode === "validated" || state.approved;

/** Un livrable validé n'a plus rien à traiter ni à décider (B804) ; « Prêt » n'a rien. */
function threatsOf(mode: SecurityMode): ThreatRow[] {
  if (mode === "empty" || mode === "noThreats") return [];
  if (mode !== "validated") return state.threats;
  return state.threats.map((row) =>
    row.measures.length > 0 ? row : { ...row, measures: ["Second facteur à chaque export."] },
  );
}
function dataOf(mode: SecurityMode): DataRow[] {
  if (mode === "empty") return [];
  if (mode !== "validated") return state.data;
  return state.data.map((row) => ({
    ...row,
    retention: row.retention ?? "1 an",
    category: row.category ?? "technical",
  }));
}

const statusOfThreat = (row: ThreatRow) => (row.measures.length > 0 ? "ok" : "todo");
const summaryOf = (row: ThreatRow) => ({
  id: row.id,
  title: row.title,
  surface: row.surface,
  surfaces: [row.surface],
  category: row.category,
  severity: row.severity,
  status: statusOfThreat(row),
  verification: row.verification,
});

const gherkinOf = (row: ThreatRow) =>
  `# language: fr\n@${row.id} @${row.surface} @abus\nFonctionnalité: ${SURFACES[row.surface]}\n\n  Scénario: ${row.title}\n    Étant donné les jeux de données d'exemple du projet\n    Quand ${row.when}\n    Alors ${row.expected}`;

const detailOf = (row: ThreatRow) => {
  const scripted = row.verification === "scenario";
  return {
    ...summaryOf(row),
    surfaceTitles: [{ id: row.surface, title: SURFACES[row.surface] }],
    risk: row.risk,
    measures: row.measures,
    ...(row.detail ? { verificationDetail: row.detail } : {}),
    links: row.links,
    gherkin: scripted ? gherkinOf(row) : "",
    scenarioPath: scripted ? `quality/scenarios/abuse/${row.id}.feature` : null,
    filePath: `security/threats/${row.id}.yaml`,
    commitSha: SHA,
  };
};

const page = <T>(items: T[], extra: Record<string, unknown>) => ({
  items,
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: items.length,
  ...extra,
});

function threatPage(url: URL, mode: SecurityMode) {
  const all = threatsOf(mode);
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const filter = url.searchParams.get("filter");
  const kept = all.filter(
    (row) =>
      (!q || `${row.id} ${row.title}`.toLowerCase().includes(q)) &&
      (filter !== "high" || row.severity === "high") &&
      (filter !== "todo" || row.measures.length === 0) &&
      (filter !== "ci" || row.verification === "ci_check"),
  );
  const surface: Record<string, number> = {};
  for (const row of all) surface[row.surface] = (surface[row.surface] ?? 0) + 1;
  const todo = (rows: ThreatRow[]) => rows.filter((row) => row.measures.length === 0).length;
  const high = all.filter((row) => row.severity === "high");
  const limit = Number(url.searchParams.get("limit") ?? 50);
  return {
    ...page(kept.slice(0, limit).map(summaryOf), {
      facets: {
        status: { total: all.length, todo: todo(all), todoHigh: todo(high), high: high.length },
        surface,
      },
      surfaces: Object.entries(SURFACES).map(([id, title]) => ({ id, title })),
    }),
    total: kept.length,
  };
}

const KEPT = new Set(["personal", "contact", "sensitive"]);
const dataStatus = (row: DataRow) => {
  if (!row.category) return "unclassified";
  return KEPT.has(row.category) && !row.retention ? "undecided" : "classified";
};
const dataRow = (row: DataRow) => ({ ...row, status: dataStatus(row) });

function dataPage(mode: SecurityMode) {
  const rows = dataOf(mode).map(dataRow);
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return page(rows, {
    facets: {
      status: {
        total: rows.length,
        classified: count("classified") + count("undecided"),
        unclassified: count("unclassified"),
        undecided: count("undecided"),
      },
      category: {},
    },
    context: {
      hosting: mode === "empty" ? [] : ["Scaleway, Paris"],
      subprocessors:
        mode === "revise" ? ["Scaleway", "OVHcloud SMS", "Brevo"] : ["Scaleway", "Brevo"],
      transfers: mode === "empty" ? null : "aucun transfert hors de l'Union européenne",
    },
  });
}

function rights(mode: SecurityMode) {
  const written = mode !== "empty";
  const negative = ACTIONS.flatMap(([, , cells]) => cells.filter((cell) => cell !== "y"));
  return {
    roles: written ? ROLES.map(([id, name]) => ({ id, name })) : [],
    actions: written
      ? ACTIONS.map(([id, label, cells]) => ({
          id,
          label,
          cells: cells.map((cell, index) => ({
            role: ROLES[index]?.[0],
            access: cell === "y" ? "yes" : cell === "n" ? "no" : "restricted",
            ...(cell === "y" || cell === "n" ? {} : { restriction: cell }),
          })),
        }))
      : [],
    restrictions: [],
    ownershipRules: written ? OWNERSHIP : [],
    abuseScenarios: written ? negative.length : 0,
    commitSha: written ? SHA : null,
  };
}

function asvs(mode: SecurityMode) {
  const written = mode !== "empty";
  const chapters = ASVS_ROWS.map(([chapter, total, missing, where]) => {
    const count = written ? total : 0;
    const answered = written ? total - (mode === "validated" ? 0 : missing) : 0;
    const status = count === 0 ? "to_check" : answered < count ? "missing" : "covered";
    return { chapter, answered, total: count, where: written ? [where] : [], status };
  });
  const sum = (pick: (row: (typeof chapters)[number]) => number) =>
    chapters.reduce((total, row) => total + pick(row), 0);
  return {
    level: state.level,
    recommendedLevel: 2,
    chosen: state.level !== 2,
    chapters,
    answered: sum((row) => row.answered),
    total: sum((row) => row.total),
    facts: written ? FACTS : [],
    commitSha: written ? SHA : null,
  };
}

const cardsOf = (mode: SecurityMode) => (mode === "empty" ? [] : CARDS);
const summary = (mode: SecurityMode) => ({
  available: mode !== "empty",
  cards: cardsOf(mode),
  commitSha: mode === "empty" ? null : SHA,
  ...(state.contact ? { contact: state.contact } : {}),
});

function clientSummary(mode: SecurityMode, role: string | undefined) {
  if (!isValidated(mode)) return { available: false, validation: "to_validate", cards: [] };
  return {
    available: true,
    validation: "validated",
    cards: CARDS,
    validatedAt: "2026-11-05T10:00:00.000Z",
    ...(state.contact && role !== "business" ? { contact: state.contact } : {}),
  };
}

const READS: Record<string, (url: URL, mode: SecurityMode) => unknown> = {
  threats: threatPage,
  data: (_url, mode) => dataPage(mode),
  "data/registry": () => ({
    filename: "registre-rgpd-atelier-lumiere.md",
    markdown: "# Registre des traitements\n",
  }),
  rights: (_url, mode) => rights(mode),
  asvs: (_url, mode) => asvs(mode),
  summary: (_url, mode) => summary(mode),
};

const READ =
  /^\/projects\/[^/]+\/spec\/security\/(threats|data|data\/registry|rights|asvs|summary)$/;
const THREAT = /^\/projects\/[^/]+\/spec\/security\/threats\/(SEC-T\d+)$/;
const ITEM = /^\/projects\/[^/]+\/spec\/items\/(threat|sensitive)\/([^/]+)$/;
const LEVEL = /^\/projects\/[^/]+\/spec\/security\/asvs\/level$/;
const CLIENT = /^\/client-space\/projects\/[^/]+\/security(\/contact)?$/;
const DOCUMENT = /^\/projects\/[^/]+\/spec\/document\/sections$/;
const BATCHES = /^\/projects\/[^/]+\/spec\/batches$/;
const REVIEWS = /^\/projects\/[^/]+\/reviews$/;
const COMMENTS = /^\/projects\/[^/]+\/comments$/;

function itemOf(mode: SecurityMode, type: string, id: string): Reply {
  const shared = { validated: isValidated(mode), referencedBy: { items: [], total: 0 } };
  if (type === "threat") {
    const found = threatsOf(mode).find((row) => row.id === id);
    if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
    return reply(200, { type, id, values: detailOf(found), ...shared });
  }
  const found = dataOf(mode).find((row) => row.field === id);
  if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
  const values = { ...dataRow(found), filePath: "security/data.yaml", commitSha: SHA };
  return reply(200, { type, id, values, ...shared });
}

function readOf(url: URL, mode: SecurityMode, role: string | undefined): Reply | undefined {
  const read = READ.exec(url.pathname)?.[1];
  if (read) return reply(200, READS[read]?.(url, mode));
  const threat = THREAT.exec(url.pathname)?.[1];
  if (threat) return itemThreat(mode, threat);
  const item = ITEM.exec(url.pathname);
  if (item) return itemOf(mode, item[1] as string, decodeURIComponent(item[2] as string));
  if (CLIENT.test(url.pathname)) return reply(200, clientSummary(mode, role));
  if (DOCUMENT.test(url.pathname) && url.searchParams.get("deliverable") === "security") {
    return reply(200, { sections: mode === "empty" ? [] : SECTIONS, commitSha: SHA });
  }
  return undefined;
}

function itemThreat(mode: SecurityMode, id: string): Reply {
  const found = threatsOf(mode).find((row) => row.id === id);
  if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
  return reply(200, detailOf(found));
}

const body = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk;
    });
    req.on("end", () => resolve(JSON.parse(text || "{}")));
  });

/** Applique l'opération d'un lot d'une page au faux dépôt ; rend l'élément écrit. */
function apply(operation: Record<string, unknown>): string | null {
  const id = String(operation.specId ?? "");
  if (operation.kind === "threat.update") {
    state.threats = state.threats.map((row) => (row.id === id ? { ...row, ...operation } : row));
    return id;
  }
  if (operation.kind === "sensitive.update") {
    state.data = state.data.map((row) => (row.field === id ? { ...row, ...operation } : row));
    return id;
  }
  return null;
}

const batch = (input: Record<string, unknown>, specId: string | null) => ({
  id: BATCH_ID,
  branch: "main",
  status: "committed",
  idempotencyKey: String(input.idempotencyKey),
  baseSha: SHA,
  commitSha: SHA,
  errorCode: null,
  report: null,
  results: specId ? [{ specId }] : [],
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
});

function write(req: IncomingMessage, path: string, send: (reply: Reply) => void): void {
  void body(req).then((input) => {
    journal.push({ path, ...input });
    if (LEVEL.test(path)) {
      state.level = input.level as State["level"];
      send(reply(200, batch(input, null)));
      return;
    }
    if (CLIENT.test(path)) {
      state.contact = { name: String(input.name), phone: String(input.phone) };
      send(reply(200, state.contact));
      return;
    }
    if (COMMENTS.test(path)) {
      send(reply(200, { id: "01900000-0000-7000-8000-000000000117", ...input }));
      return;
    }
    const operations = (input.operations ?? []) as Array<Record<string, unknown>>;
    send(reply(200, batch(input, operations.map(apply)[0] ?? null)));
  });
}

/** Décision du livrable : refusée tant qu'un blocage reste (B804), puis « Validé ». */
function review(req: IncomingMessage, mode: SecurityMode, send: (reply: Reply) => void): void {
  if (req.method === "GET") {
    const decision = {
      id: REVIEW_ID,
      targetKind: "deliverable",
      targetRef: "security",
      sha: SHA,
      status: "approved",
      authorId: REVIEW_ID,
      authorRole: "owner",
      authorName: "Moussa",
      comment: null,
      createdAt: "2026-11-06T10:00:00.000Z",
      current: true,
      onBehalf: false,
    };
    const current = isValidated(mode) || mode === "revise";
    send(reply(200, { items: current ? [decision] : [], nextCursor: null }));
    return;
  }
  void body(req).then(() => {
    const open = threatsOf(mode).some((r) => r.severity === "high" && r.measures.length === 0);
    if (open || dataOf(mode).some((row) => dataStatus(row) !== "classified")) {
      const reason = open ? "threats_open" : "data_unclassified";
      send(
        reply(409, {
          defined: true,
          code: "CONFLICT",
          status: 409,
          message: "Conflict",
          data: { reason },
        }),
      );
      return;
    }
    state.approved = true;
    send(
      reply(200, {
        id: REVIEW_ID,
        status: "approved",
        validation: "validated",
        createdAt: "2026-11-06T10:00:00.000Z",
      }),
    );
  });
}

const isWrite = (path: string): boolean =>
  [LEVEL, CLIENT, BATCHES, COMMENTS].some((route) => route.test(path));

/** Répond aux routes de la page Sécurité ; `false` quand le scénario ne la pilote pas ou pour toute autre route. */
export function handleSpecSecurity(
  req: IncomingMessage,
  url: URL,
  h: { scenario: SecurityScenario & { role?: string }; send: (reply: Reply) => void },
): boolean {
  const mode = h.scenario.security;
  if (!mode) return false;
  if (url.pathname === "/__security-writes") {
    h.send(reply(200, journal));
    return true;
  }
  if (REVIEWS.test(url.pathname)) {
    review(req, mode, h.send);
    return true;
  }
  if (req.method === "POST" && isWrite(url.pathname)) {
    write(req, url.pathname, h.send);
    return true;
  }
  if (req.method !== "GET") return false;
  const answer = readOf(url, mode, h.scenario.role);
  if (!answer) return false;
  h.send(answer);
  return true;
}

/** Statut du livrable pour la coque : « Sécurité à revoir » après un changement de fournisseur SMS. */
export function securityDeliverable(mode: SecurityMode | undefined) {
  if (mode === undefined) return undefined;
  if (isValidated(mode)) return { status: "validated" };
  const status = {
    empty: "todo",
    demo: "pending",
    revise: "revise",
    notValidated: "pending",
    noThreats: "pending",
  }[mode as Exclude<SecurityMode, "validated">];
  const staleSecurity = {
    changes: [{ id: "ST-sms", change: "changed" }],
    items: ["SEC-T02", "SEC-T10"],
  };
  return { status, ...(mode === "revise" ? { staleSecurity } : {}) };
}
