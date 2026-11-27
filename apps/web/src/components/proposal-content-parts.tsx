import { ProposalDetailSection, ProposalDetailText } from "@koklo/ui";

/** Lecture d'une charge de proposition : valeurs vérifiées et rubriques en nœuds texte seulement (sortie du modèle). */
export type Content = Record<string, unknown>;

export const text = (value: unknown): string => (typeof value === "string" ? value : "");

export const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");

export const records = (value: unknown): Content[] =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Content => typeof item === "object" && item !== null,
  );

/** Rubrique titrée ; absente quand la valeur est vide. */
export function Block({ title, value }: { title: string; value: string }) {
  if (!value) return null;
  return (
    <ProposalDetailSection title={title} variant="label">
      <ProposalDetailText>{value}</ProposalDetailText>
    </ProposalDetailSection>
  );
}
