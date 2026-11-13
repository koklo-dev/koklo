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
};

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

/** Ce qu'un groupe désigne : un type, éventuellement une zone ; `{}` = toutes les propositions. */
export interface GroupFilter {
  kind?: AgentProposalKind;
  zone?: string;
}

export const groupKeyOf = (kind: AgentProposalKind, zone: string, by: GroupBy): string =>
  by === "type" ? kind : `${kind}:${zone}`;

const isKind = (value: string): value is AgentProposalKind =>
  (AGENT_PROPOSAL_KINDS as readonly string[]).includes(value);

/** Filtre d'une clé de groupe ; `null` pour une clé que ce module n'a pas pu émettre. */
export function groupFilterOf(key: string): GroupFilter | null {
  if (key === ALL_GROUP_KEY) return {};
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

/** Groupes d'un lancement, dans l'ordre des types puis de la première position ; un seul groupe sous le seuil. */
export function buildGroups(counts: readonly GroupCount[], by: GroupBy): ProposalGroup[] {
  const total = counts.reduce((sum, row) => sum + row.n, 0);
  const ordered = [...counts].sort(
    (a, b) =>
      AGENT_PROPOSAL_KINDS.indexOf(a.kind) - AGENT_PROPOSAL_KINDS.indexOf(b.kind) ||
      a.first - b.first,
  );
  const groups = new Map<string, ProposalGroup>();
  for (const row of ordered) {
    const single = total <= GROUPING_THRESHOLD;
    const key = single ? ALL_GROUP_KEY : groupKeyOf(row.kind, row.zone, by);
    const label = single
      ? "Toutes les propositions"
      : by === "type"
        ? KIND_LABELS[row.kind]
        : row.zone;
    const group = groups.get(key) ?? emptyGroup(key, label);
    group.total += row.n;
    group[row.status] += row.n;
    groups.set(key, group);
  }
  return [...groups.values()];
}
