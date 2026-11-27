/**
 * Onglets API et Exigences du faux API (TK-116, contrat 3.18.0) : 132 opérations et 28 exigences, les données de la
 * maquette 14 (l.592-668), leur YAML et le contrat généré, côté équipe et client.
 */
type Reply = { status: number; body: string };
const reply = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });
const notFound = (): Reply =>
  reply(404, { defined: true, code: "NOT_FOUND", message: "Not found" });
const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

type Cells = [string, string, string?];
type Errors = [code: string, when: string, rule?: string];
interface Operation {
  specId: string;
  type: "read" | "write" | "internal";
  zone: string;
  component: string;
  summary: string;
  permission: string;
  input: Cells[];
  output: Cells[];
  errors: Errors[];
  rules: string[];
  features: string[];
  callers: string[];
  rateLimit?: string;
}

const BOOKING = "Prise de rendez-vous";
const STAFF = "Personnel";

const operation = (specId: string, over: Partial<Operation>): Operation => ({
  specId,
  type: "read",
  zone: BOOKING,
  component: "C-api",
  summary: "",
  permission: "public",
  input: [["id", "uuid"]],
  output: [["ok", "booléen"]],
  errors: [],
  rules: [],
  features: [],
  callers: [],
  ...over,
});

const MODEL: Operation[] = [
  operation("reservation.create", {
    type: "write",
    summary: "Crée une réservation sur un créneau libre, sans compte client.",
    permission: "PM-reservation.creer",
    input: [
      ["serviceId", "uuid", "Service actif"],
      ["creneauId", "uuid", "Créneau libre"],
      ["nom", "texte(100)", "Obligatoire"],
      ["telephone", "texte(20)", "Format E.164"],
      ["consentementSms", "booléen", "Obligatoire pour le rappel"],
    ],
    output: [
      ["reservationId", "uuid"],
      ["statut", "enum", "confirmee"],
      ["lienAnnulation", "url", "Jeton à usage unique"],
    ],
    errors: [
      ["CRENEAU_PRIS", "le créneau vient d'être pris ; renvoie les 3 plus proches", "R-001"],
      ["SERVICE_INACTIF", "le service n'est plus proposé"],
      ["TELEPHONE_INVALIDE", "format non E.164"],
    ],
    rules: ["R-001", "R-003"],
    features: ["F-001"],
    callers: ["Client", "Accueil", "Gérant"],
    rateLimit: "10 par minute et par IP (NFR-004)",
  }),
  operation("reservation.cancel", {
    type: "write",
    summary: "Annule une réservation depuis le lien du SMS.",
    permission: "PM-reservation.modifier",
    input: [["jeton", "texte(64)", "Lien d'annulation"]],
    output: [["statut", "enum", "annulee"]],
    errors: [
      ["DELAI_DEPASSE", "moins de 2 h avant le rendez-vous", "R-002"],
      ["JETON_INVALIDE", "lien expiré ou inconnu"],
    ],
    rules: ["R-002", "R-004"],
    features: ["F-002"],
    callers: ["Client (les siennes)", "Accueil", "Gérant"],
    rateLimit: "20 par minute et par IP",
  }),
  operation("reservation.reschedule", {
    type: "write",
    summary: "Déplace une réservation vers un autre créneau.",
    permission: "PM-reservation.modifier",
    callers: ["Client (les siennes)", "Accueil"],
  }),
  operation("creneau.listAvailable", {
    summary: "Créneaux libres d'un service sur une période, paginés.",
    input: [
      ["serviceId", "uuid"],
      ["du", "date"],
      ["au", "date", "14 jours au plus"],
    ],
    output: [
      ["items", "Creneau[]", "50 au plus"],
      ["nextCursor", "texte | null"],
    ],
    features: ["F-001"],
    rateLimit: "60 par minute et par IP",
  }),
  operation("agenda.day", {
    summary: "Réservations du jour, par employé.",
    permission: "PM-agenda.lire",
    callers: ["Accueil", "Gérant"],
  }),
  operation("creneau.block", {
    type: "write",
    summary: "Bloque un créneau (absence, pause).",
    permission: "PM-creneau.bloquer",
    callers: ["Accueil", "Gérant"],
  }),
  operation("reservation.markAbsent", {
    type: "write",
    summary: "Marque une réservation « absente ».",
    permission: "PM-reservation.modifier",
    callers: ["Accueil", "Gérant"],
  }),
  operation("service.list", {
    zone: "Catalogue et stock",
    summary: "Services actifs avec leur durée et leur prix.",
    features: ["F-004"],
  }),
  operation("auth.requestLink", {
    type: "write",
    zone: STAFF,
    component: "C-auth",
    summary: "Envoie un lien de connexion par e-mail au personnel.",
    features: ["F-007"],
  }),
  operation("rappel.send", {
    type: "internal",
    zone: "Communication",
    component: "C-worker",
    summary: "Envoie le SMS de rappel d'une réservation (tâche datée, interne).",
    permission: "internal",
    features: ["F-003"],
  }),
];

