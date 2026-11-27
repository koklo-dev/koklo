import { DATA_PROPOSAL_ROLES } from "../auth/roles.ts";
import { forbidden } from "../tracker/api-errors.ts";

/**
 * Le cahier technique se propose, se relit et se préremplit par owner, admin et développeur seuls (TK-115, B725 : le
 * designer reçoit 403, même pour relire). Les autres livrables gardent les rôles de leur route.
 */
export function assertDeliverableRole(deliverable: string, role: string | undefined): void {
  if (deliverable !== "technical") return;
  if (!(DATA_PROPOSAL_ROLES as readonly (string | undefined)[]).includes(role)) throw forbidden();
}
