import { screen } from "@testing-library/react";
import { ArchitecturePage } from "../../src/components/architecture-page.tsx";
import { head, PROJECT_ID, serve } from "./features.tsx";
import { serveProposals } from "./proposals.tsx";
import { renderWithQuery } from "./render.tsx";
import { procedures, setUrl } from "./web-mocks.ts";

/** Faux serveur de l'architecture (contrat 3.9.0) : composants, document, avertissements, fiche, propositions. */
export { PROJECT_ID };
export const SHA40 = "a".repeat(40);

export const componentRow = (n: number, over: Record<string, unknown> = {}) => {
  const slug = `composant-${String(n).padStart(3, "0")}`;
  return {
    specId: `C-${slug}`,
    name: `Composant ${String(n).padStart(3, "0")}`,
    type: "service",
    zone: `Zone ${(n % 3) + 1}`,
    responsibility: `Responsabilité du composant ${n}.`,
    dependsOnCount: 1,
    decisions: ["ADR-001"],
    filePath: `architecture/components/${slug}.yaml`,
    ...over,
  };
};

export const COMPONENTS = [
  componentRow(1, {
    specId: "C-api",
    name: "API",
    type: "service",
    zone: "Prise de rendez-vous",
    responsibility: "Cœur du produit : règles métier, réservations, créneaux.",
    dependsOnCount: 3,
    decisions: ["ADR-001", "ADR-002"],
  }),
  componentRow(2, {
    specId: "C-web",
    name: "Application web",
    type: "app",
    zone: "Prise de rendez-vous",
    responsibility: "Réservation en ligne.",
    dependsOnCount: 1,
    decisions: [],
  }),
  componentRow(3, {
    specId: "C-sms",
    name: "Fournisseur SMS",
    type: "ext",
    zone: "Communication",
    responsibility: "Envoi des rappels.",
    dependsOnCount: 0,
    decisions: ["ADR-005"],
  }),
];

export const section = (
  num: number,
  slug: string,
  status: "validee" | "a_relire" | "brouillon" | "a_rediger",
  markdown = "",
) => ({
  specId: `DOC-${slug}`,
  slug,
  num,
  path: `architecture/overview/${String(num).padStart(2, "0")}-${slug}.md`,
  title: slug.charAt(0).toUpperCase() + slug.slice(1).replaceAll("-", " "),
  status,
  markdown,
  updatedAt: null,
  lastAuthor: null,
});

export const SECTIONS = [
  section(1, "contexte", "validee", "Le portail remplace le carnet papier."),
  section(
    2,
    "principes",
    "a_relire",
    "# Principes\nCes règles guident tous les choix :\n- un module ne lit jamais les tables d'un autre\n- seule l'API écrit en base",
  ),
  section(3, "deploiement", "brouillon", "Un environnement de recette et un de production."),
  section(4, "sauvegarde", "a_rediger"),
];

/** Fiche d'un composant (`spec.item.get`, type `component`) : la feuille de modification la relit. */
export const COMPONENT_DETAIL = {
  specId: "C-api",
  name: "API",
  type: "service",
  zone: "Prise de rendez-vous",
  responsibility: "Cœur du produit : règles métier, réservations, créneaux.",
  owns: ["T-reservation"],
  serves: ["F-001"],
  dependsOn: [{ to: "C-db", via: "SQL" }],
  decisions: ["ADR-001"],
  filePath: "architecture/components/api.yaml",
  commitSha: SHA40,
};

/** Zones du faux serveur (contrat 3.10.0) : « Prise de rendez-vous » (API, Application web) et « Communication » (SMS). */
export const ZONE_ENTRIES = [
  {
    id: "Z-prise-de-rendez-vous",
    name: "Prise de rendez-vous",
    icon: "event",
    componentCount: 2,
    actorCount: 1,
    preview: ["API", "Application web"],
    links: [{ to: "Z-communication", count: 1 }],
  },
  {
    id: "Z-communication",
    name: "Communication",
    icon: "notifications",
    componentCount: 1,
    actorCount: 0,
    preview: ["Fournisseur SMS"],
    links: [{ to: "Z-prise-de-rendez-vous", count: 1 }],
  },
];

