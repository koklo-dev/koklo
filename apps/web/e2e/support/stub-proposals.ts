import type { IncomingMessage } from "node:http";

/**
 * Faux API des propositions de l'agent (TK-99b, contrat 2.9.0) : `ai.proposeOptions`, `ai.proposeDeliverable`,
 * `ai.reviseProposal`, `proposal.list|decide|decideMany`. Le « modèle simulé » des e2e : aucun appel réel, jamais de clé.
 * Piloté par le scénario (`proposals`) ; les appels reçus sont consultables par `/__proposal-calls`.
 *
 * Modes :
 * - `none` (défaut) : options disponibles, aucune proposition ; `Lancer` démarre un lancement qui avance à chaque lecture
 *   (3 propositions à la 2e lecture, 12 à la 4e, puis `done`) ;
 * - `mixed` : 6 propositions de quatre types (fonctionnalités, règle, rôle, parcours) ;
 * - `ready` : 12 propositions à relire, lancement terminé ; `generating` : lancement en cours, rien d'arrivé ; `volume` : 400 propositions sur 16 zones ;
 * - `unavailable` : `available: false` (`no_frozen_idea`) ; `notConfigured` : le lancement répond LLM_NOT_CONFIGURED ;
 * - `inProgress` : le lancement répond 409 PROPOSAL_IN_PROGRESS ; `hostile` : une proposition pleine de HTML et de liens.
 */
export type ProposalsMode =
  | "none"
  | "ready"
  /** Lancement en cours, rien d'arrivé (capture de l'attente) ; ne progresse pas. */
  | "generating"
  | "volume"
  /** TK-103 : 3 fonctionnalités, 1 règle, 1 rôle, 1 parcours à relire (un groupe par type). */
  | "mixed"
  | "unavailable"
  | "notConfigured"
  | "inProgress"
  | "hostile";
export type ProposalsScenario = { proposals?: ProposalsMode };

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

const LAUNCH_ID = "0190aaaa-0000-7000-8000-000000000001";
const HOSTILE =
  '[x](javascript:alert(1)) <a href="https://x">y</a> https://evil.example <img src=x onerror=alert(1)>';

interface Item {
  id: string;
  launchId: string;
  kind: "feature" | "rule" | "role" | "flow";
  zone: string;
  position: number;
  title: string;
  rationale: string;
  content: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected";
  appliedBatchId: null;
  createdAt: string;
}

const criterion = (title: string) => ({
  title,
  steps: [
    { type: "etant_donne", text: "un créneau libre" },
    { type: "quand", text: "la personne réserve" },
    { type: "alors", text: "elle reçoit une confirmation" },
  ],
});

function make(n: number, zones: number, hostile = false): Item {
  const title = hostile ? HOSTILE : `Réserver un créneau ${n}`;
  return {
    id: `0190bbbb-0000-7000-8000-${String(n).padStart(12, "0")}`,
    launchId: LAUNCH_ID,
    kind: "feature",
    zone: `Zone ${(n % zones) + 1}`,
    position: n - 1,
    title,
    rationale: hostile ? HOSTILE : "Le dossier d'idée l'annonce.",
    content: {
      title,
      priority: "must",
      description: hostile ? HOSTILE : `Description de la fonctionnalité ${n}.`,
      criteria: [criterion(hostile ? HOSTILE : "Réservation confirmée")],
    },
    status: "pending",
    appliedBatchId: null,
    createdAt: "2026-11-11T10:00:00.000Z",
  };
}

