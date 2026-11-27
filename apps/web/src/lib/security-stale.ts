import type { SpecDeliverable } from "@koklo/contract";

export type SecurityUpstream = NonNullable<SpecDeliverable["staleSecurity"]>;
export type StaleChange = SecurityUpstream["changes"][number];

/** Table (`T-`) ou opération (`zone.verbe`) : accord au féminin. */
const FEMININE = [/^T-/, /\./];
const WORDS = { added: "ajouté", changed: "modifié", removed: "retiré" } as const;

/** « ST-sms modifié, client.export ajoutée. » */
export function staleListText(changes: readonly StaleChange[]): string {
  const parts = changes.map(({ id, change }) => {
    const feminine = FEMININE.some((pattern) => pattern.test(id));
    return `${id} ${WORDS[change]}${feminine ? "e" : ""}`;
  });
  return parts.length > 0 ? `${parts.join(", ")}.` : "";
}
