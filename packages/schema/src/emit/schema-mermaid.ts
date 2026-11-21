import type { Component } from "../entities/index.ts";
import { compare } from "../issue.ts";
import { mermaidId, mermaidText } from "./mermaid-text.ts";

const HEADER = "%% Généré par koklo depuis architecture/components : ne pas modifier à la main.";

const node = (component: Component): string => {
  const suffix = component.type === "ext" ? ":::ext" : "";
  return `${mermaidId(component.id)}["${mermaidText(component.nom)}"]${suffix}`;
};

function edges(components: readonly Component[]): string[] {
  const known = new Set(components.map((component) => component.id));
  return components.flatMap((component) =>
    component.depend_de
      .filter((dependency) => known.has(dependency.vers))
      .map((dependency) => {
        const arrow = dependency.mode === "asynchrone" ? "-.->" : "-->";
        const label = `|"${mermaidText(dependency.via)}"|`;
        return `  ${mermaidId(component.id)} ${arrow}${label} ${mermaidId(dependency.vers)}`;
      }),
  );
}

/**
 * Composants -> `architecture/schema.mmd` : `flowchart` déterministe (composants triés par identifiant, un sous-graphe
 * par zone triée, flèche pleine synchrone, pointillée asynchrone, externes en tirets). Pure, sans I/O ; tout texte
 * est échappé (`mermaidText`). Une dépendance vers un composant absent est omise.
 */
export function emitSchemaMermaid(components: readonly Component[]): string {
  const sorted = [...components].sort((a, b) => compare(a.id, b.id));
  const zones = [...new Set(sorted.map((component) => component.zone))].sort(compare);
  const groups = zones.flatMap((zone, i) => [
    `  subgraph zone_${i + 1}["${mermaidText(zone)}"]`,
    ...sorted
      .filter((component) => component.zone === zone)
      .map((component) => `    ${node(component)}`),
    "  end",
  ]);
  const hasExternal = sorted.some((component) => component.type === "ext");
  const lines = [
    HEADER,
    "flowchart LR",
    ...groups,
    ...edges(sorted),
    ...(hasExternal ? ["  classDef ext stroke-dasharray: 4 3"] : []),
  ];
  return `${lines.join("\n")}\n`;
}