export const ZONE_DETAILS: Record<string, unknown> = {
  "Z-prise-de-rendez-vous": {
    zone: {
      id: "Z-prise-de-rendez-vous",
      name: "Prise de rendez-vous",
      icon: "event",
      componentCount: 2,
    },
    components: [
      { specId: "C-api", name: "API", type: "service", responsibility: "Cœur du produit." },
      {
        specId: "C-web",
        name: "Application web",
        type: "app",
        responsibility: "Réservation en ligne.",
      },
    ],
    relations: [{ from: "C-web", to: "C-api", via: "HTTP" }],
    actors: [{ id: "RL-client", name: "Client" }],
    outgoing: [{ zone: "Z-communication", count: 1 }],
    truncated: false,
    commitSha: SHA40,
  },
  "Z-communication": {
    zone: {
      id: "Z-communication",
      name: "Communication",
      icon: "notifications",
      componentCount: 1,
    },
    components: [
      {
        specId: "C-sms",
        name: "Fournisseur SMS",
        type: "ext",
        responsibility: "Envoi des rappels.",
      },
    ],
    relations: [],
    actors: [],
    outgoing: [{ zone: "Z-prise-de-rendez-vous", count: 1 }],
    truncated: false,
    commitSha: SHA40,
  },
};

export const FLOW_ROWS = [
  {
    specId: "P-reserver",
    title: "Réserver un rendez-vous",
    actor: "Client",
    componentCount: 3,
    externalCount: 1,
  },
  {
    specId: "P-annuler",
    title: "Annuler ou déplacer",
    actor: "Client",
    componentCount: 2,
    externalCount: 0,
  },
];

export const FLOW_DETAIL = {
  specId: "P-reserver",
  title: "Réserver un rendez-vous",
  actor: "Client",
  participants: [
    { id: "RL-client", name: "Client", type: "actor" },
    { id: "C-web", name: "Application web", type: "app" },
    { id: "C-api", name: "API", type: "service" },
  ],
  items: [
    { kind: "message", from: "RL-client", to: "C-web", text: "Choisit un créneau" },
    { kind: "message", from: "C-web", to: "C-api", text: "reservation.create", reply: "Confirmée" },
    {
      kind: "alt",
      label: "sinon · créneau pris",
      messages: [{ from: "C-api", to: "C-web", text: "Conflit", error: "409" }],
    },
    { kind: "separator", label: "La veille à 18 h" },
  ],
  features: ["F-001"],
  rules: ["R-001"],
  decisions: ["ADR-003"],
  filePath: "architecture/flows/reserver.yaml",
  commitSha: SHA40,
};

/** Lectures du schéma et des flux (3.10.0) : zones, zone, recherche, positions, flux, YAML et Mermaid. */
export function serveSchema(
  options: { flows?: readonly unknown[]; positions?: Record<string, unknown> } = {},
): void {
  const flows = options.flows ?? FLOW_ROWS;
  procedures.specArchitectureZones.mockResolvedValue({
    zones: ZONE_ENTRIES,
    componentCount: 3,
    commitSha: SHA40,
  });
  procedures.specArchitectureZone.mockImplementation(async (input: unknown) => {
    const { zone } = input as { zone: string };
    return ZONE_DETAILS[zone];
  });
  procedures.specArchitectureSearch.mockResolvedValue({ items: [] });
  procedures.specArchitectureLayoutGet.mockResolvedValue({
    positions: options.positions ?? {},
    commitSha: SHA40,
  });
  procedures.specArchitectureLayoutSave.mockResolvedValue({ commitSha: SHA40 });
  procedures.specArchitectureFlowsList.mockResolvedValue({
    items: flows,
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: flows.length,
  });
  procedures.specArchitectureFlowsById.mockImplementation(async (input: unknown) => ({
    ...FLOW_DETAIL,
    specId: (input as { flowId: string }).flowId,
  }));
  procedures.specArchitectureSource.mockImplementation(async (input: unknown) => {
    const { target, format } = input as { target: { kind: string; id?: string }; format?: string };
    if (target.kind === "schema") {
      return {
        path: "architecture/schema.mmd",
        text: "flowchart TB\n",
        commitSha: SHA40,
        generated: true,
      };
    }
    if (target.kind === "flow" && format === "mermaid") {
      return {
        path: `architecture/flows/${target.id}.mmd`,
        text: "sequenceDiagram\n",
        commitSha: SHA40,
        generated: true,
      };
    }
    return {
      path: `architecture/${target.kind}s/${target.id}.yaml`,
      text: `id: ${target.id}\n`,
      commitSha: SHA40,
      generated: false,
    };
  });
}

type Row = ReturnType<typeof componentRow>;

