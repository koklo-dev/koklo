import type { IncomingMessage } from "node:http";

/**
 * Faux API de la vue client (TK-104, contrat 3.2.0) : `clientSpace.*`, `review.submit|list|remind`, sans Postgres.
 * Piloté par le scénario :
 * - `clientSpace` : `ready` (défaut), `changed` (2 éléments ont changé depuis la validation), `empty` (rien à valider),
 *   `large` (248 fonctionnalités), `refused` (« Valider le cahier » est refusé par le serveur) ;
 * - `hasClient` (défaut vrai) : un client est invité ; sinon l'équipe valide (D1).
 * Le rôle de la personne (`role`) décide de `canValidate` : client, ou propriétaire sans client.
 * Les décisions reçues se lisent à `/__client-calls`, dans l'ordre. Aucune donnée réelle.
 */
export type ClientSpaceMode = "ready" | "changed" | "empty" | "large" | "refused";
export type ClientSpaceScenario = { clientSpace?: ClientSpaceMode; hasClient?: boolean };

type Reply = { status: number; body: string };
type Send = (reply: Reply) => void;
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const typed = (status: number, code: string, data?: unknown): Reply =>
  reply(status, { defined: true, code, message: code, ...(data === undefined ? {} : { data }) });

type Validation = "validated" | "to_validate" | "to_revise";
const pad = (n: number) => String(n).padStart(3, "0");

const FEATURES = [
  ["Réserver un créneau en ligne", "must", ["R-001", "R-002", "P-reserver"]],
  ["Rappel par SMS avant le rendez-vous", "should", ["R-003"]],
  ["Annuler ou déplacer une réservation", "must", ["R-002", "P-annuler"]],
  ["Liste d'attente", "could", []],
  ["Paiement d'un acompte", "should", ["R-004"]],
  ["Agenda du jour pour l'accueil", "must", ["RL-accueil"]],
  ["Gestion des services et des prix", "could", ["S-services"]],
] as const;

const LABELS: Record<string, string> = {
  "R-001": "Pas de double réservation",
  "R-002": "Délai d'annulation",
  "R-003": "Heure du rappel",
  "R-004": "Cycle d'une réservation",
  "P-reserver": "Réserver",
  "P-annuler": "Annuler",
  "RL-accueil": "Accueil",
  "S-services": "Écran services",
};

const count = (mode: ClientSpaceMode) => (mode === "empty" ? 0 : mode === "large" ? 248 : 7);
const featureOf = (n: number) => {
  const base = FEATURES[(n - 1) % FEATURES.length] as (typeof FEATURES)[number];
  return {
    id: `F-${pad(n)}`,
    title: n <= 7 ? base[0] : `${base[0]} (${n})`,
    priority: base[1],
    links: base[2],
  };
};

const FLOWS = [
  ["P-reserver", "Réserver un rendez-vous", "Client"],
  ["P-annuler", "Annuler un rendez-vous", "Client"],
  ["P-agenda", "Consulter l'agenda du jour", "Accueil"],
] as const;
const RULES = [
  [
    "R-001",
    "Pas de double réservation",
    "contrainte",
    "Un créneau ne peut porter qu'une réservation à la fois.",
  ],
  [
    "R-002",
    "Délai d'annulation",
    "contrainte",
    "Une réservation s'annule jusqu'à 2 h avant le rendez-vous.",
  ],
  ["R-003", "Heure du rappel", "calcul", "Le rappel part 24 h avant le rendez-vous."],
  [
    "R-004",
    "Cycle d'une réservation",
    "workflow",
    "Une réservation passe de demandée à confirmée, puis à terminée.",
  ],
] as const;
const ROLES = [
  ["RL-client", "Client", "Réserve sans compte, identifié par son téléphone."],
  ["RL-accueil", "Accueil", "Gère l'agenda du jour et les réservations."],
  ["RL-gerant", "Gérant", "Gère les services, les prix et le personnel."],
] as const;

const decisions = new Map<string, Validation>();
const calls: Array<Record<string, unknown>> = [];
let reminded = false;
let deliverable: Validation = "to_validate";

export function resetClientSpace(): void {
  decisions.clear();
  calls.length = 0;
  reminded = false;
  deliverable = "to_validate";
}

const stateOf = (key: string): Validation => decisions.get(key) ?? "to_validate";

const treated = (key: string) => decisions.has(key);

function featureKeys(mode: ClientSpaceMode): string[] {
  return Array.from({ length: count(mode) }, (_, i) => `feature:F-${pad(i + 1)}`);
}

