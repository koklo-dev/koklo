import { InlineAlert, type InlineAlertAction } from "@koklo/ui";
import { STALE_CLOSED_TEXT, STALE_LEAD, staleChangesText } from "../lib/technical-labels.ts";
import type { TechnicalUpstream } from "../lib/use-technical-page.ts";

/**
 * Cahier technique à revoir (maquette 14 l.122-129) : ce qui a changé dans l'architecture depuis la validation, les
 * éléments concernés (surlignés dans les onglets), « Voir les changements » et « Proposer les mises à jour ».
 */
export function TechnicalUpstreamAlert({
  upstream,
  version,
  onSee,
  onPropose,
  closed = false,
}: {
  upstream: TechnicalUpstream;
  /** SHA de la version validée, abrégé à 7 caractères. */
  version?: string | null | undefined;
  onSee: () => void;
  onPropose?: (() => void) | undefined;
  /** L'agent ne peut pas être relancé tant que l'architecture n'est pas revalidée. */
  closed?: boolean;
}) {
  const see: InlineAlertAction = { label: "Voir les changements", onClick: onSee };
  return (
    <InlineAlert
      variant="warning"
      icon="sync_problem"
      role="alert"
      actions={
        onPropose
          ? [
              see,
              {
                label: "Proposer les mises à jour",
                onClick: onPropose,
                primary: true,
                icon: "wand_stars",
              },
            ]
          : [see]
      }
    >
      <strong className="font-semibold">
        {`${STALE_LEAD}${version ? ` (version ${version.slice(0, 7)})` : ""}.`}
      </strong>{" "}
      {staleChangesText(upstream.changes)}
      {upstream.items.length > 0 ? (
        <>
          {" Sont concernés : "}
          <span className="break-words font-mono text-code">{upstream.items.join(", ")}</span>
          {", surlignés dans les onglets."}
        </>
      ) : null}
      {closed ? ` ${STALE_CLOSED_TEXT}` : null}
    </InlineAlert>
  );
}
