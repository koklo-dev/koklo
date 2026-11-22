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
  /** TK-107 : 4 tables, une proposition de relations et un jeu d'exemple à relire (Données). */
  | "data"
  /** TK-110 : 67 propositions des Données (60 tables sur 6 zones, relations, jeux) : groupes par zone et « Relations et jeux d'exemple ». */
  | "dataVolume"
  /** TK-111 : 9 propositions de l'architecture (composants, flux, décisions, section du document), un groupe par type. */
  | "architecture"
  /** TK-111 : 66 propositions de l'architecture (au-delà de 30 : relecture groupée par type). */
  | "architectureVolume"
  /** TK-114b : génération de l'architecture avec le bilan en cours (« Zones traitées 4/9 · … »). */
  | "architectureGeneratingReport"
  /** TK-114b : les 9 propositions de l'architecture, bilan terminé ; `architectureDeadline` : arrêté au délai. */
  | "architectureReport"
  | "architectureDeadline"
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
  kind:
    | "feature"
    | "rule"
    | "role"
    | "flow"
    | "table"
    | "relations"
    | "fixtures"
    | "component"
    | "archflow"
    | "adr"
    | "doc_section";
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

const table = (
  n: number,
  name: string,
  zone: string,
  sources: string[],
  fields: Array<Record<string, unknown>>,
): Item => ({
  ...make(n, 1),
  kind: "table",
  zone,
  title: name,
  rationale: `Déduite de ${sources.join(", ")}.`,
  content: { name, sources, fields },
});

const ID_FIELD = { name: "id", type: "uuid", primaryKey: true };

/** Six tables proposées, celles de la maquette 11 (l.571-582) : nom, zone, justifications, champs. */
const TABLES: Array<[string, string, string[], Array<Record<string, unknown>>]> = [
  [
    "Client",
    "Clients et fidélité",
    ["F-001", "F-003"],
    [
      ID_FIELD,
      { name: "nom", type: "texte(100)", constraints: "obligatoire", personalData: true },
      { name: "telephone", type: "texte(20)", constraints: "unique", personalData: true },
    ],
  ],
  [
    "Réservation",
    "Prise de rendez-vous",
    ["F-001", "F-002"],
    [
      ID_FIELD,
      { name: "client_id", type: "ref(T-client)" },
      { name: "statut", type: "enum", values: ["confirmee", "honoree", "annulee"] },
    ],
  ],
  [
    "Service",
    "Catalogue et stock",
    ["F-004"],
    [ID_FIELD, { name: "nom", type: "texte(80)" }, { name: "prix", type: "decimal" }],
  ],
  [
    "Créneau",
    "Prise de rendez-vous",
    ["F-001", "F-006"],
    [
      ID_FIELD,
      { name: "employe_id", type: "ref(T-employe)" },
      { name: "debut", type: "horodatage" },
    ],
  ],
  [
    "Employé",
    "Personnel",
    ["F-006"],
    [
      ID_FIELD,
      { name: "nom", type: "texte(100)", personalData: true },
      { name: "actif", type: "booleen" },
    ],
  ],
  [
    "Rappel SMS",
    "Communication",
    ["F-003", "R-003"],
    [
      ID_FIELD,
      { name: "reservation_id", type: "ref(T-reservation)" },
      { name: "envoye_le", type: "horodatage" },
    ],
  ],
];

const dataTables = (): Item[] =>
  TABLES.map(([name, zone, sources, fields], index) =>
    table(index + 1, name, zone, sources, fields),
  );

const DATA_RELATIONS = [
  { from: "T-reservation", to: "T-client", cardinality: "n → 1" },
  { from: "T-rappel-sms", to: "T-reservation", cardinality: "n → 1" },
];
const DATA_ROWS = [
  { nom: "Léa Martin", telephone: "+33 6 12 34 56 78" },
  { nom: "Karim Haddad", telephone: "+33 7 98 76 54 32" },
];

/** Données proposées : quatre tables, les relations et un jeu d'exemple. */
function dataItems(): Item[] {
  return [
    ...dataTables(),
    {
      ...make(7, 1),
      kind: "relations",
      zone: "",
      title: "Relations",
      rationale: "Déduites des clés étrangères proposées.",
      content: { relations: DATA_RELATIONS },
    },
    {
      ...make(8, 1),
      kind: "fixtures",
      zone: "",
      title: "Clients",
      rationale: "Pour alimenter les maquettes et les tests.",
      content: { title: "Clients", table: "T-client", locale: "fr-FR", rows: DATA_ROWS },
    },
  ];
}