function progress(mode: ClientSpaceMode, role: string | undefined, hasClient: boolean) {
  const keys = featureKeys(mode);
  const flows = FLOWS.map(([id]) => `flow:${id}`);
  const blocks = ["rules:rules", "roles:roles"];
  const all = [...keys, ...flows, ...blocks];
  const done = (list: string[]) => list.filter(treated).length;
  const revise = (list: string[]) => list.filter((k) => decisions.get(k) === "to_revise").length;
  const tab = (list: string[], shown: number) => ({
    count: shown,
    units: list.length,
    treated: done(list),
    toRevise: revise(list),
  });
  const first = all.find((k) => !treated(k));
  const canValidate = role === "client" || (!hasClient && (role === "owner" || role === "admin"));
  return {
    hasClient,
    canValidate,
    clientFirstName: hasClient ? "Marie" : null,
    validation: deliverable,
    tabs: {
      features: tab(keys, keys.length),
      flows: tab(flows, FLOWS.length),
      rules: tab(["rules:rules"], RULES.length),
      roles: tab(["roles:roles"], ROLES.length),
    },
    untreated: all.filter((k) => !treated(k)).length,
    toRevise: revise(all),
    changed: mode === "changed" ? 2 : 0,
    next: first ? { kind: first.split(":")[0], ref: first.split(":")[1] } : null,
    version: "v1",
  };
}

function featuresPage(mode: ClientSpaceMode, url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const untreated = url.searchParams.get("untreated") === "true";
  const ids = featureKeys(mode)
    .map((k) => k.split(":")[1] as string)
    .filter((id) => !untreated || !treated(`feature:${id}`));
  const around = url.searchParams.get("around");
  const aroundAt = around ? ids.indexOf(around) : -1;
  const offset = url.searchParams.has("cursor")
    ? Number(url.searchParams.get("cursor"))
    : aroundAt >= 0
      ? Math.floor(aroundAt / limit) * limit
      : 0;
  const items = ids.slice(offset, offset + limit).map((id) => {
    const feature = featureOf(Number(id.slice(2)));
    return {
      id,
      title: feature.title,
      priority: feature.priority,
      criteriaCount: 2,
      validation: stateOf(`feature:${id}`),
      previouslyValidated: false,
      openSuggestions: 0,
    };
  });
  const end = offset + limit;
  return {
    items,
    version: "v1",
    nextCursor: end < ids.length ? String(end) : null,
    total: ids.length,
    offset,
  };
}

function featureDetail(id: string) {
  const feature = featureOf(Number(id.slice(2)));
  return {
    id,
    title: feature.title,
    description: "Le client choisit un service, un créneau libre et confirme sa réservation.",
    priority: feature.priority,
    criteria: [
      {
        id: "AC-1",
        title: "Créneau libre",
        steps: [
          { type: "etant_donne", text: "un service de 30 minutes" },
          { type: "quand", text: "le client choisit un créneau libre" },
          { type: "alors", text: "la réservation est confirmée" },
        ],
      },
      {
        id: "AC-2",
        title: "Créneau pris",
        steps: [
          { type: "etant_donne", text: "un créneau déjà réservé" },
          { type: "quand", text: "le client le choisit" },
          { type: "alors", text: "un autre créneau lui est proposé" },
        ],
      },
    ],
    validation: stateOf(`feature:${id}`),
    previouslyValidated: false,
    links: feature.links.map((link) => ({ id: link, label: LABELS[link] ?? link })),
    versionNote: { date: "2026-11-04", label: "a1b2c3d" },
    version: "v1",
  };
}

const step = (label: string, screen?: string) => (screen ? { label, screen } : { label });
const list = <T>(items: T[], extra: Record<string, unknown>) => ({
  items,
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: items.length,
  ...extra,
});

function flowsPage() {
  const items = FLOWS.map(([id, title, actor]) => ({
    id,
    title,
    actor,
    start: step("Accueil du portail", "S-accueil"),
    steps: [step("Choisir un service", "S-services"), step("Confirmation", "S-confirmation")],
    errors: [{ step: 2, text: "Si le créneau vient d'être pris, un autre est proposé." }],
    features: ["F-001"],
    validation: stateOf(`flow:${id}`),
    previouslyValidated: false,
  }));
  return list(items, { version: "v1" });
}

function rulesPage() {
  const items = RULES.map(([id, title, type, statement]) => ({
    id,
    title,
    type,
    statement,
    states: type === "workflow" ? ["Demandée", "Confirmée", "Terminée"] : [],
    features: ["F-001"],
  }));
  return list(items, {
    validation: stateOf("rules:rules"),
    previouslyValidated: false,
    version: "v1",
  });
}

