import { InlineAlert } from "@koklo/ui";
import { STALE_CLOSED_TEXT, STALE_LEAD } from "../lib/security-labels.ts";
import { type SecurityUpstream, staleListText } from "../lib/security-stale.ts";

/**
 * Sécurité à revoir (maquette 15 l.90-92) : ce qui a changé dans le cahier technique depuis la validation, les éléments
 * concernés (marqués « À revoir » dans les menaces) et « Proposer les mises à jour ».
 */
export function SecurityUpstreamAlert({
  upstream,
  version,
  onPropose,
  closed = false,
}: {
  upstream: SecurityUpstream;
  /** SHA de la version validée, abrégé à 7 caractères. */
  version?: string | null | undefined;
  onPropose?: (() => void) | undefined;
  /** L'agent ne peut pas être relancé tant que le technique n'est pas revalidé (B755). */
  closed?: boolean;
}) {
  const text = (
    <>
      <strong className="font-semibold">
        {`${STALE_LEAD}${version ? ` (version ${version.slice(0, 7)})` : ""}.`}
      </strong>{" "}
      {staleListText(upstream.changes)}
      {upstream.items.length > 0 ? (
        <>
          {" Sont concernés : "}
          <span className="break-words font-mono text-code">{upstream.items.join(", ")}</span>.
        </>
      ) : null}
      {closed ? ` ${STALE_CLOSED_TEXT}` : null}
    </>
  );
  const common = { variant: "warning", icon: "sync_problem", role: "alert" } as const;
  if (!onPropose) return <InlineAlert {...common}>{text}</InlineAlert>;
  return (
    <InlineAlert
      {...common}
      actions={[
        {
          label: "Proposer les mises à jour",
          onClick: onPropose,
          primary: true,
          icon: "wand_stars",
        },
      ]}
    >
      {text}
    </InlineAlert>
  );
}
