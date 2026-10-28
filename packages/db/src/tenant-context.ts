import { AsyncLocalStorage } from "node:async_hooks";

/** Aucun contexte d'organisation actif (ou identifiant invalide) pour une opération multi-tenant. */
export class MissingOrganizationContextError extends Error {
  override readonly name = "MissingOrganizationContextError";
}

/** Une écriture vise une organisation différente de celle du contexte. */
export class OrganizationMismatchError extends Error {
  override readonly name = "OrganizationMismatchError";
}

/** Requête SQL brute refusée sur le client multi-tenant (elle contournerait le filtre). */
export class RawQueryNotAllowedError extends Error {
  override readonly name = "RawQueryNotAllowedError";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storage = new AsyncLocalStorage<string>();

/** Exécute `fn` dans le contexte de l'organisation : toute requête multi-tenant en dérive son filtre. */
export async function withOrganization<T>(
  organizationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (typeof organizationId !== "string" || !UUID.test(organizationId)) {
    throw new MissingOrganizationContextError("Organization id must be a UUID");
  }
  // `await` dans le contexte : une requête Prisma est paresseuse et ne part qu'au premier `then`.
  return storage.run(organizationId, async () => await fn());
}

/** Organisation du contexte courant, `undefined` hors de `withOrganization`. */
export function currentOrganizationId(): string | undefined {
  return storage.getStore();
}
