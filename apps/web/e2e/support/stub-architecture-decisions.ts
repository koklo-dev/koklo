import type { IncomingMessage } from "node:http";
import {
  type ArchitectureMode,
  componentsOf,
  flowDetail,
  listFlows,
  type Reply,
} from "./stub-spec-architecture.ts";

/**
 * Faux API des décisions et de la validation de l'architecture (TK-113, contrat 3.11.0) : `spec.architecture.adr.list|byId`
 * (23 décisions : 19 acceptées, 3 proposées, 1 remplacée, comme la planche), décision `review.submit|list` du livrable
 * `architecture`, statut et impact amont de `spec.deliverables`, lectures du client (`clientSpace.architecture*`) et
 * commentaires. Pilotage : `archState` (« pending » : à valider, « validated » : déjà validé par Moussa, « revise » :
 * T-avis et F-002 modifiés depuis la décision, API et P-reserver concernés). Aucune donnée réelle.
 */
export type ArchState = "pending" | "validated" | "revise";
export type ArchitectureReviewScenario = { archState?: ArchState };
type Send = (reply: Reply) => void;
type Scenario = ArchitectureReviewScenario & { architecture?: ArchitectureMode };

const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string): Reply =>
  reply(status, { defined: true, code, message: code });

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const DECISION_ID = "01900000-0000-7000-8000-0000000000d2";
let validated = false;
export const archComments: Array<Record<string, unknown>> = [];

export function resetArchitectureReview(scenario: ArchitectureReviewScenario): void {
  validated = scenario.archState === "validated";
  archComments.length = 0;
}

/** Statut et impact amont du livrable Architecture dans `spec.deliverables` ; `undefined` : comportement d'avant TK-113. */
export function architectureDeliverable(
  scenario: ArchitectureReviewScenario,
):
  | { status: string; staleUpstream?: string[]; staleComponents?: string[]; staleFlows?: string[] }
  | undefined {
  if (!scenario.archState) return undefined;
  if (validated) return { status: "validated" };
  return scenario.archState === "revise"
    ? {
        status: "revise",
        staleUpstream: ["F-002", "T-avis"],
        staleComponents: ["C-api", "C-worker"],
        staleFlows: ["P-reserver-un-rendez-vous"],
      }
    : { status: "pending" };
}

interface Adr {
  specId: string;
  title: string;
  status: "acceptee" | "proposee" | "remplacee";
  date: string;
  links: string[];
  supersededBy?: string;
}

const TITLES = [
  "Un seul composant écrit en base",
  "Fournisseur SMS derrière une interface",
  "Application web et API séparées",
  "Rappels envoyés par une file de tâches",
  "Authentification déléguée",
  "Sauvegarde quotidienne chiffrée",
  "Déploiement en continu",
];
const LINKS = [
  ["C-api", "C-db"],
  ["C-worker", "C-sms"],
  ["C-web", "C-api"],
  ["C-queue", "C-worker"],
];

const adrId = (n: number) => `ADR-${String(n).padStart(3, "0")}`;
const ADRS: Adr[] = Array.from({ length: 23 }, (_, index): Adr => {
  const n = index + 1;
  const day = String(((index * 3) % 27) + 1).padStart(2, "0");
  return {
    specId: adrId(n),
    title: `${TITLES[index % TITLES.length]} (${n})`,
    status: n === 4 ? "remplacee" : n >= 21 ? "proposee" : "acceptee",
    date: `2026-${index % 2 ? "10" : "09"}-${day}`,
    links: LINKS[index % LINKS.length] as string[],
    ...(n === 4 ? { supersededBy: adrId(18) } : {}),
  };
}).sort((a, b) => b.date.localeCompare(a.date) || a.specId.localeCompare(b.specId));

const PAGE = 50;

