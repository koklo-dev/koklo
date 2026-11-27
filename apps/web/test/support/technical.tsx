import { screen } from "@testing-library/react";
import { TechnicalPage } from "../../src/components/technical-page.tsx";
import { batch, NEW_SHA } from "./feature-form.tsx";
import { head, PROJECT_ID, serve } from "./features.tsx";
import { serveProposals } from "./proposals.tsx";
import { renderWithQuery } from "./render.tsx";
import {
  apiItem,
  type OPERATIONS,
  type REQUIREMENTS,
  serveClientApi,
  serveTechnicalApi,
} from "./technical-api.ts";
import { procedures, setUrl, specDeliverables } from "./web-mocks.ts";

/** Faux serveur du cahier technique (contrat 3.18.0) : choix, opérations, exigences, environnements, document, client. */
export { PROJECT_ID };
export const SHA40 = "a".repeat(40);

export const stackChoice = (specId: string, over: Record<string, unknown> = {}) => ({
  specId,
  role: "API",
  layer: "services",
  icon: "hub",
  status: "chosen",
  choice: "Node.js 22 · oRPC",
  components: ["C-api"],
  options: ["oRPC", "tRPC"],
  criteria: [{ label: "Contrat typé", values: ["Oui", "Oui"] }],
  why: "Contrat typé partagé avec les applications.",
  requirements: ["NFR-003"],
  decisions: ["ADR-002"],
  filePath: `tech/stack/${specId.slice(3)}.yaml`,
  ...over,
});

export const STACK = [
  stackChoice("ST-web", {
    role: "Applications web",
    layer: "applications",
    icon: "web",
    choice: "Next.js 15",
    components: ["C-portail", "C-backoffice", "C-admin"],
    options: ["Next.js", "Remix"],
    criteria: [{ label: "Rapidité", values: ["Très bonne", "Moyenne"] }],
  }),
  stackChoice("ST-api"),
  stackChoice("ST-sms", {
    role: "Fournisseur SMS",
    layer: "external",
    icon: "sms",
    status: "open",
    choice: undefined,
    recommended: "Brevo",
    components: ["C-sms"],
    options: ["Brevo", "Twilio", "OVHcloud SMS"],
    criteria: [
      { label: "Prix estimé par SMS", estimate: true, values: ["≈ 0,045 €", "≈ 0,07 €", "—"] },
      { label: "Données en UE", values: ["Oui", "Non par défaut", "Oui"] },
    ],
    why: "L'agent recommande Brevo : SMS et e-mail chez le même prestataire.",
    plain: "Le prestataire qui enverra les rappels SMS reste à choisir.",
    requirements: ["NFR-001"],
    decisions: ["ADR-006"],
  }),
];

export const environment = (specId: string, name: string, over: Record<string, unknown> = {}) => ({
  specId,
  name,
  address: `${name.toLowerCase()}.atelier-lumiere.fr`,
  hosting: "Scaleway · Paris",
  database: "PostgreSQL géré",
  data: "sample",
  deployment: "merge",
  access: "Équipe",
  extras: [],
  ...over,
});

export const ENVIRONMENTS = {
  environments: [
    environment("ENV-developpement", "Développement", {
      address: "localhost:3000",
      deployment: undefined,
      extras: [{ label: "SMS", value: "Simulés (journal)" }],
    }),
    environment("ENV-recette", "Recette", { data: "anonymized", access: "Équipe + client" }),
    environment("ENV-production", "Production", {
      data: "real",
      deployment: "version",
      extras: [{ label: "SMS", value: "Réels · fournisseur à trancher" }],
    }),
  ],
  variables: [
    { name: "DATABASE_URL", usage: "Connexion à la base" },
    { name: "SMS_API_KEY", usage: "Fournisseur SMS" },
  ],
  integrations: [
    { service: "Fournisseur SMS", usage: "Rappels (F-003)", status: "to_choose" },
    { service: "Fournisseur e-mail", usage: "Liens de connexion", status: "account_to_create" },
    { service: "Sentry", usage: "Erreurs et alertes", status: "configured" },
    { service: "GitHub", usage: "Dépôt de code", status: "connected" },
  ],
  commitSha: SHA40,
};

