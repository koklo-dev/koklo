import { InlineAlert } from "@koklo/ui";

/**
 * Architecture à revoir (maquette 13 l.122-130, B578 à B580) : ce qui a changé en amont depuis la validation, les
 * composants et flux concernés (surlignés dans le schéma), « Voir les changements » et, pour qui peut lancer l'agent,
 * « Proposer les mises à jour ». `role="alert"` : la page change d'état. Textes en texte brut.
 */
export function ArchitectureUpstreamAlert({
  ids,
  concerned,
  version,
  onSee,
  onPropose,
}: {
  ids: readonly string[];
  /** Composants et flux concernés par ces changements. */
  concerned: readonly string[];
  /** SHA de la version validée, abrégé à 7 caractères. */
  version?: string | null | undefined;
  onSee: () => void;
  onPropose?: (() => void) | undefined;
}) {
  const modified = ids.length === 1 ? "modifié" : "modifiés";
  return (
    <InlineAlert
      variant="warning"
      icon="sync_problem"
      role="alert"
      actions={
        onPropose
          ? [
              { label: "Voir les changements", onClick: onSee },
              {
                label: "Proposer les mises à jour",
                onClick: onPropose,
                primary: true,
                icon: "wand_stars",
              },
            ]
          : [{ label: "Voir les changements", onClick: onSee }]
      }
    >
      <strong className="font-semibold">
        {`Le cahier fonctionnel ou le modèle de données a changé depuis la validation${version ? ` (version ${version.slice(0, 7)})` : ""}.`}
      </strong>{" "}
      {`${ids.join(", ")} ${modified}.`}
      {concerned.length > 0 ? (
        <>
          {" Sont concernés : "}
          <span className="font-mono text-code">{concerned.join(", ")}</span>
          {", surlignés dans le schéma."}
        </>
      ) : null}
    </InlineAlert>
  );
}
