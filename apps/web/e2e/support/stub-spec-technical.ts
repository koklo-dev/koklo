import type { IncomingMessage } from "node:http";
import {
  apiItemRead,
  clientApiRead,
  teamApiRead,
  technicalApiCounts,
} from "./stub-spec-technical-api.ts";

/**
 * Faux API de la page Technique (TK-115, TK-116, contrat 3.18.0) : `spec.technical.*`, `spec.document.sections`,
 * `spec.item.get`, `clientSpace.technical*`, commentaires, lot de « Choisir » et décision `review.submit|list`. Les données
 * sont celles de la maquette 14 (volume réel : 24 choix dont 2 à trancher). Scénario `technical` : « empty » (état
 * Prêt), « demo », « revise » (à revoir), « validated » (validé), « notValidated » (vue client avant validation).
 */
export type TechnicalMode = "empty" | "demo" | "revise" | "validated" | "notValidated";
export type TechnicalScenario = { technical?: TechnicalMode };

type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const BATCH_ID = "0190cccc-0000-7000-8000-000000000115";

type Layer = "applications" | "services" | "data" | "external" | "operations";
const LAYERS: Layer[] = ["applications", "services", "data", "external", "operations"];

interface Criterion {
  label: string;
  estimate?: boolean;
  values: string[];
}
interface Choice {
  specId: string;
  role: string;
  layer: Layer;
  icon: string;
  status: "chosen" | "open";
  choice?: string;
  recommended?: string;
  components: string[];
  options: string[];
  criteria: Criterion[];
  why: string;
  plain?: string;
  requirements: string[];
  decisions: string[];
  filePath: string;
}

type Row = [
  id: string,
  layer: Layer,
  role: string,
  icon: string,
  choice: string,
  components: string,
];

const ROWS: Row[] = [
  [
    "web",
    "applications",
    "Applications web",
    "web",
    "Next.js 15 · React 19",
    "C-portail C-backoffice",
  ],
  ["api", "services", "API", "hub", "Node.js 22 · oRPC", "C-api"],
  ["auth", "services", "Authentification", "key", "Better Auth · lien magique", "C-auth"],
  ["db", "data", "Base de données", "database", "PostgreSQL 17", "C-db"],
  ["queue", "data", "File de tâches", "queue", "pg-boss, dans PostgreSQL", "C-queue C-worker"],
  ["sms", "external", "Fournisseur SMS", "sms", "", "C-sms"],
  ["mail", "external", "Fournisseur e-mail", "mail", "Brevo", "C-mail"],
  [
    "host",
    "operations",
    "Hébergement",
    "cloud",
    "Scaleway, Paris",
    "C-portail C-backoffice C-api C-worker C-db",
  ],
  [
    "obs",
    "operations",
    "Erreurs et journaux",
    "monitoring",
    "Sentry · journaux de l'hébergeur",
    "C-api C-worker C-portail",
  ],
  ["ci", "operations", "Intégration et déploiement", "rocket_launch", "GitHub Actions", ""],
  ["pdf", "applications", "Génération de PDF", "", "Rendu serveur (Typst)", "C-api"],
  ["recherche", "services", "Recherche", "search", "Plein texte PostgreSQL", "C-api"],
  ["paiement", "services", "Paiement en ligne", "payments", "", "C-api"],
  ["envoi-groupe", "services", "Envoi groupé", "send", "pg-boss", "C-api"],
  ["images", "data", "Stockage des images", "", "Scaleway Object Storage", "C-api"],
  ["cache", "data", "Cache", "", "Cache HTTP de l'hébergeur", "C-api"],
  ["sauvegardes", "data", "Sauvegardes", "", "Sauvegarde gérée quotidienne", "C-api"],
  ["encaissement", "external", "Prestataire de paiement", "payments", "Stripe", "C-api"],
  ["export", "external", "Export comptable", "", "Fichier FEC généré", "C-api"],
  ["cdn", "operations", "CDN", "cloud", "CDN de l'hébergeur", "C-api"],
  ["e2e", "operations", "Tests de bout en bout", "fact_check", "Playwright", "C-api"],
  ["qualite", "operations", "Qualité du code", "", "Biome · TypeScript strict", "C-api"],
  ["secrets", "operations", "Gestion des secrets", "key", "Coffre de l'hébergeur", "C-api"],
  ["sonde", "operations", "Sonde de disponibilité", "monitoring", "Sonde externe", "C-api"],
];

