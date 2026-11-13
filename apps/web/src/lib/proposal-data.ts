import type { ProposalOutput } from "./proposal-types.ts";

/**
 * Propositions du livrable Données (TK-107, B387, B392) : `table`, `relations`, `fixtures`. Les relations de la
 * proposition `relations` ne sont pas des opérations à part : celles d'une table du lot entrent dans son `table.create`,
 * les autres deviennent un `table.update` de la table de départ. Rejeter une table retire en cascade les relations et
 * les champs `ref` qui la visent (le serveur refuse de toute façon un lot qui laisse une référence pendante).
 */
export const DATA_KINDS = ["table", "relations", "fixtures"] as const;
export const isDataKind = (kind: string): boolean =>
  (DATA_KINDS as readonly string[]).includes(kind);

export interface TableRelation {
  to: string;
  cardinality: string;
}

/** Ce que la cascade a retiré : relations et champs `ref` dont la cible est une table rejetée. */
export interface Cascade {
  relations: number;
  fields: number;
}

type Content = Record<string, unknown>;
const records = (value: unknown): Content[] =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Content => typeof item === "object" && item !== null,
  );
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Identifiant lisible d'une table proposée : `T-<slug du nom>` (le serveur pose le sien d'après le même nom). */
export function tableRefOf(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `T-${slug || "table"}`;
}

const refTarget = (type: unknown): string | null =>
  /^ref\((T-[^)]+)\)$/.exec(text(type))?.[1] ?? null;
const withContent = (proposal: ProposalOutput, content: Content): ProposalOutput => ({
  ...proposal,
  content,
});

function dropRejectedFields(proposal: ProposalOutput, rejected: ReadonlySet<string>) {
  const fields = records(proposal.content.fields);
  const kept = fields.filter((field) => !rejected.has(refTarget(field.type) ?? ""));
  if (kept.length === fields.length) return { proposal, removed: 0 };
  return {
    proposal: withContent(proposal, { ...proposal.content, fields: kept }),
    removed: fields.length - kept.length,
  };
}

function dropRejectedRelations(proposal: ProposalOutput, rejected: ReadonlySet<string>) {
  const all = records(proposal.content.relations);
  const kept = all.filter((r) => !rejected.has(text(r.from)) && !rejected.has(text(r.to)));
  if (kept.length === all.length) return { proposal, removed: 0 };
  return {
    proposal: withContent(proposal, { ...proposal.content, relations: kept }),
    removed: all.length - kept.length,
  };
}

/** Retire des propositions les relations et les champs `ref` qui visent une table rejetée (B392). */
function cascadeRejected(all: ProposalOutput[]): { proposals: ProposalOutput[]; cascade: Cascade } {
  const rejected = new Set(
    all
      .filter((p) => p.kind === "table" && p.status === "rejected")
      .map((p) => tableRefOf(text(p.content.name))),
  );
  const cascade: Cascade = { relations: 0, fields: 0 };
  if (rejected.size === 0) return { proposals: all, cascade };
  const proposals = all.map((proposal) => {
    if (proposal.status === "rejected") return proposal;
    if (proposal.kind === "table") {
      const out = dropRejectedFields(proposal, rejected);
      cascade.fields += out.removed;
      return out.proposal;
    }
    if (proposal.kind === "relations") {
      const out = dropRejectedRelations(proposal, rejected);
      cascade.relations += out.removed;
      return out.proposal;
    }
    return proposal;
  });
  return { proposals, cascade };
}

const keyOf = (r: TableRelation): string => `${r.to}|${r.cardinality}`;
const dedupe = (list: TableRelation[]): TableRelation[] => [
  ...new Map(list.map((r) => [keyOf(r), r])).values(),
];

/**
 * Pose sur les propositions ce que les opérations lisent : `relationsOut` d'une table du lot, `updates` (relations
 * existantes plus nouvelles) de la proposition `relations` pour les tables hors lot.
 */
async function attachRelations(
  all: ProposalOutput[],
  loadRelations: (specId: string) => Promise<TableRelation[]>,
): Promise<ProposalOutput[]> {
  const inLot = new Set(
    all
      .filter((p) => p.kind === "table" && p.status === "accepted")
      .map((p) => tableRefOf(text(p.content.name))),
  );
  const entries = all
    .filter((p) => p.kind === "relations" && p.status === "accepted")
    .flatMap((p) => records(p.content.relations));
  const outOf = (from: string): TableRelation[] =>
    entries
      .filter((r) => text(r.from) === from)
      .map((r) => ({ to: text(r.to), cardinality: text(r.cardinality) }));
  const external = [...new Set(entries.map((r) => text(r.from)))].filter(
    (from) => !inLot.has(from),
  );
  const existing = new Map(
    await Promise.all(external.map(async (from) => [from, await loadRelations(from)] as const)),
  );
  const updates = external.map((specId) => ({
    specId,
    relations: dedupe([...(existing.get(specId) ?? []), ...outOf(specId)]),
  }));
  return all.map((proposal) => {
    if (proposal.kind === "table" && proposal.status === "accepted") {
      const out = outOf(tableRefOf(text(proposal.content.name)));
      return out.length > 0
        ? withContent(proposal, { ...proposal.content, relationsOut: out })
        : proposal;
    }
    if (proposal.kind === "relations" && proposal.status === "accepted") {
      return withContent(proposal, { ...proposal.content, updates });
    }
    return proposal;
  });
}

/**
 * Prépare l'enregistrement d'un lancement de Données : cascade du rejet (B392), puis relations rattachées aux tables
 * du lot ou aux tables enregistrées. `all` : toutes les propositions du lancement, quel que soit leur statut.
 */
export async function prepareDataProposals(
  all: ProposalOutput[],
  loadRelations: (specId: string) => Promise<TableRelation[]>,
): Promise<{ proposals: ProposalOutput[]; cascade: Cascade }> {
  const cut = cascadeRejected(all);
  return { proposals: await attachRelations(cut.proposals, loadRelations), cascade: cut.cascade };
}

/** « 2 relations et 1 champ retirés avec les tables rejetées » ; vide quand rien n'a été retiré. */
export function cascadeText({ relations, fields }: Cascade): string {
  const parts = [
    relations > 0 ? `${relations} ${relations >= 2 ? "relations" : "relation"}` : "",
    fields > 0 ? `${fields} ${fields >= 2 ? "champs ref" : "champ ref"}` : "",
  ].filter(Boolean);
  if (parts.length === 0) return "";
  const total = relations + fields;
  return `${parts.join(" et ")} ${total >= 2 ? "retirés" : "retiré"} avec les tables rejetées`;
}
