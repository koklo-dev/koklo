import { DATA_PROPOSAL_ROLES } from "../auth/roles.ts";
import { forbidden } from "../tracker/api-errors.ts";

/** Livrables que le designer ne propose, ne relit ni ne préremplit (TK-115, B725 ; TK-117, B810). */
const TEAM_ONLY: readonly string[] = ["technical", "security"];

/**
 * Le cahier technique et la Sécurité se proposent, se relisent et se préremplissent par owner, admin et développeur seuls
 * (le designer reçoit 403, même pour relire). Les autres livrables gardent les rôles de leur route.
 */
export function assertDeliverableRole(deliverable: string, role: string | undefined): void {
  if (!TEAM_ONLY.includes(deliverable)) return;
  if (!(DATA_PROPOSAL_ROLES as readonly (string | undefined)[]).includes(role)) throw forbidden();
}
