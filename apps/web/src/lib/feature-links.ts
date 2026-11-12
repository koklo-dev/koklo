import {
  type FeatureFormValues,
  isLinkId,
  LINK_FIELDS,
  type LinkField,
  linkExample,
  parseLinks,
} from "./feature-form.ts";

/**
 * Le champ « Liens » est une seule saisie à puces : le préfixe de l'identifiant répartit chaque puce dans l'une des
 * six listes du schéma (B329 e). Les `F-` et `P-` de la maquette ne sont pas des liens d'une fonctionnalité.
 */
const PREFIXES: readonly { prefix: string; field: LinkField }[] = [
  { prefix: "NFR-", field: "nfr" },
  { prefix: "RL-", field: "roles" },
  { prefix: "S-", field: "screens" },
  { prefix: "R-", field: "rules" },
  { prefix: "T-", field: "tables" },
  { prefix: "E-", field: "endpoints" },
];

export const LINK_PREFIX_HELP =
  "Préfixes acceptés : S- (écran), RL- (rôle), R- (règle), T- (table), E- (point d'accès), NFR- (exigence).";

/** Liste de liens d'un identifiant d'après son préfixe, ou `null` (préfixe inconnu). */
export function fieldOfTag(tag: string): LinkField | null {
  return PREFIXES.find(({ prefix }) => tag.startsWith(prefix))?.field ?? null;
}

/** Message de refus d'une puce saisie (préfixe inconnu ou identifiant mal formé), ou `null`. */
export function validateTag(tag: string): string | null {
  const field = fieldOfTag(tag);
  if (!field) return `« ${tag} » n'est pas un lien d'une fonctionnalité. ${LINK_PREFIX_HELP}`;
  return isLinkId(field, tag)
    ? null
    : `« ${tag} » n'est pas un identifiant valide (exemple : ${linkExample(field)}).`;
}

/** Toutes les puces, dans l'ordre des six listes. */
export const linkTags = (values: FeatureFormValues): string[] =>
  LINK_FIELDS.flatMap((field) => parseLinks(values[field]));

/** Écart de saisie : retire les puces disparues de leur liste, range les nouvelles par préfixe. */
export function patchForTags(
  values: FeatureFormValues,
  next: readonly string[],
): Partial<FeatureFormValues> {
  const before = linkTags(values);
  const removed = before.filter((tag) => !next.includes(tag));
  const added = next.filter((tag) => !before.includes(tag));
  const lists: Record<LinkField, string[]> = {
    screens: parseLinks(values.screens),
    roles: parseLinks(values.roles),
    rules: parseLinks(values.rules),
    tables: parseLinks(values.tables),
    endpoints: parseLinks(values.endpoints),
    nfr: parseLinks(values.nfr),
  };
  for (const field of LINK_FIELDS) lists[field] = lists[field].filter((t) => !removed.includes(t));
  for (const tag of added) {
    const field = fieldOfTag(tag);
    if (field) lists[field].push(tag);
  }
  const patch: Partial<FeatureFormValues> = {};
  for (const field of LINK_FIELDS) {
    const text = lists[field].join("\n");
    if (text !== values[field]) Object.assign(patch, { [field]: text });
  }
  return patch;
}
