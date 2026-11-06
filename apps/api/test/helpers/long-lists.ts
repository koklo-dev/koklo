import { seedLarge } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import { createWorld, type World } from "./tickets.ts";

/**
 * Monde de test des listes longues (TK-94) : une organisation, son projet le plus ancien et, dedans,
 * le jeu `seed:large` (1 000 fonctionnalités, 80 tables, 500 tickets, sprint actif). La requête
 * passe par la vraie fonction du seed : le test et la mesure de performance lisent les mêmes données.
 */
export async function volumeWorld(database: TestDatabase): Promise<World> {
  const world = await createWorld(database);
  await seedLarge(database.url, {
    target: { organizationId: world.organizationId, projectId: world.projectId },
  });
  return world;
}

/** Identifiants `F-nnn` d'une page, dans l'ordre reçu. */
export const specIds = (body: { items: { specId: string }[] }): string[] =>
  body.items.map((item) => item.specId);

/** Clés `TK-n` d'une page, dans l'ordre reçu. */
export const ticketKeys = (body: { items: { key: string }[] }): string[] =>
  body.items.map((item) => item.key);

/** `F-001` à `F-nnn` : la plage attendue d'une page numérique. */
export const featureRange = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `F-${String(from + i).padStart(3, "0")}`);

export const ticketRange = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `TK-${from + i}`);
