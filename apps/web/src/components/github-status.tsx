import { ValidationStatus } from "@koklo/ui";
import {
  AUTHORIZATION_LABELS,
  INSTALLATION_STATUS_LABELS,
  type InstallationStatus,
  type UserAuthorization,
} from "../lib/github-labels.ts";

/**
 * Statut de l'installation en `ValidationStatus` (H7, B25, B33) : Active -> Validée ; Suspendue -> Non
 * soumise + `block` ; Désinstallée -> Non soumise + `cancel`. Icône et libellé, jamais la couleur seule.
 */
export function InstallationStatusPill({ status }: { status: InstallationStatus }) {
  const label = INSTALLATION_STATUS_LABELS[status];
  if (status === "active") return <ValidationStatus status="validated" label={label} />;
  return (
    <ValidationStatus
      status="unsubmitted"
      icon={status === "suspended" ? "block" : "cancel"}
      label={label}
    />
  );
}

/** Autorisation de la personne : « Autorisée » (Validée) ou à (ré)autoriser (À valider). */
export function AuthorizationPill({ authorization }: { authorization: UserAuthorization }) {
  return (
    <ValidationStatus
      status={authorization === "active" ? "validated" : "pending"}
      label={AUTHORIZATION_LABELS[authorization]}
    />
  );
}
