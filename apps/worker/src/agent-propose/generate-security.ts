import type { AgentProposalKind } from "@koklo/domain";
import {
  type AsvsLevel,
  effectiveAsvsLevel,
  exposedSurfaces,
  modelFields,
  SECURITY_DOSSIER_SECTIONS,
  unclassifiedFields,
} from "@koklo/schema";
import type { LaunchSources } from "./sources.ts";
import { titleKey } from "./title-key.ts";
import {
  ASVS_ZONE,
  DOSSIER_ZONE,
  OPEN_THREATS_ZONE,
  RIGHTS_ZONE,
  type SecurityRefs,
  SUMMARY_ZONE,
} from "./triage-security.ts";

/**
 * Génération de la Sécurité (TK-117, passation 21 §4, B806) : les étapes viennent du code. `threats` : surfaces exposées
 * sans menace, parades des menaces ouvertes, restrictions et règles, sections manquantes ; `classify` : champs non
 * classés par table ; `asvs` et `summary` : une étape. Chaque étape est publiée aussitôt. Pur, sans I/O.
 */
const MODE_KINDS: Readonly<Record<string, readonly AgentProposalKind[]>> = {
  threats: ["threat", "right", "doc_section"],
  classify: ["sensitive"],
  asvs: ["asvs"],
  summary: ["summary"],
};
const CLOSING_KINDS: Readonly<Record<string, AgentProposalKind>> = {
  [OPEN_THREATS_ZONE]: "threat",
  [RIGHTS_ZONE]: "right",
  [DOSSIER_ZONE]: "doc_section",
};
/** Douze étapes au plus : huit de surfaces et les trois dernières en laissent une de marge. */
const SURFACE_STEPS_MAX = 8;
const STEPS_MAX = 12;
const ZONE_MAX = 120;

export const securityKinds = (mode: string): readonly AgentProposalKind[] => MODE_KINDS[mode] ?? [];

/** Type demandé à une étape : la zone vient du code, jamais du modèle ni d'un nom saisi. */
export const securityKindsAt = (mode: string, zone: string): readonly AgentProposalKind[] =>
  mode === "threats" ? [CLOSING_KINDS[zone] ?? "threat"] : securityKinds(mode);

/** Valeurs réparties en `max` groupes au plus, chacun nommé par ses valeurs (bornées). */
function grouped(values: readonly string[], max: number): string[] {
  const groups = Math.min(values.length, max);
  const startOf = (i: number) => Math.floor((i * values.length) / groups);
  return Array.from({ length: groups }, (_, i) =>
    values
      .slice(startOf(i), startOf(i + 1))
      .join(" · ")
      .slice(0, ZONE_MAX),
  );
}

type Current = NonNullable<LaunchSources["security"]>;
const unclassifiedOf = (current: Current): string[] => {
  const donnees = current.entries.map((entry) => ({ champs: entry.fields }));
  return unclassifiedFields({ donnees }, current.tables);
};

function missingSections(sources: LaunchSources): boolean {
  const sections = sources.docSections ?? [];
  return SECURITY_DOSSIER_SECTIONS.some(({ slug, title }) => {
    const found = sections.find(
      (section) => section.specId === `DOC-${slug}` || titleKey(section.title) === titleKey(title),
    );
    return found === undefined || found.empty === true;
  });
}

function threatSteps(sources: LaunchSources, current: Current): string[] {
  const exposed = exposedSurfaces(
    current.operations.map((operation) => ({ sert: operation.serves })),
    sources.features.map((feature) => feature.specId),
  );
  const covered = new Set(current.threats.flatMap((threat) => threat.surfaces));
  const open = current.threats.some((threat) => threat.measures.length === 0);
  return [
    ...grouped(
      exposed.filter((surface) => !covered.has(surface)),
      SURFACE_STEPS_MAX,
    ),
    ...(open ? [OPEN_THREATS_ZONE] : []),
    RIGHTS_ZONE,
    ...(missingSections(sources) ? [DOSSIER_ZONE] : []),
  ];
}

export function securitySteps(mode: string, sources: LaunchSources): string[] {
  const current = sources.security;
  if (current === undefined) return [];
  if (mode === "threats") return threatSteps(sources, current);
  if (mode === "classify") {
    const tables = unclassifiedOf(current).map((field) => field.split(".")[0] ?? "");
    return grouped([...new Set(tables)], STEPS_MAX);
  }
  return [mode === "asvs" ? ASVS_ZONE : SUMMARY_ZONE];
}

const CATEGORIES = ["personnelle", "contact", "sensible", "secret", "technique"] as const;
type Category = (typeof CATEGORIES)[number];

function levelOf(current: Current): AsvsLevel {
  const entries = current.entries.map((entry) => ({ categorie: entry.category as Category }));
  return effectiveAsvsLevel({ niveau: current.asvs.level as AsvsLevel | undefined }, entries);
}

/** Références et éléments existants que le tri de la Sécurité confronte aux propositions. */
export function securityRefs(sources: LaunchSources): SecurityRefs {
  const current = sources.security as Current;
  return {
    surfaces: new Set([...sources.features.map((feature) => feature.specId), "api"]),
    fields: new Set(modelFields(current.tables)),
    unclassified: new Set(unclassifiedOf(current)),
    roles: new Map(current.roles.map((role) => [role.id, new Set(role.permissions)])),
    restrictions: new Set(
      current.restrictions.map(
        (entry) => `${entry.role} ${entry.permission} ${titleKey(entry.restriction)}`,
      ),
    ),
    ownershipRules: new Set(current.ownershipRules.map(titleKey)),
    threats: new Map(
      current.threats.map((threat) => [
        titleKey(threat.title),
        { specId: threat.specId, open: threat.measures.length === 0 },
      ]),
    ),
    requirements: new Map(
      current.asvs.requirements.map((entry) => [
        titleKey(entry.title),
        { id: entry.id, answered: entry.answered },
      ]),
    ),
    level: levelOf(current),
    docSections: new Map(
      (sources.docSections ?? []).map((section) => [section.specId, section.empty === true]),
    ),
  };
}