const QUOTAS: Array<[zone: string, total: number, entities: string[]]> = [
  [BOOKING, 18, ["reservation", "creneau", "liste_attente", "horaire"]],
  ["Clients et fidélité", 22, ["client", "avis", "fidelite", "segment"]],
  ["Catalogue et stock", 30, ["service", "produit", "stock", "promo", "carte_cadeau"]],
  ["Paiement et caisse", 34, ["paiement", "facture", "avoir", "caisse", "export"]],
  [STAFF, 16, ["employe", "planning", "conge", "pointage"]],
  ["Communication", 12, ["campagne", "modele", "preference", "envoi"]],
];
const VERBS = ["list", "byId", "create", "update", "archive", "export", "count", "search"];

/** Complète chaque zone jusqu'au volume de la planche (132 opérations). */
function generated(): Operation[] {
  const names = new Set(MODEL.map((item) => item.specId));
  return QUOTAS.flatMap(([zone, total, entities]) => {
    const missing = total - MODEL.filter((item) => item.zone === zone).length;
    const candidates = VERBS.flatMap((verb) => entities.map((entity) => ({ entity, verb })));
    return candidates
      .filter(({ entity, verb }) => !names.has(`${entity}.${verb}`))
      .slice(0, missing)
      .map(({ entity, verb }) => {
        const read = ["list", "byId", "export", "count", "search"].includes(verb);
        return operation(`${entity}.${verb}`, {
          zone,
          type: read ? "read" : "write",
          summary: `${read ? "Lecture" : "Écriture"} : ${entity.replace("_", " ")} (${verb}).`,
          permission: `PM-${entity}.${read ? "lire" : "gerer"}`,
          callers: ["Gérant"],
        });
      });
  });
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const OPERATIONS = [...MODEL, ...generated()].sort(
  (a, b) => byName(a.zone, b.zone) || byName(a.specId, b.specId),
);

const summaryOf = ({ specId, type, zone, component, summary, permission }: Operation) => ({
  specId,
  type,
  zone,
  component,
  summary,
  permission,
  filePath: `api/endpoints/${specId}.yaml`,
});

const detailOf = (item: Operation) => ({
  ...summaryOf(item),
  input: item.input.map(([field, type, constraint]) => ({
    field,
    type,
    ...(constraint ? { constraint } : {}),
  })),
  output: item.output.map(([field, type, note]) => ({ field, type, ...(note ? { note } : {}) })),
  errors: item.errors.map(([code, when, rule]) => ({ code, when, ...(rule ? { rule } : {}) })),
  rules: item.rules,
  features: item.features,
  ...(item.rateLimit ? { rateLimit: item.rateLimit } : {}),
  callers: item.callers.map((name) => ({ name })),
  commitSha: SHA,
});

type Nfr = [
  category: string,
  title: string,
  target: string,
  statement: string,
  verification: string,
];
const REQUIREMENTS_MODEL: Nfr[] = [
  [
    "data",
    "Conservation et effacement",
    "Purge à 3 ans",
    "Les données des clients sont effacées 3 ans après leur dernière réservation ; export ou effacement sur demande sous 30 jours.",
    "scenario",
  ],
  [
    "performance",
    "Rapidité du portail sur mobile",
    "LCP < 2,5 s en 4G",
    "Le portail affiche les créneaux en moins de 2,5 s sur un téléphone moyen en 4G.",
    "ci_measure",
  ],
  [
    "performance",
    "Temps de réponse de l'API",
    "p95 < 300 ms",
    "Les opérations de réservation répondent en moins de 300 ms pour 95 % des appels.",
    "to_define",
  ],
  [
    "security",
    "Limitation des abus",
    "10 réservations / min / IP",
    "Au-delà, l'API refuse avec un message clair ; liste blanche pour l'accueil.",
    "scenario",
  ],
  [
    "availability",
    "Disponibilité",
    "99,5 % par mois",
    "Hors maintenance annoncée 48 h à l'avance ; alerte en moins de 5 min.",
    "ci_measure",
  ],
  [
    "accessibility",
    "Accessibilité du portail",
    "WCAG 2.2 AA",
    "Le portail public respecte le niveau AA, clavier et lecteur d'écran compris.",
    "ci_measure",
  ],
  [
    "security",
    "Sessions du personnel",
    "Lien 15 min · session 12 h",
    "Lien de connexion à usage unique (ADR-004).",
    "scenario",
  ],
  [
    "operations",
    "Sauvegarde et restauration",
    "RPO 24 h · RTO 4 h",
    "Sauvegarde quotidienne chiffrée ; restauration testée chaque trimestre.",
    "manual",
  ],
];
const REQUIREMENTS_MORE: Array<[category: string, title: string, target: string]> = [
  ["performance", "Recherche de créneaux", "p95 < 200 ms"],
  ["performance", "Poids du portail", "< 200 Ko de JS"],
  ["performance", "Génération des factures", "< 3 s"],
  ["security", "Chiffrement en transit", "TLS 1.2 minimum"],
  ["security", "Journal d'audit", "Conservé 1 an"],
  ["security", "Dépendances vulnérables", "0 critique en production"],
  ["security", "Mots de passe", "Aucun stocké"],
  ["data", "Hébergement", "En France"],
  ["data", "Sous-traitants", "Liste publiée"],
  ["data", "Consentement SMS", "Tracé et révocable"],
  ["availability", "Reprise du worker", "< 10 min"],
  ["availability", "Maintenance", "Annoncée 48 h avant"],
  ["accessibility", "Back-office", "WCAG 2.2 AA"],
  ["accessibility", "Contraste", "4,5:1 minimum"],
  ["accessibility", "Zones tactiles", "44 px minimum"],
  ["operations", "Journaux", "Conservés 30 jours"],
  ["operations", "Déploiement", "< 10 min"],
  ["operations", "Retour arrière", "< 5 min"],
  ["operations", "Coût d'hébergement", "< 60 € / mois"],
  ["performance", "Envoi des rappels", "18 h ± 5 min"],
];
const CATEGORIES = [
  "data",
  "performance",
  "security",
  "availability",
  "accessibility",
  "operations",
];

const REQUIREMENTS = [
  ...REQUIREMENTS_MODEL,
  ...REQUIREMENTS_MORE.map(
    ([category, title, target]): Nfr => [
      category,
      title,
      target,
      "Exigence proposée par l'agent à partir des contraintes du dossier.",
      "scenario",
    ],
  ),
]
  .map(([category, title, target, statement, verification], index) => {
    const specId = `NFR-${String(index + 1).padStart(3, "0")}`;
    return {
      specId,
      category,
      title,
      target,
      statement,
      verification,
      ...(verification === "scenario" ? { verificationDetail: `TS-0${41 + index}` } : {}),
      links: ["C-api"],
      filePath: `nfr/${specId}.yaml`,
    };
  })
  .sort(
    (a, b) =>
      CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || byName(a.specId, b.specId),
  );

export const technicalApiCounts = {
  operations: OPERATIONS.length,
  requirements: REQUIREMENTS.length,
};

const facetsOf = <T>(rows: T[], key: keyof T): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const row of rows) out[String(row[key])] = (out[String(row[key])] ?? 0) + 1;
  return out;
};

