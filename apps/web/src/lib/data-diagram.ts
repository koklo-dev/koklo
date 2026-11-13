import type { DiagramRelation, ErFieldKind, ErTableField } from "@koklo/ui";
import type { DiagramCard, DiagramLink } from "./data-mermaid.ts";
import { tableRefOf } from "./proposal-data.ts";

type Decision = "pending" | "accepted" | "rejected";

/** Contenu d'une proposition `table` (B397) : seuls les champs lus par le diagramme. */
export interface ProposedTable {
  name: string;
  zone?: string | undefined;
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

const REF = /^ref\((T-[a-z0-9-]+)\)$/;

/** Relations déclarées, puis une `n → 1` par clé `ref(T-…)` vers une table pas encore reliée (B476, comme le Mermaid). */
function proposedRelations(id: string, table: ProposedTable) {
  const declared = [...(table.relations ?? [])];
  const linked = new Set(declared.map((relation) => relation.to));
  for (const field of table.fields) {
    const target = REF.exec(field.type)?.[1];
    if (target === undefined || target === id || linked.has(target)) continue;
    linked.add(target);
    declared.push({ to: target, cardinality: "n → 1" });
  }
  return declared;
}

/** Carte d'une table proposée : à relire en pointillés, rejetée estompée, acceptée comme une table enregistrée. */
export function proposedTableOf(table: ProposedTable, decision: Decision): DiagramCard {
  const fields: ErTableField[] = table.fields.map((field) => ({
    name: field.name,
    type: field.type,
    kind: kindOf(field),
  }));
  const id = tableRefOf(table.name);
  const relations = proposedRelations(id, table);
  return {
    id,
    name: table.name,
    fields,
    ...(table.zone ? { zone: table.zone } : {}),
    ...(table.description ? { description: table.description } : {}),
    ...(relations.length ? { relations } : {}),
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
