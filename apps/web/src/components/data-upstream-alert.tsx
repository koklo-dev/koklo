import { InlineAlert } from "@koklo/ui";

/**
 * Impact amont sur le modèle (TK-109, B449) : fonctionnalités et règles citées par les tables, modifiées depuis la
 * dernière décision. Avertissement fixe (`note`, la région d'état de la page est ailleurs) ; l'action n'existe que pour
 * qui peut lancer l'agent (B450).
 */
export function DataUpstreamAlert({
  ids,
  onPropose,
}: {
  ids: readonly string[];
  onPropose?: () => void;
}) {
  return (
    <InlineAlert
      variant="warning"
      icon="warning"
      role="note"
      {...(onPropose ? { action: { label: "Proposer les mises à jour", onClick: onPropose } } : {})}
    >
      {`Le cahier fonctionnel a changé : ${ids.join(", ")} ${ids.length === 1 ? "modifiée" : "modifiées"}`}
    </InlineAlert>
  );
}