const VOLUME_ZONES = [
  "Prise de rendez-vous",
  "Clients et fidélité",
  "Catalogue et stock",
  "Paiements",
  "Personnel",
  "Communication",
];

/** 60 tables sur 6 zones, une proposition de relations, six jeux d'exemple : 67 propositions (au-delà de 30 : groupes). */
function dataVolumeItems(): Item[] {
  const tables = Array.from({ length: 60 }, (_, i) =>
    table(
      i + 1,
      `Table ${String(i + 1).padStart(3, "0")}`,
      VOLUME_ZONES[i % VOLUME_ZONES.length] as string,
      ["F-001"],
      [ID_FIELD, { name: "nom", type: "texte(80)" }],
    ),
  );
  const links: Item[] = [
    {
      ...(dataItems()[6] as Item),
      id: `0190bbbb-0000-7000-8000-${"1".padStart(12, "9")}`,
      position: 60,
    },
    ...Array.from({ length: 6 }, (_, i) => ({
      ...(dataItems()[7] as Item),
      id: `0190bbbb-0000-7000-8000-${String(i + 1).padStart(12, "8")}`,
      position: 61 + i,
      title: `Jeu ${i + 1}`,
    })),
  ];
  return [...tables, ...links];
}

const component = (
  n: number,
  name: string,
  type: string,
  zone: string,
  responsibility: string,
  dependsOn: Array<{ to: string; via: string }> = [],
): Item => ({
  ...make(n, 1),
  kind: "component",
  zone,
  title: name,
  rationale: "Déduit de la zone du modèle de données et des parcours.",
  content: { name, type, zone, responsibility, owns: [], dependsOn },
});

/** Section, flux et décisions proposés (maquette 13 l.644-661), hors composants. */
const architectureDocument = (): Item => ({
  ...make(1, 1),
  kind: "doc_section",
  zone: "",
  title: "Observabilité",
  rationale: "NFR-005 demande une alerte en moins de 5 min, aucune section ne la décrit.",
  content: {
    title: "Observabilité",
    markdown: "Une alerte part en moins de 5 minutes quand le service ne répond plus.",
  },
});

const flow = (n: number, title: string, id: string, messages: unknown[]): Item => ({
  ...make(n, 1),
  kind: "archflow",
  zone: "",
  title,
  rationale: `Tiré du parcours ${id}.`,
  content: { flow: id, participants: ["C-web", "C-api"], messages },
});

const decision = (n: number, title: string, context: string, choice: string, other: string[]) => ({
  ...make(n, 1),
  kind: "adr" as const,
  zone: "",
  title,
  rationale: `Proposée pour répondre à : ${context.toLowerCase()}`,
  content: {
    title,
    context,
    decision: choice,
    alternatives: [{ name: other[0], reason: other[1] }],
  },
});

/** Neuf propositions de l'architecture : une section, quatre composants, deux flux, deux décisions. */
function architectureItems(): Item[] {
  return [
    architectureDocument(),
    component(
      2,
      "Passerelle SMS",
      "service",
      "Communication",
      "Isole l'envoi des SMS derrière une interface remplaçable.",
      [{ to: "C-sms", via: "HTTPS" }],
    ),
    component(3, "Cache", "store", "Prise de rendez-vous", "Garde les créneaux libres en mémoire."),
    component(4, "Moteur de PDF", "service", "Paiement et caisse", "Génère les reçus en PDF."),
    component(5, "Notifications", "queue", "Communication", "File des notifications à envoyer."),
    flow(6, "Réserver un rendez-vous", "P-reserver", [
      { from: "C-web", to: "C-api", text: "réserve un créneau" },
      { from: "C-api", to: "C-web", text: "confirme la réservation" },
    ]),
    flow(7, "Annuler ou déplacer", "P-annuler", [
      { from: "C-web", to: "C-api", text: "annule la réservation" },
    ]),
    decision(
      8,
      "PostgreSQL plutôt que MongoDB",
      "Les données sont fortement relationnelles.",
      "Une base relationnelle unique, PostgreSQL.",
      ["MongoDB", "Pas de jointures ni de transactions simples."],
    ),
    decision(
      9,
      "Brevo plutôt que Twilio",
      "Le choix du fournisseur de SMS.",
      "Brevo : SMS et e-mail chez le même prestataire, données en UE.",
      ["Twilio", "Données hors UE par défaut."],
    ),
  ];
}