const choiceOf = ([id, layer, role, icon, chosen, components]: Row): Choice => ({
  specId: `ST-${id}`,
  role,
  layer,
  // Sans icône au registre : « layers », comme `stackIconOf` (maquette 14 l.554).
  icon: icon || "layers",
  status: chosen ? "chosen" : "open",
  ...(chosen ? { choice: chosen } : {}),
  components: components ? components.split(" ") : [],
  options: chosen ? [chosen, "Alternative"] : ["Stripe", "Mollie", "Paiement sur place"],
  criteria: chosen
    ? [{ label: "Adéquation", values: ["Bonne", "Moyenne"] }]
    : [
        {
          label: "Commission estimée",
          estimate: true,
          values: ["≈ 1,5 % + 0,25 €", "≈ 1,8 % + 0,25 €", "0 €"],
        },
        { label: "Effort", values: ["Moyen", "Moyen", "Aucun"] },
      ],
  why: chosen
    ? `Choix proposé par l'agent pour ${role.toLowerCase()}.`
    : "F-005 est reportée : l'agent compare trois options pour la suite.",
  requirements: [],
  decisions: [],
  filePath: `tech/stack/${id}.yaml`,
});

const SMS: Partial<Choice> = {
  recommended: "Brevo",
  options: ["Brevo", "Twilio", "OVHcloud SMS"],
  criteria: [
    {
      label: "Prix estimé par SMS en France",
      estimate: true,
      values: ["≈ 0,045 €", "≈ 0,07 €", "≈ 0,04 €"],
    },
    { label: "Données en UE", values: ["Oui", "Non par défaut", "Oui"] },
    { label: "E-mail chez le même", values: ["Oui", "Oui", "Non"] },
    { label: "Avis de l'agent", values: ["Recommandé", "—", "Alternative"] },
  ],
  why: "L'agent recommande Brevo : SMS et e-mail chez le même prestataire, données en UE. Les prix sont des estimations à vérifier avant de choisir.",
  plain: "Le prestataire qui enverra les rappels SMS reste à choisir.",
  requirements: ["NFR-001"],
  decisions: ["ADR-006"],
};

const base = (): Choice[] =>
  ROWS.map(choiceOf).map((choice) => (choice.specId === "ST-sms" ? { ...choice, ...SMS } : choice));

/** Choix retenus par « Choisir » depuis le dernier changement de scénario. */
let chosen = new Map<string, string>();
const comments: unknown[] = [];
/** « Valider » accepté depuis le dernier changement de scénario. */
let approved = false;
const isValidated = (mode: TechnicalMode): boolean => mode === "validated" || approved;
export function resetTechnical(): void {
  chosen = new Map();
  comments.length = 0;
  approved = false;
}

const choicesOf = (mode: TechnicalMode): Choice[] => {
  if (mode === "empty") return [];
  return base()
    .map((choice) => {
      // Un cahier validé n'a plus de choix à trancher (B775).
      const settled = mode === "validated" ? (choice.recommended ?? choice.options[0]) : undefined;
      const option = chosen.get(choice.specId) ?? (choice.status === "open" ? settled : undefined);
      return option ? { ...choice, status: "chosen" as const, choice: option } : choice;
    })
    .sort(
      (a, b) =>
        LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) || a.specId.localeCompare(b.specId),
    );
};

const env = (
  slug: string,
  name: string,
  address: string,
  hosting: string,
  database: string,
  data: string,
  extra: { deployment?: string; access: string; sms: string },
) => ({
  specId: `ENV-${slug}`,
  name,
  address,
  hosting,
  database,
  data,
  ...(extra.deployment ? { deployment: extra.deployment } : {}),
  access: extra.access,
  extras: [{ label: "SMS", value: extra.sms }],
});

