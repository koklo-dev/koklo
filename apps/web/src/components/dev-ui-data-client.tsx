"use client";

import type { ClientDataTable } from "@koklo/contract";
import { InlineAlert } from "@koklo/ui";
import { READONLY_COMMENT_TEXT, READONLY_LEAD } from "../lib/data-client-labels.ts";
import { DataClientFiche } from "./data-client-fiche.tsx";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";

const noop = () => undefined;

const CLIENT: ClientDataTable = {
  id: "T-client",
  name: "Client",
  zone: "Clients et fidélité",
  description: "La personne qui réserve une prestation.",
  fields: [
    { name: "id", type: "uuid", primaryKey: true, personalData: false },
    { name: "telephone", type: "texte(20)", primaryKey: false, personalData: true },
  ],
  relations: [],
  usedBy: [
    { id: "F-001", label: "Réserver un créneau" },
    { id: "R-004", label: "Un créneau n'est réservé qu'une fois" },
  ],
  clientSummary: ["Le nom du client", "Son numéro de téléphone", "Ses réservations passées"],
};

const LINKS = [{ id: "r0", from: "T-reservation", to: "T-client", label: "n → 1" }];
const nameOf = (id: string): string => (id === "T-client" ? "Client" : "Réservation");

/** Section « 22. Vue client des Données » de la galerie (TK-109, DESIGN.md §5.20) : bandeau « Lecture seule » et fiche. */
export function DevUiDataClient() {
  return (
    <DevUiSection id="dev-ui-data-client" title="22. Vue client des Données">
      <DevUiFrame title="InlineAlert readonly : bandeau « Lecture seule » (role=note)" wide>
        <InlineAlert variant="readonly" icon="visibility" className="text-meta">
          <strong className="font-semibold">{READONLY_LEAD}</strong> {READONLY_COMMENT_TEXT}
        </InlineAlert>
      </DevUiFrame>
      <DevUiFrame title="DataClientFiche : « Ce qu'on enregistre », Relations, Utilisée par, « Commenter »">
        <DataClientFiche table={CLIENT} links={LINKS} nameOf={nameOf} onComment={noop} />
      </DevUiFrame>
    </DevUiSection>
  );
}