function listAdrs(url: URL): Reply {
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.toLowerCase();
  const component = url.searchParams.get("component");
  const from = url.searchParams.get("from");
  const around = url.searchParams.get("around");
  const items = ADRS.filter(
    (adr) =>
      (!status || adr.status === status) &&
      (!component || adr.links.includes(component)) &&
      (!from || adr.date >= from) &&
      (!q || `${adr.specId} ${adr.title}`.toLowerCase().includes(q)),
  );
  const index = around ? items.findIndex((adr) => adr.specId === around) : 0;
  if (around && index === -1) return typed(404, "NOT_FOUND");
  const facets: Record<string, number> = {};
  for (const adr of ADRS) facets[adr.status] = (facets[adr.status] ?? 0) + 1;
  return reply(200, {
    items: items.slice(0, PAGE).map((adr) => ({
      ...adr,
      filePath: `architecture/adr/${adr.specId}.md`,
    })),
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: items.length,
    facets: { status: facets },
  });
}

const detailOf = (adr: Adr) => ({
  specId: adr.specId,
  title: adr.title,
  status: adr.status,
  date: adr.date,
  deciders: ["Moussa", "Awa"],
  context: "Le portail et le worker doivent s'accorder sur une règle d'écriture unique.",
  decision: "Seule l'API écrit en base ; les autres composants passent par elle.",
  consequences: {
    positive: ["Un seul point de contrôle des règles métier."],
    toAccept: ["L'API devient un passage obligé."],
  },
  alternatives: [{ name: "Écriture depuis chaque composant", reason: "Règles dispersées" }],
  links: adr.links,
  ...(adr.supersededBy ? { supersededBy: adr.supersededBy, supersededOn: "2026-10-29" } : {}),
  plain: "Un seul endroit s'occupe d'enregistrer les données, pour éviter les contradictions.",
  filePath: `architecture/adr/${adr.specId}-decision.md`,
  commitSha: SHA,
});

function adrById(id: string): Reply {
  const adr = ADRS.find((entry) => entry.specId === id);
  return adr ? reply(200, detailOf(adr)) : typed(404, "NOT_FOUND");
}

const ADR_LIST = /^\/projects\/[^/]+\/spec\/architecture\/adr$/;
const ADR_ONE = /^\/projects\/[^/]+\/spec\/architecture\/adr\/([^/]+)$/;
const ADR_ITEM = /^\/projects\/[^/]+\/spec\/items\/adr\/([^/]+)$/;

/** Lectures des décisions de l'équipe (`spec.architecture.adr.*`, `spec.item.get` type `adr`) ; `false` pour toute autre route. */
export function handleArchitectureDecisions(
  req: IncomingMessage,
  url: URL,
  h: { send: Send },
  mode: ArchitectureMode | undefined,
): boolean {
  if (!mode || req.method !== "GET") return false;
  const one = ADR_ONE.exec(url.pathname)?.[1];
  const item = ADR_ITEM.exec(url.pathname)?.[1];
  const answer = ADR_LIST.test(url.pathname)
    ? listAdrs(url)
    : one
      ? adrById(one)
      : item
        ? itemOf(item)
        : undefined;
  if (!answer) return false;
  h.send(answer);
  return true;
}

function itemOf(id: string): Reply {
  const adr = ADRS.find((entry) => entry.specId === id);
  if (!adr) return typed(404, "NOT_FOUND");
  return reply(200, {
    type: "adr",
    id,
    values: detailOf(adr),
    validated,
    referencedBy: { items: [], total: 0 },
  });
}

/** Ce que le client lit d'un composant : phrases simples, libellés, jamais de chemin (contrat 3.11.0). */
const clientComponent = (mode: ArchitectureMode) =>
  componentsOf(mode)
    .slice(0, 100)
    .map((c) => ({
      id: c.specId,
      name: c.name,
      type: c.type,
      zone: c.zone,
      summary: [c.responsibility.split("\n")[0]],
      serves: c.serves.map((id) => ({ id, label: `Fonctionnalité ${id}` })),
      dependsOn: c.dependsOn.map((link) => ({
        id: link.to,
        name: componentsOf(mode).find((other) => other.specId === link.to)?.name ?? link.to,
        via: link.via,
        ...(link.async ? { async: true } : {}),
      })),
    }));

