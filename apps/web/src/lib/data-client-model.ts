import type { ClientDataTable } from "@koklo/contract";
import type { DiagramRelation, ErFieldKind } from "@koklo/ui";
import { relationsOf } from "./data-diagram.ts";
import type { DiagramCard, DiagramLink } from "./data-mermaid.ts";

const kindOf = (field: ClientDataTable["fields"][number]): ErFieldKind => {
  if (field.primaryKey) return "primary";
  if (field.personalData) return "personal";
  return field.type.startsWith("ref(") ? "reference" : "plain";
};

/** Cartes du diagramme d'après les tables que le serveur montre au client. */
export const clientCardsOf = (items: readonly ClientDataTable[]): DiagramCard[] =>
  items.map((table) => ({
    id: table.id,
    name: table.name,
    fields: table.fields.map((field) => ({
      name: field.name,
      type: field.type,
      kind: kindOf(field),
    })),
  }));

/** Traits du diagramme : les relations déclarées par chaque table (un trait n'existe que si ses deux tables sont là). */
export function clientRelationsOf(items: readonly ClientDataTable[]): DiagramRelation[] {
  const links: DiagramLink[] = items.flatMap((table) =>
    table.relations.map((relation, index) => ({
      id: `${table.id}>${relation.to}>${index}`,
      from: table.id,
      to: relation.to,
      cardinality: relation.cardinality,
    })),
  );
  return relationsOf(links, clientCardsOf(items));
}
