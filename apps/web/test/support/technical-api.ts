import { procedures } from "./web-mocks.ts";

/** Faux serveur des onglets API et Exigences (contrat 3.18.0) : données de la maquette 14. */
const SHA40 = "a".repeat(40);
const TOTAL_OPERATIONS = 132;
const TOTAL_REQUIREMENTS = 28;

export const operation = (specId: string, over: Record<string, unknown> = {}) => ({
  specId,
  type: "write",
  zone: "Prise de rendez-vous",
  component: "C-api",
  summary: `Résumé de ${specId}.`,
  permission: "PM-reservation.modifier",
  filePath: `api/endpoints/${specId}.yaml`,
  ...over,
});

export const OPERATIONS = [
  operation("reservation.cancel", { summary: "Annule une réservation depuis le lien du SMS." }),
  operation("creneau.listAvailable", {
    type: "read",
    summary: "Créneaux libres d'un service sur une période, paginés.",
    permission: "public",
  }),
  operation("rappel.send", {
    type: "internal",
    zone: "Communication",
    component: "C-worker",
    summary: "Envoie le SMS de rappel d'une réservation.",
    permission: "internal",
  }),
];

const DETAILS: Record<string, Record<string, unknown>> = {
  "reservation.cancel": {
    input: [{ field: "jeton", type: "texte(64)", constraint: "Lien d'annulation" }],
    output: [{ field: "statut", type: "enum", note: "annulee" }],
    errors: [
      { code: "DELAI_DEPASSE", when: "moins de 2 h avant le rendez-vous", rule: "R-002" },
      { code: "JETON_INVALIDE", when: "lien expiré ou inconnu" },
    ],
    rules: ["R-002", "R-004"],
    features: ["F-002"],
    rateLimit: "20 par minute et par IP",
    callers: [{ name: "Client", restriction: "les siennes" }, { name: "Accueil" }],
  },
};

export const operationDetail = (specId: string, rows = OPERATIONS) => {
  const summary = rows.find((row) => row.specId === specId) ?? operation(specId);
  return {
    ...summary,
    input: [{ field: "serviceId", type: "uuid" }],
    output: [{ field: "statut", type: "enum" }],
    errors: [],
    rules: [],
    features: [],
    callers: [],
    ...DETAILS[specId],
    commitSha: SHA40,
  };
};

export const requirement = (n: number, over: Record<string, unknown> = {}) => ({
  specId: `NFR-${String(n).padStart(3, "0")}`,
  category: "performance",
  title: `Exigence ${n}`,
  target: "p95 < 300 ms",
  statement: "Les opérations répondent vite.",
  verification: "to_define",
  links: ["C-api"],
  filePath: `nfr/NFR-${String(n).padStart(3, "0")}.yaml`,
  ...over,
});

export const REQUIREMENTS = [
  requirement(1, {
    category: "data",
    title: "Conservation et effacement",
    target: "Purge à 3 ans",
    verification: "scenario",
    verificationDetail: "TS-041",
  }),
  requirement(3, { title: "Temps de réponse de l'API" }),
  requirement(4, {
    category: "security",
    title: "Limitation des abus",
    target: "10 réservations / min / IP",
    verification: "ci_measure",
  }),
];

type Input = Record<string, unknown>;

function facetsOf<T>(rows: readonly T[], key: keyof T): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[String(row[key])] = (out[String(row[key])] ?? 0) + 1;
  return out;
}

function pageOf<T extends { specId: string }>(rows: readonly T[], input: Input, total?: number) {
  const size = Number(input.limit ?? 50);
  const from = input.cursor ? Number(input.cursor) : 0;
  const count = total ?? rows.length;
  return {
    items: rows.slice(from, from + size),
    // Un total plus grand que les lignes fournies (volume de la planche) annonce une suite.
    nextCursor: from + size < Math.max(rows.length, count) ? String(from + size) : null,
    previousCursor: from > 0 ? String(Math.max(0, from - size)) : null,
    offset: from,
    total: count,
  };
}