const ENVIRONMENTS = {
  environments: [
    env(
      "developpement",
      "Développement",
      "localhost:3000",
      "Poste du développeur",
      "PostgreSQL local (conteneur)",
      "sample",
      { access: "Équipe", sms: "Simulés (journal)" },
    ),
    env(
      "recette",
      "Recette",
      "recette.atelier-lumiere.fr",
      "Scaleway · Paris",
      "PostgreSQL géré · petite instance",
      "anonymized",
      { deployment: "merge", access: "Équipe + client", sms: "Numéros de test" },
    ),
    env(
      "production",
      "Production",
      "reservation.atelier-lumiere.fr",
      "Scaleway · Paris",
      "PostgreSQL géré · haute disponibilité",
      "real",
      {
        deployment: "version",
        access: "Public · équipe connectée",
        sms: "Réels · fournisseur à trancher",
      },
    ),
  ],
  variables: [
    ["DATABASE_URL", "Connexion à la base"],
    ["AUTH_SECRET", "Signature des sessions"],
    ["SMS_API_KEY", "Fournisseur SMS"],
    ["MAIL_API_KEY", "Fournisseur e-mail"],
    ["SENTRY_DSN", "Erreurs"],
    ["PAYMENT_SECRET_KEY", "Paiement en ligne"],
    ["STORAGE_ACCESS_KEY", "Stockage des images"],
  ].map(([name, usage]) => ({ name, usage })),
  integrations: [
    { service: "Fournisseur SMS", usage: "Rappels (F-003)", status: "to_choose" },
    {
      service: "Fournisseur e-mail",
      usage: "Liens de connexion (F-007)",
      status: "account_to_create",
    },
    { service: "Sentry", usage: "Erreurs et alertes", status: "configured" },
    { service: "GitHub", usage: "Dépôt de code et CI", status: "connected" },
  ],
};
const NO_ENVIRONMENTS = { environments: [], variables: [], integrations: [] };
const environmentsOf = (mode: TechnicalMode) => (mode === "empty" ? NO_ENVIRONMENTS : ENVIRONMENTS);

const SECTIONS: Array<[slug: string, title: string, status: string, markdown: string]> = [
  [
    "objet",
    "Objet",
    "validee",
    "Ce cahier fixe les choix techniques du portail de réservation, les opérations de son API, les exigences mesurables et les environnements. Il découle de l'architecture validée le 5 nov.",
  ],
  [
    "stack",
    "Stack retenue",
    "validee",
    "Une seule stack TypeScript de bout en bout :\n- applications : Next.js 15 et React 19 ;\n- API : Node.js 22 et contrat oRPC partagé ;\n- données : PostgreSQL 17, file de tâches pg-boss ;\n- hébergement : Scaleway à Paris ; SMS : à trancher.",
  ],
  [
    "conventions",
    "Conventions",
    "a_relire",
    "Règles communes à l'équipe et aux agents :\n- code et identifiants en anglais, textes de l'interface en français ;\n- une branche et une pull request par ticket, revue obligatoire ;\n- migrations de base générées depuis data/tables/*.yaml, jamais écrites à la main.",
  ],
  [
    "securite",
    "Sécurité",
    "brouillon",
    "Secrets dans le coffre de l'hébergeur, jamais dans le dépôt ; dépendances analysées à chaque pull request ; limitation de débit sur les opérations publiques (NFR-004).",
  ],
  ["tests", "Tests et qualité", "a_rediger", ""],
];

const sectionsOf = (mode: TechnicalMode) =>
  (mode === "empty" ? [] : SECTIONS).map(([slug, title, status, markdown], index) => ({
    specId: `DOC-${slug}`,
    slug,
    num: index + 1,
    path: `tech/cahier-technique/${String(index + 1).padStart(2, "0")}-${slug}.md`,
    title,
    status,
    markdown,
    updatedAt: null,
    lastAuthor: null,
  }));

export const technicalCounts = (mode: TechnicalMode | undefined) =>
  mode === undefined
    ? {}
    : mode === "empty"
      ? { endpoints: 0, stack: 0, nfr: 0, environments: 0, components: 8 }
      : {
          // La tête compte aussi les anciens points REST : l'écran lit le total de la liste (B772).
          endpoints: technicalApiCounts.operations + 4,
          stack: ROWS.length,
          nfr: technicalApiCounts.requirements,
          environments: 3,
          components: 8,
        };

export function technicalDeliverable(mode: TechnicalMode | undefined) {
  if (mode === undefined) return undefined;
  const status = isValidated(mode)
    ? "validated"
    : { empty: "todo", demo: "pending", revise: "revise", notValidated: "pending" }[
        mode as Exclude<TechnicalMode, "validated">
      ];
  const staleTechnical = {
    changes: [
      { id: "C-avis", change: "added" },
      { id: "ADR-006", change: "accepted" },
    ],
    items: ["ST-sms", "NFR-004"],
  };
  return { status, ...(mode === "revise" ? { staleTechnical } : {}) };
}

const facetsOf = (rows: Choice[], key: "layer" | "status") => {
  const out: Record<string, number> = {};
  for (const row of rows) out[row[key]] = (out[row[key]] ?? 0) + 1;
  return out;
};

