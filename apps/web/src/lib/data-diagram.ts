import type { DiagramRelation, ErFieldKind, ErTableField } from "@koklo/ui";
import type { DiagramCard, DiagramLink } from "./data-mermaid.ts";
import { tableRefOf } from "./proposal-data.ts";

type Decision = "pending" | "accepted" | "rejected";

/** Contenu d'une proposition `table` (B397) : seuls les champs lus par le diagramme. */
export interface ProposedTable {
  name: string;
  description?: string | undefined;
  fields: ReadonlyArray<{
    name: string;
    type: string;
    primaryKey?: boolean | undefined;
    personalData?: boolean | undefined;
  }>;
  relations?: ReadonlyArray<{ to: string; cardinality: string }> | undefined;
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
    ...(table.description ? { description: table.description } : {}),
    ...(table.relations?.length ? { relations: table.relations } : {}),
    ...(decision === "pending"
      ? { state: "review" as const }
      : decision === "rejected"
        ? { state: "rejected" as const }
        : {}),
  };
}

const relationOf = (
  id: string,
  from: string,
  to: string,
  cardinality: string,
): DiagramRelation => ({
  id,
  from,
  to,
  label: cardinality,
  dashed: cardinality === "n ↔ n",
});

/**
 * Traits du diagramme : les relations du modèle enregistré et celles des tables proposées (B420). Un trait n'existe que
 * si ses deux tables sont affichées ; une table rejetée n'a plus de relation (elle n'entrera pas dans le modèle).
 */
export function relationsOf(
  links: readonly DiagramLink[],
  cards: readonly DiagramCard[],
): DiagramRelation[] {
  const shown = new Set(cards.filter((card) => card.state !== "rejected").map((card) => card.id));
  const proposed = cards.flatMap((card) =>
    (card.relations ?? []).map((relation, index) => ({
      id: `${card.id}>${relation.to}>${index}`,
      from: card.id,
      to: relation.to,
      cardinality: relation.cardinality,
    })),
  );
  return [...links, ...proposed]
    .filter((link) => shown.has(link.from) && shown.has(link.to))
    .map((link) => relationOf(link.id, link.from, link.to, link.cardinality));
}