const DOMAIN: Array<Pick<Item, "kind" | "zone" | "title" | "content">> = [
  {
    kind: "rule",
    zone: "Règles",
    title: "Délai d'annulation",
    content: {
      title: "Délai d'annulation",
      statement: "Une réservation ne peut être annulée qu'à plus de 2 h du rendez-vous.",
      type: "workflow",
      example: "Rendez-vous à 14 h : annulation possible jusqu'à 12 h.",
      states: ["Confirmée", "Honorée", "Annulée"],
      features: ["F-002"],
    },
  },
  {
    kind: "role",
    zone: "Rôles",
    title: "Accueil",
    content: {
      name: "Accueil",
      description: "Gère l'agenda du jour et les réservations au téléphone.",
      permissions: [
        { id: "PM-reservation.creer", restriction: "pour un client" },
        { id: "PM-agenda.lire" },
        { id: "PM-creneau.bloquer" },
      ],
    },
  },
  {
    kind: "flow",
    zone: "Parcours",
    title: "Annuler ou déplacer",
    content: {
      title: "Annuler ou déplacer",
      actor: "Client",
      start: "Lien du SMS",
      steps: ["Annuler ou déplacer", "Confirmation"],
      errors: [{ step: 2, text: "moins de 2 h avant, refus avec le téléphone du salon (R-002)." }],
      features: ["F-002"],
    },
  },
];

function mixed(): Item[] {
  const features = Array.from({ length: 3 }, (_, i) => make(i + 1, 1));
  return [
    ...features,
    ...DOMAIN.map((entry, i) => ({
      ...make(features.length + i + 1, 1),
      ...entry,
      rationale: "Tiré des parcours et des utilisateurs du dossier d'idée.",
    })),
  ];
}

let items: Item[] = [];
let launchStatus: "queued" | "running" | "done" = "done";
let reads = 0;
let started = false;
const journal: Array<Record<string, unknown>> = [];

export function resetProposals(scenario: ProposalsScenario = {}): void {
  const mode = scenario.proposals ?? "none";
  journal.length = 0;
  reads = 0;
  started = false;
  launchStatus = "done";
  items = [];
  if (mode === "ready") items = Array.from({ length: 12 }, (_, i) => make(i + 1, 3));
  if (mode === "mixed") items = mixed();
  if (mode === "generating") {
    started = true;
    launchStatus = "running";
  }
  if (mode === "volume") items = Array.from({ length: 400 }, (_, i) => make(i + 1, 16));
  if (mode === "hostile") items = [make(1, 1, true)];
}

const keyOf = (item: Item): string => `${item.kind}:${item.zone}`;
/** Jusqu'à 30 propositions d'un seul type : un groupe « all » ; avec plusieurs types, un groupe par type. */
const MIXED_FLAT = (): boolean =>
  items.length <= 30 && items.some((item) => item.kind !== "feature");
const groupKeyOf = (item: Item): string => (MIXED_FLAT() ? item.kind : keyOf(item));

const LABELS: Record<string, string> = {
  feature: "Fonctionnalités",
  rule: "Règles",
  role: "Rôles",
  flow: "Parcours",
};

function groups() {
  const flat = items.length <= 30;
  const keys = MIXED_FLAT() || !flat ? [...new Set(items.map(groupKeyOf))] : ["all"];
  return keys.map((key) => {
    const own = flat && !MIXED_FLAT() ? items : items.filter((item) => groupKeyOf(item) === key);
    const count = (status: string) => own.filter((item) => item.status === status).length;
    return {
      key,
      label: MIXED_FLAT()
        ? (LABELS[key] ?? key)
        : flat
          ? "Fonctionnalités"
          : `Fonctionnalités · ${key.split(":")[1]}`,
      total: own.length,
      accepted: count("accepted"),
      rejected: count("rejected"),
      pending: count("pending"),
    };
  });
}

/** Un lancement lancé depuis l'écran avance à chaque lecture : rien, 3 propositions, 12, puis terminé. */
function advance(mode: ProposalsMode): void {
  if (!started || mode !== "none") return;
  reads += 1;
  if (reads >= 2 && items.length < 3) items = Array.from({ length: 3 }, (_, i) => make(i + 1, 1));
  if (reads >= 4 && items.length < 12) {
    items = Array.from({ length: 12 }, (_, i) => make(i + 1, 1));
    launchStatus = "done";
  }
}

