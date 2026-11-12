import type { SpecDeliverable } from "@koklo/contract";
import type { SpecBadge, SpecKey } from "@koklo/ui";

/** Pastille d'un livrable ouvert : « … » pendant la génération, « N à relire » pendant une relecture, sinon son statut ; validé : aucune. */
function badgeOf(deliverable: SpecDeliverable, generating: boolean): SpecBadge | undefined {
  if (generating && deliverable.key === "functional") return { label: "…", tone: "soft" };
  if (deliverable.pendingProposals > 0) {
    return { label: `${deliverable.pendingProposals} à relire`, tone: "primary" };
  }
  switch (deliverable.status) {
    case "pending":
      return { label: "À valider", tone: "pending" };
    case "revise":
      return { label: "À revoir", tone: "pending" };
    case "todo":
      return { label: "Prêt", tone: "soft" };
    default:
      return undefined;
  }
}

/** Pastilles de `SpecNav` d'après `spec.deliverables` : un seul badge par entrée, jamais sur une entrée verrouillée. */
export function specBadges(
  deliverables: readonly SpecDeliverable[] | undefined,
  /** Un lancement de l'agent tourne sur le cahier fonctionnel (maquette 10 l.686 : « … »). */
  generating = false,
): Partial<Record<SpecKey, SpecBadge>> {
  const badges: Partial<Record<SpecKey, SpecBadge>> = {};
  for (const deliverable of deliverables ?? []) {
    const badge = deliverable.available ? badgeOf(deliverable, generating) : undefined;
    if (badge) badges[deliverable.key as SpecKey] = badge;
  }
  return badges;
}
