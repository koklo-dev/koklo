/**
 * Rôles et applications d'entrée (TK-114d, B651, B652). Un rôle a une application d'entrée s'il est dans les `acteurs` d'un
 * composant `app`, ou s'il échange un message avec un composant `app` dans un flux technique. Un flux est direct quand un de
 * ses messages va d'un rôle vers un composant `service`, `store` ou `queue` (ou l'inverse), blocs `alt` compris ; un
 * composant `ext` ou `app`, ou une cible inconnue, n'en fait pas un flux direct. Pur ; partagé par la couverture, la reprise
 * des flux (worker) et les acteurs d'une zone (API).
 */

/** Élément d'un flux tel que le fichier l'écrit : message `de`/`vers`, bloc `alt` (ses messages), séparateur. */
export type FlowItemInput = {
  readonly de?: string;
  readonly vers?: string;
  readonly bloc?: string;
  readonly messages?: readonly FlowItemInput[];
};
export type RoleComponent = {
  readonly id: string;
  readonly type?: string;
  readonly acteurs?: readonly string[];
};
export type RoleFlow = { readonly id: string; readonly messages?: readonly FlowItemInput[] };

export type Exchange = { readonly de: string; readonly vers: string };

/** Types de composants qu'un rôle ne devrait jamais appeler directement (B652). */
export const DIRECT_COMPONENT_TYPES: ReadonlySet<string> = new Set(["service", "store", "queue"]);

export const isRoleId = (id: string): boolean => id.startsWith("RL-");

/** Messages d'un flux dans l'ordre, blocs `alt` compris ; un séparateur n'en porte pas. */
export function exchangesOf(items: readonly FlowItemInput[] | undefined): Exchange[] {
  return (items ?? []).flatMap((item): Exchange[] => {
    if (item.bloc !== undefined) return item.bloc === "alt" ? exchangesOf(item.messages) : [];
    return typeof item.de === "string" && typeof item.vers === "string"
      ? [{ de: item.de, vers: item.vers }]
      : [];
  });
}

const typesOf = (components: readonly RoleComponent[]): Map<string, string> =>
  new Map(components.map((component) => [component.id, component.type ?? ""]));

/** Le rôle et le composant d'un message qui relie un rôle à un composant, sinon `undefined`. */
export function roleSideOf(exchange: Exchange): { role: string; component: string } | undefined {
  if (isRoleId(exchange.de) && !isRoleId(exchange.vers))
    return { role: exchange.de, component: exchange.vers };
  if (isRoleId(exchange.vers) && !isRoleId(exchange.de))
    return { role: exchange.vers, component: exchange.de };
  return undefined;
}

/**
 * Applications d'entrée de chaque rôle, dans l'ordre : celles qui le listent dans `acteurs` (ordre des composants), puis
 * celles avec lesquelles il échange dans un flux (ordre des flux).
 */
export function entryAppsOf(
  components: readonly RoleComponent[],
  flows: readonly RoleFlow[],
): Map<string, string[]> {
  const types = typesOf(components);
  const apps = new Map<string, string[]>();
  const add = (role: string, app: string) => {
    const list = apps.get(role) ?? [];
    if (!list.includes(app)) list.push(app);
    apps.set(role, list);
  };
  for (const component of components) {
    if (component.type !== "app") continue;
    for (const role of component.acteurs ?? []) add(role, component.id);
  }
  for (const flow of flows) {
    for (const exchange of exchangesOf(flow.messages)) {
      const side = roleSideOf(exchange);
      if (side !== undefined && types.get(side.component) === "app") add(side.role, side.component);
    }
  }
  return apps;
}

/** Vrai si un message du flux relie un rôle à un composant `service`, `store` ou `queue` connu (B652). */
export function isDirectFlow(flow: RoleFlow, types: ReadonlyMap<string, string>): boolean {
  return exchangesOf(flow.messages).some((exchange) => {
    const side = roleSideOf(exchange);
    return side !== undefined && DIRECT_COMPONENT_TYPES.has(types.get(side.component) ?? "");
  });
}

/** Rôles sans application d'entrée (ordre de l'entrée) et flux directs (ordre des flux). */
export function roleCoverage(
  roles: readonly string[],
  components: readonly RoleComponent[],
  flows: readonly RoleFlow[],
): { rolesWithoutApp: string[]; directFlows: string[] } {
  const apps = entryAppsOf(components, flows);
  const types = typesOf(components);
  return {
    rolesWithoutApp: roles.filter((role) => (apps.get(role) ?? []).length === 0),
    directFlows: flows.filter((flow) => isDirectFlow(flow, types)).map((flow) => flow.id),
  };
}
