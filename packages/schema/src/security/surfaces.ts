import { API_SURFACE, type AsvsFile, type DataEntry, type Threat } from "../entities/index.ts";
import { compare } from "../issue.ts";
import { effectiveAsvsLevel } from "./asvs.ts";
import { threatStateOf } from "./blockers.ts";

/**
 * Ce que l'agent de la Sécurité a à traiter (TK-117, B806) : surfaces exposées à compléter et exigences ASVS sans
 * réponse. Partagé par l'API (comptes et refus d'un lancement) et le worker (étapes). Fonctions pures.
 */

/** Fonctionnalités servies par les opérations (sinon toutes les fonctionnalités), plus la surface « API ». */
export function exposedSurfaces(
  operations: readonly { readonly sert?: readonly string[] }[],
  features: readonly string[],
): string[] {
  const served = [...new Set(operations.flatMap((operation) => operation.sert ?? []))];
  const exposed = served.length > 0 ? served : features;
  return [...[...exposed].sort(compare), API_SURFACE];
}

/** Surfaces sans menace, ou portant une menace sans parade. */
export function surfacesToComplete(
  exposed: readonly string[],
  threats: readonly Pick<Threat, "surfaces" | "parades">[],
): string[] {
  return exposed.filter((surface) => {
    const on = threats.filter((threat) => (threat.surfaces as string[]).includes(surface));
    return on.length === 0 || on.some((threat) => threatStateOf(threat) === "todo");
  });
}

/** Exigences du niveau effectif sans réponse. */
export function unansweredRequirements(
  file: Partial<Pick<AsvsFile, "niveau" | "exigences">> | undefined,
  entries: readonly Pick<DataEntry, "categorie">[],
): AsvsFile["exigences"] {
  const level = effectiveAsvsLevel(file, entries);
  return (file?.exigences ?? []).filter(
    (entry) => entry.niveau <= level && entry.reponse === undefined,
  );
}