function list(query: URLSearchParams, mode: ProposalsMode): Reply {
  advance(mode);
  let own = items;
  const group = query.get("group");
  if (group && group !== "all") own = own.filter((item) => groupKeyOf(item) === group);
  if (query.get("status") === "pending") own = own.filter((item) => item.status === "pending");
  const from = Number(query.get("cursor") ?? 0);
  const limit = Number(query.get("limit") ?? 50);
  const launch =
    started || items.length > 0
      ? { id: LAUNCH_ID, status: launchStatus, proposedCount: items.length, discardedCount: 0 }
      : null;
  return reply(200, {
    items: own.slice(from, from + limit),
    nextCursor: from + limit < own.length ? String(from + limit) : null,
    previousCursor: null,
    offset: from,
    total: own.length,
    groups: groups(),
    launch,
  });
}

function options(mode: ProposalsMode): Reply {
  return reply(200, {
    options: [
      { id: "complete", recommended: true },
      { id: "criteria", count: 3, recommended: false },
      { id: "all", recommended: false },
    ],
    reads: [
      { id: "idea", label: "Dossier d'idée figé" },
      { id: "spec", label: "Cahier fonctionnel actuel" },
    ],
    available: mode !== "unavailable",
    ...(mode === "unavailable" ? { reason: "no_frozen_idea" } : {}),
  });
}

function launch(mode: ProposalsMode): Reply {
  if (mode === "inProgress") return typed(409, "PROPOSAL_IN_PROGRESS", { launchId: LAUNCH_ID });
  if (mode === "notConfigured") return typed(409, "LLM_NOT_CONFIGURED", { reason: "missing" });
  started = true;
  launchStatus = "running";
  return reply(200, { launchId: LAUNCH_ID, status: "queued" });
}

function decide(path: string, body: Record<string, unknown>): Reply {
  if (path.endsWith("/proposals/decisions")) {
    const own = items.filter(
      (item) => groupKeyOf(item) === body.group && item.status === "pending",
    );
    if (own.length !== body.expectedPending) {
      return typed(409, "PROPOSAL_COUNT_CHANGED", {
        expected: body.expectedPending,
        actual: own.length,
      });
    }
    for (const item of own) item.status = "accepted";
    return reply(200, { decided: own.length });
  }
  const id = /\/proposals\/([^/]+)\/decision$/.exec(path)?.[1];
  const found = items.find((item) => item.id === id);
  if (!found) return typed(404, "NOT_FOUND");
  const status = { accept: "accepted", reject: "rejected", reset: "pending" } as const;
  found.status = status[body.decision as keyof typeof status];
  if (body.edited) found.content = body.edited as Record<string, unknown>;
  return reply(200, found);
}

function readBody(req: IncomingMessage, done: (body: Record<string, unknown>) => void): void {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => done(JSON.parse(raw || "{}")));
}

interface Handlers {
  scenario: ProposalsScenario;
  send: Send;
}

const ROUTE =
  /^\/projects\/[^/]+\/(ai\/deliverable\/(options|propose)|ai\/proposals\/[^/]+\/revise|proposals(\/.*)?)$/;

export function handleProposals(req: IncomingMessage, url: URL, h: Handlers): boolean {
  if (url.pathname === "/__proposal-calls") {
    h.send(reply(200, journal));
    return true;
  }
  if (!ROUTE.test(url.pathname)) return false;
  const mode = h.scenario.proposals ?? "none";
  const path = url.pathname;
  if (req.method === "GET") {
    if (path.endsWith("/options")) h.send(options(mode));
    else h.send(list(url.searchParams, mode));
    return true;
  }
  readBody(req, (body) => {
    journal.push({ path: path.replace(/^\/projects\/[^/]+/, ""), ...body });
    if (path.endsWith("/propose")) return h.send(launch(mode));
    if (path.endsWith("/revise")) return h.send(reply(200, items[0]));
    h.send(decide(path, body));
  });
  return true;
}
