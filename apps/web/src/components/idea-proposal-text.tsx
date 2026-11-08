import { Prose } from "@koklo/ui";
import type { ReactNode } from "react";

const HEADING = /^#{1,6}\s+(.*)$/;
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;

function block(text: string, index: number): ReactNode {
  const lines = text.split("\n");
  const heading = lines.length === 1 ? HEADING.exec(lines[0] ?? "") : null;
  if (heading) {
    return <h3 key={index}>{heading[1]}</h3>;
  }
  const items = lines.map((line) => ITEM.exec(line)?.[1]);
  if (items.every((item) => item !== undefined)) {
    return (
      <ul key={index}>
        {items.map((item, position) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: liste statique, jamais réordonnée
          <li key={position}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p key={index} className="whitespace-pre-wrap">
      {text}
    </p>
  );
}

/**
 * Proposition de l'agent rendue en TEXTE littéral (C2b, B223) : titres, listes et paragraphes reconnus par leur
 * marqueur, tout le reste affiché tel quel. Jamais de balise, de lien actif ni d'image : un contenu hostile reste
 * lisible mais inerte, et rien de ce rendu n'entre dans la page avant « Accepter ».
 */
export function ProposalText({ markdown }: { markdown: string }) {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean);
  return <Prose className="gap-2.5 [&_h3]:mt-0">{blocks.map(block)}</Prose>;
}