function operationPage(rows: typeof OPERATIONS, input: Input, total: number | undefined) {
  const q = typeof input.q === "string" ? input.q.toLowerCase() : "";
  const found = rows.filter((row) => !q || row.specId.toLowerCase().includes(q));
  const items = found.filter((row) => !input.zone || row.zone === input.zone);
  const narrowed = Boolean(q || input.zone);
  return {
    ...pageOf(items, input, narrowed ? undefined : total),
    facets: { zone: facetsOf(found, "zone") },
  };
}

function requirementPage(rows: typeof REQUIREMENTS, input: Input, total: number | undefined) {
  return { ...pageOf(rows, input, total), facets: { category: facetsOf(rows, "category") } };
}

/** Éléments lus par la feuille (`spec.item.get`, types `operation` et `nfr`). */
export function apiItem(type: "operation" | "nfr", id: string) {
  const values =
    type === "operation"
      ? operationDetail(id)
      : { ...(REQUIREMENTS.find((row) => row.specId === id) ?? requirement(9)), commitSha: SHA40 };
  return { type, id, values, validated: false, referencedBy: { items: [], total: 0 } };
}

export interface ApiOptions {
  operations?: typeof OPERATIONS;
  requirements?: typeof REQUIREMENTS;
}

/** Équipe : liste, fiche, YAML, listes de la feuille, contrat et exigences. */
export function serveTechnicalApi(options: ApiOptions = {}): void {
  const operations = options.operations ?? OPERATIONS;
  const requirements = options.requirements ?? REQUIREMENTS;
  const operationsTotal = options.operations ? undefined : TOTAL_OPERATIONS;
  const requirementsTotal = options.requirements ? undefined : TOTAL_REQUIREMENTS;
  procedures.specTechnicalOpsList.mockImplementation(async (input: unknown) =>
    operationPage(operations, (input ?? {}) as Input, operationsTotal),
  );
  procedures.specTechnicalOpsById.mockImplementation(async (input: unknown) =>
    operationDetail((input as { opId: string }).opId, operations),
  );
  procedures.specTechnicalOpsSource.mockImplementation(async (input: unknown) => {
    const { opId } = input as { opId: string };
    return {
      path: `api/endpoints/${opId}.yaml`,
      text: `id: ${opId}\ntype: ecriture\n`,
      commitSha: SHA40,
      generated: false,
    };
  });
  procedures.specTechnicalOpsOptions.mockResolvedValue({
    zones: ["Communication", "Prise de rendez-vous"],
    permissions: ["PM-reservation.creer", "PM-reservation.modifier"],
  });
  procedures.specTechnicalContract.mockResolvedValue({
    available: true,
    generator: { stackId: "ST-api", label: "TypeScript · oRPC", choice: "Node.js 22 · oRPC" },
    path: "packages/contract/src/prise-de-rendez-vous/reservation.ts",
    code: "export const reservationCancel = oc\n;\n",
    commitSha: SHA40,
  });
  procedures.specTechnicalNfrList.mockImplementation(async (input: unknown) =>
    requirementPage(requirements, (input ?? {}) as Input, requirementsTotal),
  );
}

const clientRow = <T extends { specId: string; filePath: string }>({
  specId,
  filePath: _path,
  ...rest
}: T) => ({ id: specId, ...rest });

/** Client et business : les mêmes lectures sans chemin ni version, vides tant que rien n'est validé. */
export function serveClientApi(available: boolean): void {
  const state = { available, validation: available ? "validated" : "to_validate" };
  procedures.clientSpaceTechnicalOps.mockImplementation(async (input: unknown) => {
    const rows = available ? OPERATIONS : [];
    const page = operationPage(rows, (input ?? {}) as Input, undefined);
    return { ...state, ...page, items: page.items.map(clientRow) };
  });
  procedures.clientSpaceTechnicalOp.mockImplementation(async (input: unknown) => {
    if (!available) return { ...state, operation: null };
    const { commitSha: _sha, ...detail } = operationDetail((input as { opId: string }).opId);
    return { ...state, operation: clientRow(detail) };
  });
  procedures.clientSpaceTechnicalNfr.mockImplementation(async (input: unknown) => {
    const rows = available ? REQUIREMENTS : [];
    const page = requirementPage(rows, (input ?? {}) as Input, undefined);
    return { ...state, ...page, items: page.items.map(clientRow) };
  });
}
