import type { IncomingHttpHeaders } from "node:http";
import { STAFF_ROLES } from "./roles.ts";
import type { SessionResolver } from "./session.ts";

/**
 * Classe de chaque route `/api/auth/organization/*` du plugin `organization` de Better Auth
 * (v1.7.14, tour exhaustif tiré de `plugins/organization/routes/*` ; voir l'ADR 0016).
 * - `self` : lecture de soi ou parcours propre à l'utilisateur (ses organisations, son membre, ses
 *   invitations, activer une organisation dont il est membre, accepter ou refuser SON invitation) ;
 *   servi à toute session, Better Auth y applique ses propres contrôles.
 * - `others` : lecture d'autrui (membres, invitations, détail de l'organisation) ; réservée aux
 *   `STAFF_ROLES` de l'organisation active, rôle relu en base.
 * - `write` : écriture d'organisation (création, mise à jour, membres, rôles, invitations émises) ;
 *   fermée à TOUS sur ce canal : elles passent par les procédures oRPC (`member.invite`,
 *   `member.setRole`…) qui portent audit, purge des liens client et gardes de rôle.
 * Toute route absente de cette table est refusée (fail-closed).
 */
export type OrganizationRouteAccess = "self" | "others" | "write";

export const ORGANIZATION_ROUTES: Readonly<Record<string, OrganizationRouteAccess>> = {
  // Lecture de soi / parcours propre
  list: "self",
  "set-active": "self",
  "get-active-member": "self",
  "get-active-member-role": "self",
  "has-permission": "self",
  "get-invitation": "self",
  "accept-invitation": "self",
  "reject-invitation": "self",
  "list-user-invitations": "self",
  "list-user-teams": "self",
  // Lecture d'autrui
  "list-members": "others",
  "get-full-organization": "others",
  "get-organization": "others",
  "list-invitations": "others",
  "list-teams": "others",
  "list-team-members": "others",
  "list-roles": "others",
  "get-role": "others",
  // Écriture d'organisation
  create: "write",
  update: "write",
  delete: "write",
  "check-slug": "write",
  "invite-member": "write",
  "cancel-invitation": "write",
  "remove-member": "write",
  "update-member-role": "write",
  leave: "write",
  "create-team": "write",
  "remove-team": "write",
  "update-team": "write",
  "set-active-team": "write",
  "add-team-member": "write",
  "remove-team-member": "write",
  "create-role": "write",
  "delete-role": "write",
  "update-role": "write",
};

const PREFIX = "/api/auth/organization/";

interface ParsedTarget {
  /** Le chemin touche l'espace `organization` (sous quelque forme que ce soit). */
  inOrganization: boolean;
  /** Nom de route exact après normalisation ; `null` si le chemin n'est pas une route connue. */
  route: string | null;
  /** Valeurs des paramètres qui désignent une organisation (`organizationId`, `organizationSlug`). */
  selectors: { ids: string[]; slugs: string[] };
}

function decodeFully(path: string): string | null {
  let current = path;
  for (let pass = 0; pass < 4; pass++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Lit la cible comme le fera Better Auth (`new URL` : segments `.` et `..`, `%2e`, `\` résolus),
 * puis la normalise plus largement qu'il ne le fait (décodage répété, casse, `//`, `/` final) : tout
 * ce que le routeur pourrait lire comme une route d'organisation est donc vu comme tel ici.
 */
export function parseTarget(originalUrl: string): ParsedTarget {
  let url: URL;
  try {
    url = new URL(originalUrl, "http://localhost");
  } catch {
    return { inOrganization: true, route: null, selectors: { ids: [], slugs: [] } };
  }
  const decoded = decodeFully(url.pathname);
  const selectors = {
    ids: url.searchParams.getAll("organizationId"),
    slugs: url.searchParams.getAll("organizationSlug"),
  };
  if (decoded === null) return { inOrganization: true, route: null, selectors };
  const path = decoded
    .toLowerCase()
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
  const inOrganization = path.includes("organization");
  const route = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : null;
  const known = route !== null && Object.hasOwn(ORGANIZATION_ROUTES, route) ? route : null;
  return { inOrganization, route: known, selectors };
}

export type ChannelVerdict = "pass" | "deny";

/**
 * Garde du canal Better Auth : appliquée à `/api/auth/*` avant le handler. Hors espace
 * `organization` : `pass`. Dedans : table fermée ci-dessus, rôle relu en base (jamais fourni par le
 * client), refus uniforme.
 */
export class OrganizationChannelPolicy {
  constructor(private readonly sessions: SessionResolver) {}

  async check(
    method: string,
    originalUrl: string,
    headers: IncomingHttpHeaders,
  ): Promise<ChannelVerdict> {
    const target = parseTarget(originalUrl);
    if (!target.inOrganization) return "pass";
    if (target.route === null) return "deny";
    const access = ORGANIZATION_ROUTES[target.route];
    if (access === "self") return "pass";
    if (access !== "others" || method.toUpperCase() !== "GET") return "deny";
    // Sans session : Better Auth répond 401 sans donnée.
    if (!(await this.sessions.resolveUser(headers))) return "pass";
    const session = await this.sessions.resolve(headers);
    if (!session?.role || !STAFF_ROLES.some((staff) => staff === session.role)) return "deny";
    // Une organisation désignée par la requête doit être l'organisation active (dont le rôle vient
    // d'être vérifié), pas une autre où l'utilisateur serait client.
    if (target.selectors.slugs.length > 0) return "deny";
    if (target.selectors.ids.some((id) => id !== session.organizationId)) return "deny";
    return "pass";
  }
}