/** TK-114d (B655, B659) : reprise d'un flux indexé, passée par l'application d'entrée du rôle (`specId` posé par le code). */
const reprise = (): Item => ({
  ...flow(10, "Annuler ou déplacer", "P-annuler", [
    { from: "RL-client", to: "C-web", text: "annule la réservation" },
    { from: "C-web", to: "C-api", text: "annule la réservation", reply: "annulée" },
  ]),
  zone: "Flux techniques",
  rationale: "Flux repris pour passer par l'application d'entrée.",
  content: {
    specId: "P-annuler",
    flow: "P-annuler",
    participants: ["RL-client", "C-web", "C-api"],
    messages: [
      { from: "RL-client", to: "C-web", text: "annule la réservation" },
      { from: "C-web", to: "C-api", text: "annule la réservation", reply: "annulée" },
    ],
  },
});

/** 66 propositions : 1 section, 40 composants, 15 flux, 10 décisions (au-delà de 30 : un groupe par type). */
function architectureVolumeItems(): Item[] {
  const base = architectureItems();
  const components = Array.from({ length: 40 }, (_, i) =>
    component(
      10 + i,
      `Composant proposé ${String(i + 1).padStart(2, "0")}`,
      ["service", "app", "store", "queue", "ext"][i % 5] as string,
      VOLUME_ZONES[i % VOLUME_ZONES.length] as string,
      `Responsabilité du composant proposé ${i + 1}.`,
    ),
  );
  const flows = Array.from({ length: 15 }, (_, i) => ({
    ...(base[5] as Item),
    id: `0190bbbb-0000-7000-8000-${String(100 + i).padStart(12, "0")}`,
    position: 60 + i,
    title: `Flux ${i + 1}`,
    content: { ...(base[5] as Item).content, flow: `P-parcours-${i + 1}` },
  }));
  const adrs = Array.from({ length: 10 }, (_, i) => ({
    ...(base[7] as Item),
    id: `0190bbbb-0000-7000-8000-${String(200 + i).padStart(12, "0")}`,
    position: 80 + i,
    title: `Décision ${i + 1}`,
  }));
  return [base[0] as Item, ...components, ...flows, ...adrs];
}

let items: Item[] = [];
let architectureMode: ProposalsMode | undefined;
let volumeData = false;
let launchStatus: "queued" | "running" | "done" | "failed" = "done";
let report: Record<string, unknown> | undefined;

const cover = (covered: number, total: number) => ({ covered, total });
const BEFORE = {
  features: cover(0, 174),
  flows: cover(0, 22),
  tables: cover(0, 48),
  roles: cover(0, 5),
  reprises: cover(0, 22),
};
/**
 * Bilans du lancement de l'Architecture (contrat 3.12.0, TK-114b ; rôles et reprises 3.14.0, TK-114d) : que des nombres
 * et des motifs fermés.
 */
const REPORTS: Partial<Record<ProposalsMode, Record<string, unknown>>> = {
  architectureGeneratingReport: {
    zonesRequested: 9,
    zonesDone: 2,
    zonesDiscarded: 2,
    discardReasons: [{ reason: "truncated", count: 2 }],
    coverageBefore: BEFORE,
    coverageAfter: {
      features: cover(38, 174),
      flows: cover(2, 22),
      tables: cover(10, 48),
      roles: cover(3, 5),
      reprises: cover(10, 22),
    },
    coverageCalls: 0,
  },
  architectureReport: {
    zonesRequested: 9,
    zonesDone: 7,
    zonesDiscarded: 2,
    discardReasons: [
      { reason: "truncated", count: 1 },
      { reason: "output_invalid", count: 1 },
    ],
    coverageBefore: BEFORE,
    coverageAfter: {
      features: cover(174, 174),
      flows: cover(22, 22),
      tables: cover(48, 48),
      roles: cover(5, 5),
      reprises: cover(22, 22),
    },
    coverageCalls: 12,
    stopReason: "completed",
  },
  architectureDeadline: {
    zonesRequested: 9,
    zonesDone: 9,
    zonesDiscarded: 0,
    discardReasons: [],
    coverageBefore: BEFORE,
    coverageAfter: {
      features: cover(151, 174),
      flows: cover(19, 22),
      tables: cover(48, 48),
      roles: cover(4, 5),
      reprises: {
        ...cover(16, 22),
        skipped: [
          { reason: "too_long", count: 1 },
          { reason: "no_entry_app", count: 2 },
          { reason: "cap", count: 3 },
        ],
      },
    },
    coverageCalls: 18,
    stopReason: "deadline",
  },
};
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
  volumeData = mode === "dataVolume";
  report = REPORTS[mode];
  architectureMode =
    mode === "architecture" || mode === "architectureVolume" || report ? mode : undefined;
  if (mode === "ready") items = Array.from({ length: 12 }, (_, i) => make(i + 1, 3));
  if (mode === "mixed") items = mixed();
  if (mode === "data") items = dataItems();
  if (mode === "dataVolume") items = dataVolumeItems();
  if (mode === "architecture") items = architectureItems();
  if (mode === "architectureReport") items = [...architectureItems(), reprise()];
  if (mode === "architectureDeadline") {
    items = architectureItems();
    launchStatus = "failed";
  }
  if (mode === "architectureVolume") items = architectureVolumeItems();
  if (mode === "generating" || mode === "architectureGeneratingReport") {
    started = true;
    launchStatus = "running";
  }
  if (mode === "volume") items = Array.from({ length: 400 }, (_, i) => make(i + 1, 16));
  if (mode === "hostile") items = [make(1, 1, true)];
}

