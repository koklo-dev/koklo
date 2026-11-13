import { serve } from "./features.tsx";
import { procedures } from "./web-mocks.ts";

/** Faux serveur du modèle de données validé, vu du client (contrat 3.7.0, `clientSpace.data*`). */
export const clientTable = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  zone: "Prise de rendez-vous",
  description: `Description de ${name}.`,
  fields: [
    { name: "id", type: "uuid", primaryKey: true, personalData: false },
    { name: "nom", type: "texte(80)", primaryKey: false, personalData: false },
  ],
  relations: [],
  usedBy: [{ id: "F-001", label: "Réserver un créneau" }],
  clientSummary: [],
  ...over,
});

export const CLIENT_TABLES = [
  clientTable("T-client", "Client", {
    zone: "Clients et fidélité",
    description: "La personne qui réserve.",
    fields: [
      { name: "id", type: "uuid", primaryKey: true, personalData: false },
      { name: "telephone", type: "texte(20)", primaryKey: false, personalData: true },
    ],
    usedBy: [
      { id: "F-001", label: "Réserver un créneau" },
      { id: "R-004", label: "Un créneau n'est réservé qu'une fois" },
    ],
    clientSummary: ["Le nom du client", "Son numéro de téléphone"],
  }),
  clientTable("T-reservation", "Réservation", {
    relations: [{ to: "T-client", toName: "Client", cardinality: "n → 1" }],
  }),
  clientTable("T-service", "Service", { usedBy: [] }),
];

export const CLIENT_FIXTURES = [
  { specId: "FX-clients", title: "Clients", table: "T-client", locale: "fr-FR", rowCount: 2 },
];

export interface ClientDataOptions {
  /** Faux : le modèle n'est pas validé (ou à revoir) : aucune table. */
  available?: boolean;
  tables?: ReadonlyArray<ReturnType<typeof clientTable>>;
}

export function serveClientData(
  role: "client" | "business" = "client",
  { available = true, tables = CLIENT_TABLES }: ClientDataOptions = {},
): void {
  serve(role);
  procedures.clientSpaceDataModel.mockResolvedValue({
    available,
    validation: available ? "validated" : "to_validate",
    truncated: false,
    items: available ? tables : [],
    positions: {},
  });
  procedures.clientSpaceDataFixtures.mockResolvedValue({ items: available ? CLIENT_FIXTURES : [] });
  procedures.clientSpaceDataFixtureRows.mockResolvedValue({
    items: [
      { nom: "Awa", telephone: "0600000001" },
      { nom: "Moussa", telephone: "0600000002" },
    ],
    columns: ["nom", "telephone"],
    total: 2,
    totalIsEstimate: false,
  });
  procedures.commentCreate.mockResolvedValue({ id: "c1" });
}
