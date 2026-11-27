import type { SpecDeliverable } from "@koklo/contract";
import type { SpecBadge, SpecKey } from "@koklo/ui";

/** Pastille d'un livrable ouvert : « … » pendant la génération, « N à relire » pendant une relecture, sinon son statut ; validé : aucune. */
function badgeOf(
  deliverable: SpecDeliverable,
  generating: ReadonlySet<SpecKey>,
): SpecBadge | undefined {
  if (generating.has(deliverable.key as SpecKey)) return { label: "…", tone: "soft" };
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

const CLIENT_SUMMARY: SpecBadge = { label: "Résumé", tone: "soft" };

/** Pastilles de `SpecNav` d'après `spec.deliverables` : un seul badge par entrée, jamais sur une entrée verrouillée. */
export function specBadges(
  deliverables: readonly SpecDeliverable[] | undefined,
  /** Livrables dont un lancement de l'agent tourne sans rien à relire encore (maquette 10 l.686, 11 l.625 : « … »). */
  generating: ReadonlySet<SpecKey> = new Set(),
  /** Client et business : ils ne lisent de la Sécurité que son résumé (maquette 15 l.675). */
  client = false,
): Partial<Record<SpecKey, SpecBadge>> {
  const badges: Partial<Record<SpecKey, SpecBadge>> = {};
  for (const deliverable of deliverables ?? []) {
    const summaryOnly = client && deliverable.key === "security";
    const own = summaryOnly ? CLIENT_SUMMARY : badgeOf(deliverable, generating);
    const badge = deliverable.available ? own : undefined;
    if (badge) badges[deliverable.key as SpecKey] = badge;
  }
  return badges;
}
