import { ArchitecturePage } from "../../src/components/architecture-page.tsx";
import { PROJECT_ID, SHA40 } from "./architecture.tsx";
import { serve } from "./features.tsx";
import { renderWithQuery } from "./render.tsx";
import { procedures, setUrl } from "./web-mocks.ts";

/** Faux serveur de l'architecture validée, vue du client et du business (contrat 3.11.0, `clientSpace.architecture*`). */
export { PROJECT_ID, SHA40 };

export const CLIENT_COMPONENTS = [
  {
    id: "C-api",
    name: "API",
    type: "service",
    zone: "Prise de rendez-vous",
    summary: ["Gère les réservations et les créneaux."],
    serves: [{ id: "F-001", label: "Réserver un créneau" }],
    dependsOn: [{ id: "C-db", name: "Base de données", via: "SQL" }],
  },
  {
    id: "C-db",
    name: "Base de données",
    type: "store",
    zone: "Prise de rendez-vous",
    summary: [],
    serves: [],
    dependsOn: [],
  },
];

export const CLIENT_ADRS = [
  {
    id: "ADR-003",
    title: "Un seul composant écrit en base",
    status: "acceptee",
    date: "2026-10-03",
  },
  { id: "ADR-001", title: "Base PostgreSQL", status: "remplacee", date: "2026-09-01" },
];

export const CLIENT_ADR = {
  id: "ADR-003",
  title: "Un seul composant écrit en base",
  status: "acceptee",
  date: "2026-10-03",
  deciders: ["Moussa"],
  context: "Plusieurs composants pourraient écrire en base.",
  decision: "Seule l'API écrit en base.",
  consequences: { positive: ["Un seul point de contrôle."], toAccept: ["L'API est un goulot."] },
  alternatives: [{ name: "Écriture partout", reason: "Règles dispersées" }],
  plain: "Un seul endroit s'occupe d'enregistrer les données.",
};

export const CLIENT_FLOWS = [
  {
    specId: "P-reserver",
    title: "Réserver un rendez-vous",
    actor: "Client",
    componentCount: 2,
    externalCount: 0,
  },
];

export const CLIENT_FLOW = {
  specId: "P-reserver",
  title: "Réserver un rendez-vous",
  actor: "Client",
  participants: [
    { id: "RL-client", name: "Client", type: "actor" },
    { id: "C-api", name: "API", type: "service" },
  ],
  items: [{ kind: "message", from: "RL-client", to: "C-api", text: "Choisit un créneau" }],
  features: [],
  rules: [],
};

const page = (items: readonly unknown[]) => ({
  items,
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: items.length,
});

export function serveClientArchitecture(
  role: "client" | "business" = "client",
  { available = true }: { available?: boolean } = {},
): void {
  serve(role);
  const validation = available ? "validated" : "to_validate";
  procedures.clientSpaceArchitecture.mockResolvedValue({
    available,
    validation,
    truncated: false,
    items: available ? CLIENT_COMPONENTS : [],
    positions: {},
  });
  procedures.clientSpaceAdrs.mockResolvedValue({
    ...page(available ? CLIENT_ADRS : []),
    available,
    validation,
  });
  procedures.clientSpaceAdr.mockResolvedValue(CLIENT_ADR);
  procedures.clientSpaceArchFlows.mockResolvedValue({
    ...page(available ? CLIENT_FLOWS : []),
    available,
    validation,
  });
  procedures.clientSpaceArchFlow.mockResolvedValue(CLIENT_FLOW);
  procedures.commentCreate.mockResolvedValue({ id: "c1" });
}

export function renderClientArchitecture(search = "") {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  setUrl(`/projects/${PROJECT_ID}/spec/architecture${query}`);
  return renderWithQuery(<ArchitecturePage projectId={PROJECT_ID} />);
}
