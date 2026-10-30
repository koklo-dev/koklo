import { type ByRoleOptions, screen } from "@testing-library/react";

type Scope = Pick<typeof screen, "findAllByText" | "getByRole">;

/**
 * Attend qu'un élément nommé existe, sans sonder en boucle une requête par rôle avec `name`.
 *
 * Un `findByRole(role, { name })` recalcule les noms accessibles de tous les éléments du rôle à chaque
 * mutation du DOM ; dans jsdom, sur un CPU saturé (CI + couverture), ces sondages monopolisent le fil
 * d'exécution et retardent les timers de React Query, si bien que l'attente expire avant l'arrivée des
 * données. On attend donc d'abord le texte (requête peu coûteuse), puis on résout le rôle une seule fois,
 * de façon synchrone : l'assertion sur le rôle et le nom reste entière.
 *
 * `text` est le texte visible de l'élément (par défaut `name`, quand le nom accessible est son texte).
 */
export async function findNamed(
  role: Parameters<Scope["getByRole"]>[0],
  name: string | RegExp,
  options: { text?: string | RegExp; scope?: Scope } & Omit<ByRoleOptions, "name"> = {},
): Promise<HTMLElement> {
  const { text = name, scope = screen, ...roleOptions } = options;
  await scope.findAllByText(text);
  return scope.getByRole(role, { ...roleOptions, name });
}