function pageOf<T extends { specId: string }>(url: URL, items: T[]) {
  const size = Number(url.searchParams.get("limit") ?? 50);
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
  };
}

function operationPage(url: URL, rows: Operation[]) {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const zone = url.searchParams.get("zone");
  const found = rows.filter((row) => !q || row.specId.toLowerCase().includes(q));
  const items = found.filter((row) => !zone || row.zone === zone).map(summaryOf);
  return { ...pageOf(url, items), facets: { zone: facetsOf(found, "zone") } };
}

const requirementPage = (url: URL, rows: typeof REQUIREMENTS) => ({
  ...pageOf(url, rows),
  facets: { category: facetsOf(rows, "category") },
});

const yamlOf = (item: Operation): string =>
  [
    `id: ${item.specId}`,
    `type: ${{ read: "lecture", write: "ecriture", internal: "interne" }[item.type]}`,
    `zone: ${item.zone}`,
    `composant: ${item.component}`,
    `permission: ${item.permission === "internal" ? "interne" : item.permission}`,
    `resume: ${item.summary}`,
    "entree:",
    ...item.input.map(([field, type]) => `  ${field}: { type: "${type}" }`),
    "sortie:",
    ...item.output.map(([field, type]) => `  ${field}: { type: "${type}" }`),
    "",
  ].join("\n");

