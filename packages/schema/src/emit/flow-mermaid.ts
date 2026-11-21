import type { ArchFlow } from "../entities/index.ts";
import { mermaidId, mermaidText } from "./mermaid-text.ts";

type Item = ArchFlow["messages"][number];
type Message = Extract<Item, { de: string }>;

function messageLines(message: Message, indent: string): string[] {
  const from = mermaidId(message.de);
  const to = mermaidId(message.vers);
  return [
    `${indent}${from}->>${to}: ${mermaidText(message.texte)}`,
    ...(message.retour === undefined
      ? []
      : [`${indent}${to}-->>${from}: ${mermaidText(message.retour)}`]),
    ...(message.erreur === undefined
      ? []
      : [`${indent}${to}--x${from}: ${mermaidText(message.erreur)}`]),
  ];
}

/**
 * Flux technique -> `architecture/flows/<P-id>.mmd` : `sequenceDiagram` déterministe (participants et messages dans
 * l'ordre du fichier). `labels` donne le nom lisible d'un participant (composant ou acteur), à défaut son identifiant.
 * Un séparateur devient une note sur toute la largeur. Pure, sans I/O ; tout texte est échappé (`mermaidText`).
 */
export function emitFlowMermaid(
  flow: ArchFlow,
  labels: Readonly<Record<string, string>> = {},
): string {
  const first = mermaidId(flow.participants[0] ?? "");
  const last = mermaidId(flow.participants[flow.participants.length - 1] ?? "");
  const span = first === last ? first : `${first},${last}`;
  const body = flow.messages.flatMap((item): string[] => {
    if (!("bloc" in item)) return messageLines(item, "  ");
    if (item.bloc === "separateur") return [`  Note over ${span}: ${mermaidText(item.libelle)}`];
    return [
      `  alt ${mermaidText(item.libelle)}`,
      ...item.messages.flatMap((message) => messageLines(message, "    ")),
      "  end",
    ];
  });
  const lines = [
    `%% Généré par koklo depuis architecture/flows/${flow.id}.yaml : ne pas modifier à la main.`,
    "sequenceDiagram",
    ...flow.participants.map(
      (id) =>
        `  participant ${mermaidId(id)} as ${mermaidText(labels[id] ?? "") || mermaidText(id)}`,
    ),
    ...body,
  ];
  return `${lines.join("\n")}\n`;
}