/** Livrable Données au-delà de 30 propositions : relations et jeux dans le groupe `links` (comme le serveur, B487). */
const keyOf = (item: Item): string =>
  architectureMode
    ? item.kind
    : volumeData && (item.kind === "relations" || item.kind === "fixtures")
      ? "links"
      : `${item.kind}:${item.zone}`;
/** Jusqu'à 30 propositions d'un seul type : un groupe « all » ; avec plusieurs types, un groupe par type. */
const MIXED_FLAT = (): boolean =>
  !architectureMode && items.length <= 30 && items.some((item) => item.kind !== "feature");
const groupKeyOf = (item: Item): string => (MIXED_FLAT() ? item.kind : keyOf(item));

const LABELS: Record<string, string> = {
  feature: "Fonctionnalités",
  rule: "Règles",
  role: "Rôles",
  flow: "Parcours",
  table: "Tables",
  relations: "Relations",
  fixtures: "Jeux d'exemple",
  doc_section: "Document · vue d'ensemble",
  component: "Composants",
  archflow: "Flux",
  adr: "Décisions",
};

/** Libellé d'un groupe : relecture groupée des Données (TK-110), types à plat, ou fonctionnalités par zone. */
function labelOf(key: string, flat: boolean): string {
  if (architectureMode) return LABELS[key] ?? key;
  if (volumeData)
    return key === "links" ? "Relations et jeux d'exemple" : `Zone ${key.split(":")[1]}`;
  if (MIXED_FLAT()) return LABELS[key] ?? key;
  return flat ? "Fonctionnalités" : `Fonctionnalités · ${key.split(":")[1]}`;
}

const ARCHITECTURE_ORDER = ["doc_section", "component", "archflow", "adr"];

function groups() {
  const flat = items.length <= 30;
  const keys = architectureMode
    ? ARCHITECTURE_ORDER.filter((key) => items.some((item) => item.kind === key))
    : MIXED_FLAT() || !flat
      ? [...new Set(items.map(groupKeyOf))]
      : ["all"];
  return keys.map((key) => {
    const own =
      flat && !MIXED_FLAT() && !architectureMode
        ? items
        : items.filter((item) => groupKeyOf(item) === key);
    const count = (status: string) => own.filter((item) => item.status === status).length;
    return {
      key,
      label: labelOf(key, flat),
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
      ? {
          id: LAUNCH_ID,
          status: launchStatus,
          proposedCount: items.length,
          discardedCount: 0,
          ...(report ? { report } : {}),
        }
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

function options(mode: ProposalsMode, deliverable: string | null): Reply {
  if (deliverable === "architecture") {
    return reply(200, {
      options: [
        { id: "complete", recommended: true },
        { id: "decision", recommended: false },
        { id: "document", count: 1, recommended: false },
        { id: "all", recommended: false },
      ],
      reads: [
        { id: "functional.features", label: "Fonctionnel" },
        { id: "data.tables", label: "Données" },
        { id: "nfr.known", label: "Exigences connues" },
      ],
      available: true,
    });
  }
  if (deliverable === "data") {
    return reply(200, {
      options: [
        { id: "complete", recommended: true },
        { id: "all", recommended: false },
      ],
      reads: [
        { id: "functional.features", label: "Cahier fonctionnel" },
        { id: "functional.rules", label: "Règles" },
        { id: "functional.roles", label: "Rôles" },
        { id: "functional.flows", label: "Parcours" },
        { id: "data.current", label: "Modèle actuel" },
      ],
      available: true,
    });
  }
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
    if (path.endsWith("/options")) h.send(options(mode, url.searchParams.get("deliverable")));
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
