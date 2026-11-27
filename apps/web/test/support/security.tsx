import { screen } from "@testing-library/react";
import { SecurityPage } from "../../src/components/security-page.tsx";
import { batch, NEW_SHA } from "./feature-form.tsx";
import { head, PROJECT_ID, serve } from "./features.tsx";
import { serveProposals } from "./proposals.tsx";
import { renderWithQuery } from "./render.tsx";
import { procedures, setUrl, specDeliverables } from "./web-mocks.ts";

/** Faux serveur du livrable Sécurité (contrat 3.19.0) : données de la maquette 15. */
export { PROJECT_ID };
export const SHA40 = "a".repeat(40);

export const threat = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Menace ${id}`,
  surface: "F-012",
  surfaces: ["F-012"],
  category: "data_leak",
  severity: "high",
  status: "ok",
  verification: "scenario",
  ...over,
});

export const THREATS = [
  threat("SEC-T01", {
    title: "Lien de connexion intercepté",
    surface: "F-009",
    surfaces: ["F-009"],
    category: "spoofing",
  }),
  threat("SEC-T08", { title: "Export du fichier clients par un compte volé", status: "todo" }),
  threat("SEC-T10", {
    title: "Clé du fournisseur SMS exposée",
    surface: "api",
    surfaces: ["api"],
    verification: "ci_check",
    severity: "medium",
  }),
];

export const DETAILS: Record<string, Record<string, unknown>> = {
  "SEC-T08": {
    risk: "Avec le compte de la gérante, quelqu'un exporte les clientes.",
    measures: [],
    links: ["client.export", "RL-gerante"],
    gherkin: "# language: fr\n@SEC-T08 @F-012 @abus\nFonctionnalité: Fichier clients",
    scenarioPath: "quality/scenarios/abuse/SEC-T08.feature",
  },
  "SEC-T01": {
    risk: "Quelqu'un récupère un lien de connexion.",
    measures: ["Lien à usage unique.", "Empreinte seule en base."],
    links: ["clients.jeton"],
    gherkin: "# language: fr\n@SEC-T01 @F-009 @abus",
    scenarioPath: "quality/scenarios/abuse/SEC-T01.feature",
  },
  "SEC-T10": {
    risk: "La clé se retrouve dans le dépôt.",
    measures: ["Secrets injectés au déploiement."],
    verificationDetail: "Contrôle de la CI · secrets",
    links: ["ST-sms"],
    gherkin: "",
    scenarioPath: null,
  },
};

export const detailOf = (id: string) => {
  const found = THREATS.find((row) => row.id === id) ?? THREATS[0];
  return {
    ...found,
    surfaceTitles: [],
    ...DETAILS[id],
    filePath: `security/threats/${id}.yaml`,
    commitSha: SHA40,
  };
};

export const dataRow = (field: string, over: Record<string, unknown> = {}) => ({
  field,
  data: "Téléphone",
  fields: [field],
  category: "contact",
  retention: "3 ans après le dernier rendez-vous",
  access: ["Accueil", "Gérante"],
  protection: "Chiffré au repos",
  status: "classified",
  ...over,
});

export const DATA_ROWS = [
  dataRow("clients.telephone"),
  dataRow("reservations.note", {
    data: "Note de rendez-vous",
    category: "sensitive",
    retention: undefined,
    retentionSuggestion: "1 an",
    status: "undecided",
  }),
  {
    field: "journaux.ip",
    fields: ["journaux.ip"],
    access: [],
    status: "unclassified",
  },
];

export const RIGHTS = {
  roles: [
    { id: "RL-cliente", name: "Cliente" },
    { id: "RL-gerante", name: "Gérante" },
  ],
  actions: [
    {
      id: "PM-reservation.lire",
      label: "Voir des rendez-vous",
      cells: [
        { role: "RL-cliente", access: "restricted", restriction: "Les siens" },
        { role: "RL-gerante", access: "yes" },
      ],
    },
    {
      id: "PM-client.exporter",
      label: "Exporter le fichier clients",
      cells: [
        { role: "RL-cliente", access: "no" },
        { role: "RL-gerante", access: "yes" },
      ],
    },
  ],
  restrictions: [],
  ownershipRules: ["Toute lecture vérifie le salon du compte connecté."],
  abuseScenarios: 2,
  commitSha: SHA40,
};

export const ASVS = {
  level: 2,
  recommendedLevel: 2,
  chosen: false,
  chapters: [
    {
      chapter: "authentication",
      answered: 4,
      total: 4,
      where: ["F-009"],
      status: "covered",
    },
    { chapter: "logging", answered: 1, total: 3, where: [], status: "missing" },
    { chapter: "api", answered: 0, total: 0, where: [], status: "to_check" },
  ],
  answered: 5,
  total: 7,
  facts: [{ label: "Rotation", value: "Tous les 90 jours." }],
  commitSha: SHA40,
};

const CARD_TITLES = {
  location: "Où sont les données",
  protection: "Ce qui est protégé",
  access: "Qui voit quoi",
  signIn: "Comment on se connecte",
  retention: "Combien de temps on garde",
  checks: "Ce qui est vérifié à chaque modification",
  incident: "En cas d'incident",
};

export const CARDS = Object.entries(CARD_TITLES).map(([key, title]) => ({
  key,
  title,
  text: `Texte « ${title} ».`,
}));

export const sectionOf = (num: number, slug: string, title: string, status: string) => ({
  specId: `DOC-${slug}`,
  slug,
  num,
  path: `security/dossier/0${num}-${slug}.md`,
  title,
  status,
  markdown: status === "a_rediger" ? "" : "Le dossier décrit les protections.",
  updatedAt: null,
  lastAuthor: null,
});

interface Options {
  threats?: ReturnType<typeof threat>[];
  data?: readonly Record<string, unknown>[];
  summary?: boolean;
  contact?: { name: string; phone: string };
  status?: "todo" | "pending" | "revise" | "validated";
  staleSecurity?: { changes: { id: string; change: string }[]; items: string[] };
  available?: boolean;
}

function page<T>(items: readonly T[], extra: Record<string, unknown> = {}) {
  return {
    items,
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: items.length,
    ...extra,
  };
}

function threatPage(rows: ReturnType<typeof threat>[], input: Record<string, unknown>) {
  const q = typeof input.q === "string" ? input.q.toLowerCase() : "";
  const kept = rows.filter(
    (row) =>
      (!q || `${row.id} ${row.title}`.toLowerCase().includes(q)) &&
      (input.filter !== "high" || row.severity === "high") &&
      (input.filter !== "todo" || row.status === "todo") &&
      (input.filter !== "ci" || row.verification === "ci_check"),
  );
  const surface: Record<string, number> = {};
  for (const row of rows) surface[row.surface] = (surface[row.surface] ?? 0) + 1;
  const todo = (list: typeof rows) => list.filter((row) => row.status === "todo").length;
  const high = rows.filter((row) => row.severity === "high");
  return page(kept, {
    facets: {
      status: { total: rows.length, todo: todo(rows), todoHigh: todo(high), high: high.length },
      surface,
    },
    surfaces: [
      { id: "F-009", title: "Connexion par lien magique" },
      { id: "F-012", title: "Fichier clients et RGPD" },
      { id: "api", title: "API, secrets et intégrations" },
    ],
  });
}

function dataPage(rows: readonly Record<string, unknown>[]) {
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
    context: { hosting: ["Scaleway, Paris"], subprocessors: ["Brevo"], transfers: null },
  });
}

function serveReads(options: Options): void {
  const threats = options.threats ?? THREATS;
  const data = options.data ?? DATA_ROWS;
  const written = threats.length > 0 || data.length > 0;
  procedures.securityThreatList.mockImplementation(async (input: unknown) =>
    threatPage(threats, (input ?? {}) as Record<string, unknown>),
  );
  procedures.securityThreatById.mockImplementation(async (input: unknown) =>
    detailOf((input as { threatId: string }).threatId),
  );
  procedures.securityDataList.mockResolvedValue(dataPage(data));
  procedures.securityRightsGet.mockResolvedValue(
    written ? RIGHTS : { ...RIGHTS, roles: [], actions: [], ownershipRules: [], abuseScenarios: 0 },
  );
  procedures.securityAsvsReport.mockResolvedValue(
    written ? ASVS : { ...ASVS, answered: 0, total: 0, chapters: [], facts: [] },
  );
  procedures.securitySummaryGet.mockResolvedValue({
    available: options.summary ?? written,
    cards: (options.summary ?? written) ? CARDS : [],
    commitSha: SHA40,
    ...(options.contact ? { contact: options.contact } : {}),
  });
  procedures.specDocumentSections.mockResolvedValue({
    sections: [
      sectionOf(1, "objet", "Objet et périmètre", "validee"),
      sectionOf(7, "incident", "Réponse à un incident", "a_rediger"),
    ],
    commitSha: SHA40,
  });
}

function serveItems(): void {
  procedures.specItemGet.mockImplementation(async (input: unknown) => {
    const { type, id } = input as { type: string; id: string };
    const values =
      type === "threat"
        ? detailOf(id)
        : {
            ...(DATA_ROWS.find((row) => row.field === id) ?? DATA_ROWS[0]),
            filePath: "security/data.yaml",
            commitSha: SHA40,
          };
    return { type, id, values, validated: false, referencedBy: { items: [], total: 0 } };
  });
}

/** Installe le faux serveur de la page Sécurité pour un rôle. */
export function serveSecurity(
  role: Parameters<typeof serve>[0] = "owner",
  options: Options = {},
): void {
  serve(role);
  serveProposals([]);
  const open = ["functional", "data", "architecture", "technical"];
  procedures.specDeliverables.mockResolvedValue(
    specDeliverables({
      open: new Set(options.available === false ? open : [...open, "security"]),
      validated: ["functional", "data", "architecture", "technical"],
      status: { security: options.status ?? "pending" },
      ...(options.staleSecurity ? { staleSecurity: options.staleSecurity } : {}),
    }),
  );
  procedures.specHead.mockResolvedValue(head());
  serveReads(options);
  serveItems();
  procedures.commentList.mockResolvedValue({ items: [], nextCursor: null });
  procedures.reviewList.mockResolvedValue({ items: [], nextCursor: null });
  procedures.reviewSubmit.mockResolvedValue({ id: "r1" });
  procedures.specRefsSearch.mockResolvedValue({ items: [] });
}

/** Vue client : résumé validé (ou non), sans aucun identifiant. */
export function serveClientSecurity(
  role: "client" | "business" = "client",
  options: { available?: boolean; contact?: { name: string; phone: string } } = {},
): void {
  const available = options.available ?? true;
  serveSecurity(role);
  procedures.clientSpaceSecurity.mockResolvedValue({
    available,
    validation: available ? "validated" : "to_validate",
    cards: available ? CARDS : [],
    ...(available ? { validatedAt: "2026-11-05T10:00:00.000Z" } : {}),
    ...(options.contact ? { contact: options.contact } : {}),
  });
  procedures.clientSpaceSecurityContactSet.mockImplementation(async (input: unknown) => input);
  procedures.commentCreate.mockResolvedValue({ id: "c1" });
}

/** Le prochain enregistrement est écrit puis indexé : la tête passe à la nouvelle version. */
export function commitOnSubmit(procedure: typeof procedures.specBatchSubmit): void {
  procedure.mockImplementation(async () => {
    procedures.specHead.mockResolvedValue(head({ commitSha: NEW_SHA }));
    return batch({ status: "committed" });
  });
}

export function renderSecurity({ search = "" }: { search?: string } = {}) {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  setUrl(`/projects/${PROJECT_ID}/spec/security${query}`);
  return renderWithQuery(<SecurityPage projectId={PROJECT_ID} />);
}

export const securityHeading = () => screen.findByRole("heading", { level: 1, name: "Sécurité" });