/** Les types de la maquette 14 (l.627) ; l'énumération lit sa valeur dans la note, comme le générateur (B782). */
function zodOf([, type, hint]: Cells): string {
  const simple: Record<string, string> = {
    uuid: "z.string().uuid()",
    booléen: "z.boolean()",
    date: "z.string().date()",
    url: "z.string().url()",
  };
  const known = simple[type];
  if (known) return known;
  const text = /^texte\((\d+)\)$/.exec(type);
  if (text) return `z.string().max(${text[1]})`;
  if (type === "enum") return `z.enum(['${hint}'])`;
  if (type.endsWith("[]")) return `z.array(${type.slice(0, -2)})`;
  return type.includes("null") ? "z.string().nullable()" : "z.unknown()";
}

function contractOf(item: Operation) {
  const name = item.specId.replace(/\.(\w)/g, (_match, letter: string) => letter.toUpperCase());
  const object = (cells: Cells[]) =>
    cells.map((cell) => `    ${cell[0]}: ${zodOf(cell)},`).join("\n");
  const errors = item.errors
    .map(([code, , rule]) => `    ${code}: { status: 422 },${rule ? ` // ${rule}` : ""}`)
    .join("\n");
  const code = [
    `export const ${name} = oc`,
    "  .route({ tags: ['prise-de-rendez-vous'] })",
    `  .input(z.object({\n${object(item.input)}\n  }))`,
    `  .output(z.object({\n${object(item.output)}\n  }))`,
    ...(errors ? [`  .errors({\n${errors}\n  })`] : []),
  ]
    .join("\n")
    .concat(";\n");
  return {
    available: true,
    generator: { stackId: "ST-api", label: "TypeScript · oRPC", choice: "Node.js 22 · oRPC" },
    path: `packages/contract/src/prise-de-rendez-vous/${item.specId.split(".")[0]}.ts`,
    code,
    commitSha: SHA,
  };
}

const find = (id: string) => OPERATIONS.find((item) => item.specId === id);

function byOperation(id: string, view: string | undefined): Reply {
  const item = find(id);
  if (!item) return notFound();
  if (view === "contract") return reply(200, contractOf(item));
  if (view !== "source") return reply(200, detailOf(item));
  const path = `api/endpoints/${id}.yaml`;
  return reply(200, { path, text: yamlOf(item), commitSha: SHA, generated: false });
}

const TEAM =
  /^\/projects\/[^/]+\/spec\/technical\/(?:operations(?:\/([^/]+)(?:\/(source|contract))?)?|(operation-options)|(nfr))$/;

/** Lectures de l'équipe ; `empty` : rien d'écrit. */
export function teamApiRead(url: URL, empty: boolean): Reply | undefined {
  const match = TEAM.exec(url.pathname);
  if (!match) return undefined;
  const [, id, view, options, nfr] = match;
  if (id) return byOperation(decodeURIComponent(id), view);
  if (options) {
    const permissions = [...new Set(OPERATIONS.map((item) => item.permission))]
      .filter((permission) => permission.startsWith("PM-"))
      .sort(byName);
    return reply(200, { zones: QUOTAS.map(([zone]) => zone).sort(byName), permissions });
  }
  if (nfr) return reply(200, requirementPage(url, empty ? [] : REQUIREMENTS));
  return reply(200, operationPage(url, empty ? [] : OPERATIONS));
}

const clientRow = <T extends { specId: string; filePath?: string }>({
  specId,
  filePath: _path,
  ...rest
}: T) => ({ id: specId, ...rest });

/** Lectures du client : `route` vaut « operations », « operations/<nom> » ou « nfr ». */
export function clientApiRead(url: URL, route: string, available: boolean): Reply {
  const state = { available, validation: available ? "validated" : "to_validate" };
  const [head, id] = route.split("/");
  if (head === "nfr") {
    const page = requirementPage(url, available ? REQUIREMENTS : []);
    return reply(200, { ...state, ...page, items: page.items.map(clientRow) });
  }
  if (!id) {
    const page = operationPage(url, available ? OPERATIONS : []);
    return reply(200, { ...state, ...page, items: page.items.map(clientRow) });
  }
  const item = available ? find(decodeURIComponent(id)) : undefined;
  if (!item) return reply(200, { ...state, operation: null });
  const { commitSha: _sha, ...detail } = detailOf(item);
  return reply(200, { ...state, operation: clientRow(detail) });
}

/** Élément lu par la feuille (`spec.item.get`). */
export function apiItemRead(type: "operation" | "nfr", id: string, validated: boolean): Reply {
  const operationFound = type === "operation" ? find(id) : undefined;
  const requirement = type === "nfr" ? REQUIREMENTS.find((row) => row.specId === id) : undefined;
  const values = operationFound
    ? detailOf(operationFound)
    : requirement && { ...requirement, commitSha: SHA };
  if (!values) return notFound();
  return reply(200, { type, id, values, validated, referencedBy: { items: [], total: 0 } });
}