function stackPage(url: URL, rows: Choice[]) {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const items = rows.filter((row) => !q || `${row.role} ${row.specId}`.toLowerCase().includes(q));
  const size = Number(url.searchParams.get("limit") ?? 24);
  const at = items.findIndex((row) => row.specId === url.searchParams.get("around"));
  const from = url.searchParams.has("cursor")
    ? Number(url.searchParams.get("cursor"))
    : Math.floor(Math.max(0, at) / size) * size;
  return {
    items: items.slice(from, from + size),
    nextCursor: from + size < items.length ? String(from + size) : null,
    previousCursor: from > 0 ? String(Math.max(0, from - size)) : null,
    offset: from,
    total: items.length,
    facets: { layer: facetsOf(items, "layer"), status: facetsOf(items, "status") },
  };
}

const yamlOf = (choice: Choice): string =>
  [
    `id: ${choice.specId}`,
    `role: ${choice.role}`,
    `statut: ${choice.status === "open" ? "a_trancher" : "choisi"}`,
    `composants: [${choice.components.join(", ")}]`,
    `options:\n${choice.options.map((option) => `  - ${option}`).join("\n")}`,
    `pourquoi: >\n  ${choice.why}`,
    "",
  ].join("\n");

function itemOf(mode: TechnicalMode, type: string, id: string): Reply | undefined {
  if (type === "operation" || type === "nfr") return apiItemRead(type, id, isValidated(mode));
  const found =
    type === "stack"
      ? choicesOf(mode).find((choice) => choice.specId === id)
      : environmentsOf(mode).environments.find((item) => item.specId === id);
  if (!found) return reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
  const filePath = type === "stack" ? `tech/stack/${id.slice(3)}.yaml` : "tech/environments.yaml";
  return reply(200, {
    type,
    id,
    values: { ...found, filePath, commitSha: SHA },
    validated: mode === "validated",
    referencedBy: { items: [], total: 0 },
  });
}

function clientRead(url: URL, mode: TechnicalMode, route: string): Reply {
  const available = isValidated(mode);
  const state = { available, validation: available ? "validated" : "to_validate" };
  if (route.startsWith("operations") || route === "nfr") {
    return clientApiRead(url, route, available);
  }
  if (route === "") {
    const counts = available
      ? { choices: ROWS.length, ...technicalApiCounts, environments: 3 }
      : { choices: 0, operations: 0, requirements: 0, environments: 0 };
    return reply(200, { ...state, counts });
  }
  if (route === "stack") {
    const page = stackPage(url, available ? choicesOf(mode) : []);
    const items = page.items.map(({ specId, filePath: _path, ...rest }) => ({
      id: specId,
      ...rest,
    }));
    return reply(200, { ...state, ...page, items });
  }
  if (route === "environments") {
    return reply(200, { ...state, ...(available ? ENVIRONMENTS : NO_ENVIRONMENTS) });
  }
  const sections = (available ? sectionsOf(mode) : []).map(
    ({ specId, num, title, status, markdown }) => ({ specId, num, title, status, markdown }),
  );
  return reply(200, { ...state, sections });
}

const CLIENT =
  /^\/client-space\/projects\/[^/]+\/technical(?:\/(stack|environments|document|nfr|operations(?:\/[^/]+)?))?$/;
const READ =
  /^\/projects\/[^/]+\/spec\/(technical\/stack|technical\/environments|document\/sections)$/;
const SOURCE = /^\/projects\/[^/]+\/spec\/technical\/stack\/([^/]+)\/source$/;
const CHOOSE = /^\/projects\/[^/]+\/spec\/technical\/stack\/([^/]+)\/choose$/;
const ITEM = /^\/projects\/[^/]+\/spec\/items\/(stack|environment|operation|nfr)\/([^/]+)$/;
const COMMENTS = /^\/projects\/[^/]+\/comments$/;
const REVIEWS = /^\/projects\/[^/]+\/reviews$/;

