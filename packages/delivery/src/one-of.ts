/** Garde de type partagée : la valeur appartient-elle à la liste fermée ? */
export const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);
