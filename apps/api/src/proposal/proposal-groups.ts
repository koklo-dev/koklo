import { AGENT_PROPOSAL_KINDS, type AgentProposalKind } from "@koklo/domain";

/** Au-delà de 30 propositions dans un lancement, la liste se groupe ; en deçà, un seul groupe (TK-99a). */
export const GROUPING_THRESHOLD = 30;

/** Clé du groupe unique d'un lancement de 30 propositions ou moins. */
export const ALL_GROUP_KEY = "all";

export type GroupBy = "type" | "type_zone";

const KIND_LABELS: Record<AgentProposalKind, string> = {
  feature: "Fonctionnalités",
  criteria: "Critères",
  rule: "Règles",
  role: "Rôles",
  flow: "Parcours",
  table: "Tables",
  relations: "Relations",
  fixtures: "Jeux d'exemple",
  component: "Composants",
  archflow: "Flux",
  adr: "Décisions",
  doc_section: "Document · vue d'ensemble",
};

/**
 * L'Architecture (TK-111) se relit par type, jamais par zone : le document d'abord, puis composants, flux, décisions (maquette
 * 13). Pour les autres livrables, l'ordre est celui de `AGENT_PROPOSAL_KINDS`.
 */
const BY_TYPE_ONLY: readonly AgentProposalKind[] = ["doc_section", "component", "archflow", "adr"];
const isByTypeOnly = (kind: AgentProposalKind): boolean => BY_TYPE_ONLY.includes(kind);
const rankOf = (kind: AgentProposalKind): number =>
  isByTypeOnly(kind)
    ? AGENT_PROPOSAL_KINDS.length + BY_TYPE_ONLY.indexOf(kind) - BY_TYPE_ONLY.length
    : AGENT_PROPOSAL_KINDS.indexOf(kind);

/** Nombre de propositions par (type, zone, statut), et position de la première de la zone. */
export interface GroupCount {
  kind: AgentProposalKind;
  zone: string;
  status: "pending" | "accepted" | "rejected";
  n: number;
  first: number;
}

export interface ProposalGroup {
  key: string;
  label: string;
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
}

/**
 * Clé du groupe « Relations et jeux d'exemple » (TK-110, B487) : les propositions `relations` et `fixtures` du livrable Données se
 * relisent ensemble (par type et zone, une relation ou un jeu n'a pas de zone propre à relire).
 */
export const LINKS_GROUP_KEY = "links";
export const LINKS_GROUP_LABEL = "Relations et jeux d'exemple";
const LINKS_KINDS = ["relations", "fixtures"] as const satisfies readonly AgentProposalKind[];

/** Ce qu'un groupe désigne : un type (ou plusieurs), éventuellement une zone ; `{}` = toutes les propositions. */
export interface GroupFilter {
  kind?: AgentProposalKind;
  kinds?: readonly AgentProposalKind[];
  zone?: string;
}

const isLinksKind = (kind: AgentProposalKind): boolean =>
  (LINKS_KINDS as readonly string[]).includes(kind);

export const groupKeyOf = (kind: AgentProposalKind, zone: string, by: GroupBy): string => {
  if (by === "type" || isByTypeOnly(kind)) return kind;
  return isLinksKind(kind) ? LINKS_GROUP_KEY : `${kind}:${zone}`;
};

const isKind = (value: string): value is AgentProposalKind =>
  (AGENT_PROPOSAL_KINDS as readonly string[]).includes(value);

/** Filtre d'une clé de groupe ; `null` pour une clé que ce module n'a pas pu émettre. */
export function groupFilterOf(key: string): GroupFilter | null {
  if (key === ALL_GROUP_KEY) return {};
  if (key === LINKS_GROUP_KEY) return { kinds: LINKS_KINDS };
  const cut = key.indexOf(":");
  const kind = cut === -1 ? key : key.slice(0, cut);
  if (!isKind(kind)) return null;
  return cut === -1 ? { kind } : { kind, zone: key.slice(cut + 1) };
}

const emptyGroup = (key: string, label: string): ProposalGroup => ({
  key,
  label,
  total: 0,
  accepted: 0,
  rejected: 0,
  pending: 0,
});

const labelOf = (row: GroupCount, by: GroupBy): string => {
  if (by === "type" || isByTypeOnly(row.kind)) return KIND_LABELS[row.kind];
  if (isLinksKind(row.kind)) return LINKS_GROUP_LABEL;
  return row.kind === "table" ? `Zone ${row.zone}` : row.zone;
};

/** Groupes d'un lancement, dans l'ordre des types puis de la première position ; un seul groupe sous le seuil. */
export function buildGroups(counts: readonly GroupCount[], by: GroupBy): ProposalGroup[] {
  const total = counts.reduce((sum, row) => sum + row.n, 0);
  const ordered = [...counts].sort((a, b) => rankOf(a.kind) - rankOf(b.kind) || a.first - b.first);
  const groups = new Map<string, ProposalGroup>();
  for (const row of ordered) {
    const single = total <= GROUPING_THRESHOLD;
    const key = single ? ALL_GROUP_KEY : groupKeyOf(row.kind, row.zone, by);
    const label = single ? "Toutes les propositions" : labelOf(row, by);
    const group = groups.get(key) ?? emptyGroup(key, label);
    group.total += row.n;
    group[row.status] += row.n;
    groups.set(key, group);
  }
  return [...groups.values()];
}
