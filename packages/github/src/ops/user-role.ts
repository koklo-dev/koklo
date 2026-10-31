import { GitProviderError, type UserOwnerRole } from "@koklo/domain";
import { isRequestError } from "../errors-map.ts";
import type { Gateway } from "../gateway.ts";
import type { Request } from "./shared.ts";

const OPERATION = "getUserOwnerRole";
const NOT_FOUND = 404;

type Membership = { role?: unknown; state?: unknown };

/**
 * Lien de l'utilisateur du jeton avec le propriétaire d'une installation. Compte personnel :
 * `GET /user`, `self` si le login est le sien (GitHub ignore la casse). Organisation : `GET /user`
 * pour le login, puis `GET /orgs/{org}/memberships/{username}` (ouvert aux jetons utilisateur
 * d'App, permission d'organisation Members: read ; `GET /user/memberships/orgs/{org}` ne l'est pas :
 * 403 « Resource not accessible by integration ») ; 404 = aucun lien. Une invitation en attente ou un état inconnu ne prouve rien. Tout autre échec
 * (403 App bloquée, 5xx, corps illisible) est une erreur typée : jamais un rôle accordé par défaut.
 */
export function getUserOwnerRole(
  gw: Gateway,
  request: Request<"getUserOwnerRole">,
): Promise<UserOwnerRole> {
  const { auth, owner } = request;
  if (auth.kind !== "user") {
    return Promise.reject(
      new GitProviderError(OPERATION, "Un jeton utilisateur est requis pour lire un rôle."),
    );
  }
  const operation = { operation: OPERATION, resource: "membership", identifier: owner.login };
  return gw.withAuth(operation, auth, async (octokit) => {
    const { data: me } = await octokit.request("GET /user");
    const login = (me as { login?: unknown }).login;
    if (typeof login !== "string" || login === "") throw new GitProviderError(OPERATION);
    if (owner.kind === "user") return sameLogin(login, owner.login) ? "self" : "none";
    try {
      const { data } = await octokit.request("GET /orgs/{org}/memberships/{username}", {
        org: owner.login,
        username: login,
      });
      return roleOf(data as Membership);
    } catch (error) {
      if (isRequestError(error) && error.status === NOT_FOUND) return "none";
      throw error;
    }
  });
}

const sameLogin = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function roleOf(membership: Membership): UserOwnerRole {
  if (typeof membership.role !== "string") throw new GitProviderError(OPERATION);
  if (membership.state !== "active") return "none";
  return membership.role === "admin" ? "admin" : "member";
}