export const NO_ENVIRONMENTS = {
  environments: [],
  variables: [],
  integrations: [],
  commitSha: null,
};

export const techSection = (
  num: number,
  slug: string,
  status: "validee" | "a_relire" | "brouillon" | "a_rediger",
  markdown = "",
) => ({
  specId: `DOC-${slug}`,
  slug,
  num,
  path: `tech/cahier-technique/${String(num).padStart(2, "0")}-${slug}.md`,
  title: slug.charAt(0).toUpperCase() + slug.slice(1),
  status,
  markdown,
  updatedAt: null,
  lastAuthor: null,
});

export const TECH_SECTIONS = [
  techSection(1, "objet", "validee", "Ce cahier fixe les choix techniques."),
  techSection(2, "exploitation", "a_rediger"),
];

type Choice = ReturnType<typeof stackChoice>;

interface Options {
  choices?: readonly Choice[];
  environments?: Record<string, unknown>;
  sections?: readonly unknown[];
  counts?: Partial<Record<"stack" | "endpoints" | "nfr" | "environments", number>>;
  operations?: typeof OPERATIONS;
  requirements?: typeof REQUIREMENTS;
}

const facetsOf = (rows: readonly Choice[], key: "layer" | "status") => {
  const out: Record<string, number> = {};
  for (const row of rows) out[String(row[key])] = (out[String(row[key])] ?? 0) + 1;
  return out;
};

function stackPage(rows: readonly Choice[], input: Record<string, unknown>) {
  const q = typeof input.q === "string" ? input.q.toLowerCase() : "";
  const items = rows.filter((row) => !q || `${row.role} ${row.specId}`.toLowerCase().includes(q));
  const size = Number(input.limit ?? 24);
  const at = input.around ? items.findIndex((row) => row.specId === input.around) : -1;
  const from = input.cursor ? Number(input.cursor) : at > 0 ? Math.floor(at / size) * size : 0;
  return {
    items: items.slice(from, from + size),
    nextCursor: from + size < items.length ? String(from + size) : null,
    previousCursor: from > 0 ? String(Math.max(0, from - size)) : null,
    offset: from,
    total: items.length,
    facets: { layer: facetsOf(items, "layer"), status: facetsOf(items, "status") },
  };
}

/** Fiche d'un choix ou d'un environnement (`spec.item.get`). */
function serveItems(choices: readonly Choice[], environments: typeof ENVIRONMENTS): void {
  procedures.specItemGet.mockImplementation(async (input: unknown) => {
    const { type, id } = input as { type: string; id: string };
    if (type === "operation" || type === "nfr") return apiItem(type, id);
    const found =
      type === "stack"
        ? choices.find((row) => row.specId === id)
        : environments.environments.find((row) => row.specId === id);
    return {
      type,
      id,
      values: {
        ...found,
        filePath: type === "stack" ? `tech/stack/${id.slice(3)}.yaml` : "tech/environments.yaml",
        commitSha: SHA40,
      },
      validated: false,
      referencedBy: { items: [], total: 0 },
    };
  });
}

