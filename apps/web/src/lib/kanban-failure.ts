import type { TicketStatus } from "@koklo/contract";
import type { IconName } from "@koklo/ui";
import { conflictReason, errorCode, errorData } from "./api-error.ts";
import { isStatus, STATUS_LABELS } from "./ticket-labels.ts";

/** Un déplacement refusé ou échoué : de quoi l'expliquer et le rejouer. */
export interface MoveFailure {
  key: string;
  from: TicketStatus;
  to: TicketStatus;
  error: unknown;
}

export interface FailureNotice {
  title: string;
  text: string;
  icon: IconName;
  /** Bouton d'action du message : recharger le tableau ou relancer le déplacement. */
  action?: "reload" | "retry";
}

function invalidTransition({ key, from, to, error }: MoveFailure): FailureNotice {
  const data = errorData(error);
  const start = isStatus(data?.from) ? data.from : from;
  const end = isStatus(data?.to) ? data.to : to;
  return {
    title: "Déplacement impossible",
    text: `Transition interdite : ${key} ne peut pas passer de « ${STATUS_LABELS[start]} » à « ${STATUS_LABELS[end]} ».`,
    icon: "warning",
  };
}

function conflict(error: unknown): FailureNotice {
  if (conflictReason(error) === "ticket_has_active_lease") {
    return {
      title: "Déplacement impossible",
      text: "Ce ticket est en cours de traitement par un agent. Réessayez quand il aura terminé.",
      icon: "warning",
    };
  }
  return {
    title: "Ce ticket a changé entre-temps",
    text: "Rechargez le kanban puis réessayez.",
    icon: "warning",
    action: "reload",
  };
}

/** Message affiché pour un déplacement qui n'a pas abouti ; le serveur fait foi des transitions. */
export function describeFailure(failure: MoveFailure): FailureNotice {
  switch (errorCode(failure.error)) {
    case "INVALID_TRANSITION":
      return invalidTransition(failure);
    case "FORBIDDEN":
      return {
        title: "Déplacement refusé",
        text: "Vous n'avez pas le droit de déplacer les tickets. Demandez à un propriétaire, un administrateur, un développeur ou un designer.",
        icon: "lock",
      };
    case "CONFLICT":
      return conflict(failure.error);
    case "NOT_FOUND":
      return { title: "Déplacement impossible", text: "Ce ticket n'existe plus.", icon: "warning" };
    default:
      return {
        title: "Le déplacement a échoué",
        text: "Une erreur est survenue. Réessayez dans un instant.",
        icon: "warning",
        action: "retry",
      };
  }
}