interface Options {
  rows?: readonly Row[];
  sections?: ReturnType<typeof section>[];
  warnings?: Array<{ code: string; entityId: string; message: string }>;
  fail?: Error;
}

const matching = (rows: readonly Row[], q: unknown, zone: unknown): Row[] =>
  rows.filter(
    (row) =>
      (!zone || row.zone === zone) &&
      (!q ||
        row.name.toLowerCase().includes(String(q).toLowerCase()) ||
        row.specId.toLowerCase().includes(String(q).toLowerCase())),
  );

function pageStart(items: readonly Row[], input: Record<string, unknown>, size: number): number {
  if (input.cursor) return Number(input.cursor);
  if (!input.around) return 0;
  const at = items.findIndex((row) => row.specId === input.around);
  if (at === -1) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  return Math.floor(at / size) * size;
}

/** `spec.architecture.components.list` : recherche sur le nom et l'identifiant, filtre de zone, pages à curseur, `around`. */
export function serveComponents({ rows = COMPONENTS, fail }: Options = {}): void {
  procedures.specArchitectureComponentsList.mockImplementation(async (input: unknown) => {
    if (fail) throw fail;
    const args = (input ?? {}) as Record<string, unknown>;
    const size = Number(args.limit ?? 50);
    const items = matching(rows, args.q, args.zone);
    const from = pageStart(items, args, size);
    const zones: Record<string, number> = {};
    for (const row of rows) zones[row.zone] = (zones[row.zone] ?? 0) + 1;
    return {
      items: items.slice(from, from + size),
      nextCursor: from + size < items.length ? String(from + size) : null,
      previousCursor: from > 0 ? String(Math.max(0, from - size)) : null,
      offset: from,
      total: items.length,
      facets: { zone: zones },
    };
  });
}

export function serveArchitecture(
  role: Parameters<typeof serve>[0] = "owner",
  options: Options = {},
) {
  serve(role);
  const rows = options.rows ?? COMPONENTS;
  procedures.specHead.mockResolvedValue(
    head({
      counts: {
        features: 7,
        tables: 6,
        endpoints: 0,
        rules: 4,
        roles: 3,
        flows: 2,
        components: rows.length,
      },
    }),
  );
  serveComponents(options);
  serveSchema();
  procedures.specArchitectureDocument.mockResolvedValue({
    sections: options.sections ?? SECTIONS,
    commitSha: SHA40,
  });
  procedures.specArchitectureChecks.mockResolvedValue({ warnings: options.warnings ?? [] });
  const previous = procedures.specItemGet.getMockImplementation();
  procedures.specItemGet.mockImplementation(async (input) => {
    const { type, id } = input as { type?: string; id: string };
    if (type === "archflow") {
      return {
        type: "archflow",
        id,
        values: { ...FLOW_DETAIL, specId: id },
        validated: false,
        referencedBy: { items: [], total: 0 },
      };
    }
    if (type !== "component") return previous?.(input);
    return {
      type: "component",
      id,
      values: { ...COMPONENT_DETAIL, specId: id },
      validated: false,
      referencedBy: { items: [], total: 0 },
    };
  });
  procedures.reviewList.mockResolvedValue({ items: [], nextCursor: null });
  procedures.specDeliverables.mockResolvedValue({
    deliverables: [
      {
        key: "architecture",
        status: "pending",
        available: true,
        pendingProposals: 0,
        staleUpstream: [],
      },
    ],
    validatedCount: 2,
  });
  serveProposals([]);
}

/** `(max-width: 1023px)` seulement : la fenêtre « étroite » où l'écran s'ouvre sur Composants (B548). */
function setNarrow(narrow: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: narrow && query === "(max-width: 1023px)",
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * Écran Architecture à l'adresse donnée. Sans `tab=` ni `view=`, une fenêtre étroite : l'onglet par défaut est
 * Composants (les tests de TK-111) ; le bureau ouvre Schéma depuis TK-112 (`renderArchitecture({ wide: true })`).
 */
export function renderArchitecture({
  search = "",
  wide = false,
}: {
  search?: string;
  wide?: boolean;
} = {}) {
  setNarrow(!wide);
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  setUrl(`/projects/${PROJECT_ID}/spec/architecture${query}`);
  return renderWithQuery(<ArchitecturePage projectId={PROJECT_ID} />);
}

export const tabNamed = (name: RegExp | string): HTMLElement =>
  screen.getByRole("link", { name, hidden: true });
