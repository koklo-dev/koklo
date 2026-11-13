import {
  type DiagramNode,
  type DiagramRelation,
  type ErTableField,
  erTableHeight,
} from "@koklo/ui";

/** Tables fictives de la planche « Prise de rendez-vous » (maquette 11 l.376-383) : aucune donnée réelle. */
export interface DevUiTable extends DiagramNode {
  fields: readonly ErTableField[];
  state?: "review" | "rejected";
}

const ID: ErTableField = { name: "id", type: "uuid", kind: "primary" };

function table(
  id: string,
  name: string,
  fields: readonly ErTableField[],
  state?: "review" | "rejected",
): DevUiTable {
  const node: DevUiTable = { id, name, width: 230, height: erTableHeight(fields.length), fields };
  return state ? { ...node, state } : node;
}

const CLIENT_FIELDS: readonly ErTableField[] = [
  ID,
  { name: "nom", type: "texte(100)", kind: "personal" },
  { name: "telephone", type: "texte(20)", kind: "personal" },
  { name: "email", type: "texte(254)", kind: "personal" },
  { name: "consentement_sms", type: "booléen" },
];

export const DEV_UI_TABLES: readonly DevUiTable[] = [
  table("T-client", "Client", CLIENT_FIELDS),
  table("T-reservation", "Réservation", [
    ID,
    { name: "client_id", type: "ref(T-client)", kind: "reference" },
    { name: "creneau_id", type: "ref(T-creneau)", kind: "reference" },
    { name: "service_id", type: "ref(T-service)", kind: "reference" },
    { name: "statut", type: "enum" },
    { name: "jeton_lien", type: "texte(64)" },
  ]),
  table("T-service", "Service", [
    ID,
    { name: "nom", type: "texte(80)" },
    { name: "duree_min", type: "entier" },
    { name: "prix", type: "décimal" },
  ]),
  table("T-creneau", "Créneau", [
    ID,
    { name: "employe_id", type: "ref(T-employe)", kind: "reference" },
    { name: "debut", type: "horodatage" },
    { name: "fin", type: "horodatage" },
    { name: "statut", type: "enum" },
  ]),
  table("T-employe", "Employé", [
    ID,
    { name: "nom", type: "texte(100)", kind: "personal" },
    { name: "actif", type: "booléen" },
  ]),
  table(
    "T-rappel",
    "Rappel SMS",
    [
      ID,
      { name: "reservation_id", type: "ref(T-reservation)", kind: "reference" },
      { name: "envoye_le", type: "horodatage" },
      { name: "statut", type: "enum" },
    ],
    "review",
  ),
  table("T-avis", "Avis", [ID, { name: "note", type: "entier" }], "rejected"),
];

export const DEV_UI_RELATIONS: readonly DiagramRelation[] = [
  { id: "r1", from: "T-client", to: "T-reservation", label: "1 → n" },
  { id: "r2", from: "T-service", to: "T-reservation", label: "1 → n" },
  { id: "r3", from: "T-creneau", to: "T-reservation", label: "1 → 0..1" },
  { id: "r4", from: "T-reservation", to: "T-rappel", label: "1 → n" },
  { id: "r5", from: "T-employe", to: "T-creneau", label: "1 → n" },
  { id: "r6", from: "T-employe", to: "T-service", label: "n ↔ n", dashed: true },
];

/** Même diagramme sans les deux tables d'état : le deuxième lecteur ne répète pas les pastilles. */
export const DEV_UI_TABLES_SAVED = DEV_UI_TABLES.filter((t) => !t.state);
export const DEV_UI_RELATIONS_SAVED = DEV_UI_RELATIONS.filter(
  (r) => r.from !== "T-rappel" && r.to !== "T-rappel",
);