const rolesOut = () => ({
  roles: ROLES.map(([id, name, description]) => ({ id, name, description })),
  actions: [
    [
      "PM-reservation.creer",
      "Réserver un créneau",
      "Réservation",
      ["allowed", "allowed", "allowed"],
    ],
    ["PM-agenda.lire", "Voir l'agenda du jour", "Agenda", ["denied", "allowed", "allowed"]],
    [
      "PM-service.gerer",
      "Gérer les services et les prix",
      "Catalogue",
      ["denied", "denied", "allowed"],
    ],
  ].map(([specId, label, resource, levels]) => ({
    specId,
    label,
    resource,
    access: (levels as string[]).map((level, i) => ({
      roleId: (ROLES[i] as (typeof ROLES)[number])[0],
      level,
    })),
  })),
  validation: stateOf("roles:roles"),
  previouslyValidated: false,
  version: "v1",
});

function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

type Ctx = { mode: ClientSpaceMode; role: string | undefined; hasClient: boolean; send: Send };

async function submit(req: IncomingMessage, { mode, role, hasClient, send }: Ctx): Promise<void> {
  const input = await body(req);
  calls.push(input);
  const key = `${input.targetKind}:${input.targetRef}`;
  const status = input.status as string;
  if (input.targetKind === "deliverable") {
    const open = progress(mode, role, hasClient).untreated > 0;
    if (mode === "refused" || open)
      return send(typed(409, "CONFLICT", { reason: "review_incomplete" }));
    deliverable = status === "approved" ? "validated" : "to_revise";
  } else if (status === "withdrawn") decisions.delete(key);
  else decisions.set(key, status === "approved" ? "validated" : "to_revise");
  send(
    reply(200, {
      id: "01900000-0000-7000-8000-0000000000c1",
      status,
      validation: decisions.get(key) ?? "to_validate",
      createdAt: "2026-11-12T10:00:00.000Z",
    }),
  );
}

function reads(url: URL, ctx: Ctx): boolean {
  const read =
    /^\/client-space\/projects\/[^/]+\/(progress|features|flows|rules|roles)(?:\/(F-\d+))?$/.exec(
      url.pathname,
    );
  if (!read) return false;
  const [, resource, id] = read;
  const { mode, role, hasClient, send } = ctx;
  const out: Record<string, () => unknown> = {
    progress: () => progress(mode, role, hasClient),
    features: () => (id ? featureDetail(id) : featuresPage(mode, url)),
    flows: flowsPage,
    rules: rulesPage,
    roles: rolesOut,
  };
  send(reply(200, (out[resource as string] as () => unknown)()));
  return true;
}

const REQUEST_COMMENT = "On voudrait pouvoir déplacer jusqu'à 1 h avant, pas 2 h.";

function reviewList(url: URL, send: Send): void {
  const requested = [...decisions.values()].includes("to_revise");
  const item = {
    id: "01900000-0000-7000-8000-0000000000c2",
    targetKind: "feature",
    targetRef: url.searchParams.get("targetRef"),
    sha: null,
    status: "changes_requested",
    authorId: "01900000-0000-7000-8000-0000000000c3",
    authorRole: "client",
    comment: REQUEST_COMMENT,
    createdAt: "2026-11-12T10:00:00.000Z",
    current: true,
    onBehalf: false,
  };
  send(reply(200, { items: requested ? [item] : [], nextCursor: null }));
}

/** Répond aux lectures et décisions de la vue client ; `false` pour toute autre route. */
export async function handleClientSpace(
  req: IncomingMessage,
  url: URL,
  h: { scenario: ClientSpaceScenario & { role?: string }; send: Send },
): Promise<boolean> {
  const path = url.pathname;
  if (path === "/__client-calls") {
    h.send(reply(200, calls));
    return true;
  }
  const ctx: Ctx = {
    mode: h.scenario.clientSpace ?? "ready",
    role: h.scenario.role,
    hasClient: h.scenario.hasClient !== false,
    send: h.send,
  };
  if (req.method === "GET" && reads(url, ctx)) return true;
  if (!/^\/projects\/[^/]+\/reviews/.test(path)) return false;
  if (path.endsWith("/reminders") && req.method === "POST") {
    calls.push({ remind: true });
    h.send(reply(200, { reminded: reminded ? 0 : 1 }));
    reminded = true;
  } else if (req.method === "POST") await submit(req, ctx);
  else reviewList(url, h.send);
  return true;
}