function readOf(url: URL, mode: TechnicalMode): Reply | undefined {
  const api = teamApiRead(url, mode === "empty");
  if (api) return api;
  const client = CLIENT.exec(url.pathname);
  if (client) return clientRead(url, mode, client[1] ?? "");
  const item = ITEM.exec(url.pathname);
  if (item) return itemOf(mode, item[1] as string, item[2] as string);
  const source = SOURCE.exec(url.pathname);
  if (source) {
    const choice = choicesOf(mode).find((row) => row.specId === source[1]);
    if (!choice) return undefined;
    return reply(200, {
      path: choice.filePath,
      text: yamlOf(choice),
      commitSha: SHA,
      generated: false,
    });
  }
  const route = READ.exec(url.pathname)?.[1];
  if (route === "technical/stack") return reply(200, stackPage(url, choicesOf(mode)));
  if (route === "technical/environments") {
    const commitSha = mode === "empty" ? null : SHA;
    return reply(200, { ...environmentsOf(mode), commitSha });
  }
  if (route && url.searchParams.get("deliverable") === "technical") {
    return reply(200, { sections: sectionsOf(mode), commitSha: SHA });
  }
  return undefined;
}

const body = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk;
    });
    req.on("end", () => resolve(JSON.parse(text || "{}")));
  });

function choose(req: IncomingMessage, id: string, send: (reply: Reply) => void): void {
  void body(req).then((input) => {
    chosen.set(id, String(input.option));
    send(
      reply(200, {
        id: BATCH_ID,
        branch: "main",
        status: "committed",
        idempotencyKey: String(input.idempotencyKey),
        baseSha: SHA,
        commitSha: SHA,
        errorCode: null,
        report: null,
        results: [{ specId: id }],
        createdAt: "2026-11-27T10:00:00.000Z",
        updatedAt: "2026-11-27T10:00:00.000Z",
      }),
    );
  });
}

function comment(req: IncomingMessage, send: (reply: Reply) => void): boolean {
  if (req.method === "GET") {
    const answer = {
      id: "01900000-0000-7000-8000-000000000115",
      authorKind: "team",
      body: "Qui reçoit les alertes la nuit ? Moussa, puis Awa en relais : voir Exploitation.",
      createdAt: "2026-11-26T10:00:00.000Z",
    };
    send(reply(200, { items: [answer], nextCursor: null }));
    return true;
  }
  void body(req).then((input) => {
    comments.push(input);
    send(reply(200, { id: "01900000-0000-7000-8000-000000000116", ...input }));
  });
  return true;
}

const REVIEW_ID = "0190cccc-0000-7000-8000-000000000116";

/** Décision du livrable : refusée tant qu'un choix reste à trancher (B775), puis le cahier est « Validé ». */
function review(req: IncomingMessage, mode: TechnicalMode, send: (reply: Reply) => void): boolean {
  if (req.method === "GET") {
    const decision = {
      id: REVIEW_ID,
      targetKind: "deliverable",
      targetRef: "technical",
      sha: SHA,
      status: "approved",
      authorId: REVIEW_ID,
      authorRole: "owner",
      authorName: "Moussa",
      comment: null,
      createdAt: "2026-11-05T10:00:00.000Z",
      current: true,
      onBehalf: false,
    };
    send(reply(200, { items: isValidated(mode) ? [decision] : [], nextCursor: null }));
    return true;
  }
  void body(req).then(() => {
    if (choicesOf(mode).some((choice) => choice.status === "open")) {
      send(
        reply(409, {
          defined: true,
          code: "CONFLICT",
          status: 409,
          message: "Conflict",
          data: { reason: "choices_open" },
        }),
      );
      return;
    }
    approved = true;
    send(
      reply(200, {
        id: REVIEW_ID,
        status: "approved",
        validation: "validated",
        createdAt: "2026-11-05T10:00:00.000Z",
      }),
    );
  });
  return true;
}

/** Répond aux routes de la page Technique ; `false` quand le scénario ne la pilote pas ou pour toute autre route. */
export function handleSpecTechnical(
  req: IncomingMessage,
  url: URL,
  h: { scenario: TechnicalScenario; send: (reply: Reply) => void },
): boolean {
  const mode = h.scenario.technical;
  if (!mode) return false;
  if (url.pathname === "/__technical-comments") {
    h.send(reply(200, comments));
    return true;
  }
  if (COMMENTS.test(url.pathname)) return comment(req, h.send);
  if (REVIEWS.test(url.pathname)) return review(req, mode, h.send);
  const chooseId = CHOOSE.exec(url.pathname)?.[1];
  if (req.method === "POST" && chooseId) {
    choose(req, chooseId, h.send);
    return true;
  }
  if (req.method !== "GET") return false;
  const answer = readOf(url, mode);
  if (!answer) return false;
  h.send(answer);
  return true;
}