/** Installe le faux serveur de la page Technique pour un rôle. */
export function serveTechnical(
  role: Parameters<typeof serve>[0] = "owner",
  options: Options = {},
): void {
  const choices = options.choices ?? STACK;
  const environments = (options.environments ?? ENVIRONMENTS) as typeof ENVIRONMENTS;
  serve(role);
  serveProposals([]);
  procedures.specDeliverables.mockResolvedValue(
    specDeliverables({
      open: new Set(["functional", "data", "architecture", "technical", "design"]),
      validated: ["functional", "data", "architecture"],
      status: { technical: choices.length > 0 ? "pending" : "todo" },
    }),
  );
  procedures.specHead.mockResolvedValue(
    head({
      counts: {
        features: 3,
        tables: 2,
        endpoints: 132,
        rules: 4,
        roles: 3,
        flows: 2,
        components: 3,
        stack: choices.length,
        nfr: 28,
        environments: environments.environments.length,
        ...options.counts,
      },
    }),
  );
  procedures.specTechnicalStackList.mockImplementation(async (input: unknown) =>
    stackPage(choices, (input ?? {}) as Record<string, unknown>),
  );
  procedures.specTechnicalStackSource.mockImplementation(async (input: unknown) => {
    const { id } = input as { id: string };
    return {
      path: `tech/stack/${id.slice(3)}.yaml`,
      text: `id: ${id}\nrole: Fournisseur SMS\n`,
      commitSha: SHA40,
      generated: false,
    };
  });
  procedures.specTechnicalEnvironments.mockResolvedValue(environments);
  procedures.specDocumentSections.mockResolvedValue({
    sections: options.sections ?? TECH_SECTIONS,
    commitSha: SHA40,
  });
  serveItems(choices, environments);
  serveTechnicalApi(options);
  procedures.commentList.mockResolvedValue({ items: [], nextCursor: null });
  procedures.reviewList.mockResolvedValue({ items: [], nextCursor: null });
}

/** Vue client : cahier validé (ou non), mêmes données sans chemin ni `specId`. */
export function serveClientTechnical(
  role: "client" | "business" = "client",
  options: { available?: boolean } = {},
): void {
  const available = options.available ?? true;
  serveTechnical(role);
  const state = { available, validation: available ? "validated" : "to_validate" };
  procedures.clientSpaceTechnical.mockResolvedValue({
    ...state,
    counts: available
      ? { choices: 24, operations: 132, requirements: 28, environments: 3 }
      : { choices: 0, operations: 0, requirements: 0, environments: 0 },
  });
  const items = available
    ? STACK.map(({ specId, filePath: _path, ...rest }) => ({ id: specId, ...rest }))
    : [];
  procedures.clientSpaceTechnicalStack.mockResolvedValue({
    ...state,
    items,
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: items.length,
    facets: { layer: facetsOf(STACK, "layer"), status: facetsOf(STACK, "status") },
  });
  const { commitSha: _sha, ...content } = available ? ENVIRONMENTS : NO_ENVIRONMENTS;
  procedures.clientSpaceTechnicalEnvironments.mockResolvedValue({ ...state, ...content });
  procedures.clientSpaceTechnicalDocument.mockResolvedValue({
    ...state,
    sections: available
      ? TECH_SECTIONS.map(({ specId, num, title, status, markdown }) => ({
          specId,
          num,
          title,
          status,
          markdown,
        }))
      : [],
  });
  procedures.commentCreate.mockResolvedValue({ id: "c1" });
  serveClientApi(available);
}

/** Le prochain enregistrement est écrit puis indexé : la tête passe à la nouvelle version. */
export function commitOnSubmit(procedure: typeof procedures.specBatchSubmit): void {
  procedure.mockImplementation(async () => {
    const counts = { features: 3, tables: 2, endpoints: 132, rules: 4, roles: 3, flows: 2 };
    procedures.specHead.mockResolvedValue(
      head({
        commitSha: NEW_SHA,
        counts: { ...counts, stack: 3, nfr: 28, environments: 3 },
      }),
    );
    return batch({ status: "committed" });
  });
}

export function renderTechnical({ search = "" }: { search?: string } = {}) {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  setUrl(`/projects/${PROJECT_ID}/spec/technical${query}`);
  return renderWithQuery(<TechnicalPage projectId={PROJECT_ID} />);
}

export const technicalHeading = () =>
  screen.findByRole("heading", { level: 1, name: "Cahier technique" });
