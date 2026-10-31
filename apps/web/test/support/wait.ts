import { type ByRoleOptions, screen, waitFor, within } from "@testing-library/react";

/**
 * Délai d'apparition d'un élément attendu par ces helpers (défaut de Testing Library : 1 s). Sur un runner
 * saturé, le premier rendu d'une page (import, requêtes React Query, table de 50 lignes) peut dépasser 1 s
 * sans qu'aucune assertion soit en cause. Il ne s'applique qu'à l'attente d'apparition : une attente réussie
 * n'est pas ralentie, et le délai des tests (20 s) reste la borne.
 */
const APPEAR_TIMEOUT_MS = 8_000;

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
  await scope.findAllByText(text, undefined, { timeout: APPEAR_TIMEOUT_MS });
  return scope.getByRole(role, { ...roleOptions, name });
}

const ROLE_SELECTORS = {
  dialog: '[role="dialog"], dialog',
  alert: '[role="alert"]',
  status: '[role="status"], output',
  table: 'table, [role="table"]',
} as const;

/**
 * Attend qu'un élément de rôle donné, sans nom, existe : même principe que `findNamed`. Une requête
 * CSS peu coûteuse sonde le DOM ; le rôle (et les options) n'est résolu qu'une fois, de façon synchrone.
 * `from` restreint la recherche à un élément (équivalent de `within(from).findByRole`).
 */
export async function findRole(
  role: keyof typeof ROLE_SELECTORS,
  options: { from?: HTMLElement } & ByRoleOptions = {},
): Promise<HTMLElement> {
  const { from, ...roleOptions } = options;
  const root = from ?? document.body;
  await waitFor(
    () => {
      if (!root.querySelector(ROLE_SELECTORS[role]))
        throw new Error(`Aucun élément de rôle ${role}`);
    },
    { timeout: APPEAR_TIMEOUT_MS },
  );
  return (from ? within(from) : screen).getByRole(role, roleOptions);
}
