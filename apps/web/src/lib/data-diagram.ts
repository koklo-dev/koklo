import type { ErFieldKind, ErTableField } from "@koklo/ui";
import type { DiagramCard } from "./data-mermaid.ts";
import { tableRefOf } from "./proposal-data.ts";

type Decision = "pending" | "accepted" | "rejected";

/** Contenu d'une proposition `table` (B397) : seuls les champs lus par le diagramme. */
export interface ProposedTable {
  name: string;
  fields: ReadonlyArray<{
    name: string;
    type: string;
    primaryKey?: boolean | undefined;
    personalData?: boolean | undefined;
  }>;
}

function kindOf(field: ProposedTable["fields"][number]): ErFieldKind {
  if (field.primaryKey) return "primary";
  if (field.type.startsWith("ref(")) return "reference";
  return field.personalData ? "personal" : "plain";
}

/** Carte d'une table proposée : à relire en pointillés, rejetée estompée, acceptée comme une table enregistrée. */
export function proposedTableOf(table: ProposedTable, decision: Decision): DiagramCard {
  const fields: ErTableField[] = table.fields.map((field) => ({
    name: field.name,
    type: field.type,
    kind: kindOf(field),
  }));
  return {
    id: tableRefOf(table.name),
    name: table.name,
    fields,
    ...(decision === "pending"
      ? { state: "review" as const }
      : decision === "rejected"
        ? { state: "rejected" as const }
        : {}),
  };
}
