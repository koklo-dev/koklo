import type { Prisma } from "@koklo/db";

/**
 * Opérations du cahier technique parmi les entités `endpoint` de l'index (B720, B772) : un nom `zone.verbe` et un composant.
 * L'ancien format REST, indexé sous le même genre, n'a pas de composant.
 */
export const OPERATIONS_ONLY: Prisma.SpecEntityWhereInput[] = [
  { specId: { contains: "." } },
  { data: { path: ["composant"], string_starts_with: "C-" } },
];