const withClientState = (found: Reply, available: boolean): Reply => {
  const body = JSON.parse(found.body) as Record<string, unknown>;
  return reply(found.status, {
    ...body,
    available,
    validation: available ? "validated" : "to_validate",
  });
};

function clientReads(url: URL, mode: ArchitectureMode, available: boolean): Reply | null {
  const root =
    /^\/client-space\/projects\/[^/]+\/architecture(?:\/(adrs|flows)(?:\/([^/]+))?)?$/.exec(
      url.pathname,
    );
  if (!root) return null;
  const [, kind, id] = root;
  if (!kind) {
    return reply(200, {
      available,
      validation: available ? "validated" : "to_validate",
      truncated: false,
      items: available ? clientComponent(mode) : [],
      positions: {},
    });
  }
  if (!available) return typed(404, "NOT_FOUND");
  if (kind === "adrs" && !id) {
    const found = JSON.parse(listAdrs(url).body) as { items: Adr[] } & Record<string, unknown>;
    return withClientState(
      reply(200, {
        ...found,
        items: found.items.map((adr) => ({
          id: adr.specId,
          title: adr.title,
          status: adr.status,
          date: adr.date,
        })),
      }),
      available,
    );
  }
  if (kind === "adrs") {
    const adr = ADRS.find((entry) => entry.specId === id);
    if (!adr) return typed(404, "NOT_FOUND");
    const { specId, links: _links, filePath: _file, commitSha: _sha, ...rest } = detailOf(adr);
    return reply(200, { id: specId, ...rest });
  }
  return id ? flowDetail(mode, id) : withClientState(listFlows(url, mode), available);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const decision = (projectId: string) => ({
  id: DECISION_ID,
  targetKind: "deliverable",
  targetRef: "architecture",
  sha: "8f2d41c".padEnd(40, "0"),
  status: "approved",
  authorId: "01900000-0000-7000-8000-0000000000a1",
  authorName: "Moussa",
  authorRole: "owner",
  comment: null,
  createdAt: "2026-11-05T10:00:00.000Z",
  current: true,
  withoutClient: false,
  projectId,
});

type Handlers = { scenario: Scenario; send: Send };

function handleReviews(req: IncomingMessage, projectId: string, h: Handlers): boolean {
  if (req.method === "GET") {
    h.send(reply(200, { items: validated ? [decision(projectId)] : [], nextCursor: null }));
    return true;
  }
  if (req.method !== "POST") return false;
  void body(req).then(() => {
    validated = true;
    h.send(
      reply(200, {
        id: DECISION_ID,
        status: "approved",
        validation: "validated",
        createdAt: "2026-11-05T10:00:00.000Z",
      }),
    );
  });
  return true;
}

function handleComment(req: IncomingMessage, h: Handlers): boolean {
  if (req.method === "GET") {
    h.send(reply(200, { items: [], nextCursor: null }));
    return true;
  }
  if (req.method !== "POST") return false;
  void body(req).then((input) => {
    archComments.push(input);
    h.send(reply(200, { id: "01900000-0000-7000-8000-0000000000e9", ...input }));
  });
  return true;
}

/** Décision du livrable, lectures du client et commentaires ; `false` quand le scénario ne pilote pas l'architecture. */
export function handleArchitectureReview(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (!h.scenario.archState) return false;
  if (url.pathname === "/__arch-comments") {
    h.send(reply(200, archComments));
    return true;
  }
  const mode = h.scenario.architecture ?? "demo";
  if (req.method === "GET") {
    const found = clientReads(url, mode, h.scenario.archState === "validated");
    if (found) {
      h.send(found);
      return true;
    }
  }
  const match = /^\/projects\/([^/]+)\/(reviews|comments)$/.exec(url.pathname);
  if (!match) return false;
  return match[2] === "comments" ? handleComment(req, h) : handleReviews(req, match[1] ?? "", h);
}
