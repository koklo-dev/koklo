import { docSectionSlugOf } from "./doc-section.ts";

/**
 * Index de la tête par chemins (TK-114e, B671) : identifiant -> chemin, par genre, lus dans la liste des fichiers seule (aucun
 * contenu). Partagé par le worker (conflits d'un lot) et l'API (pré-vérification d'un enregistrement). Les rôles vivent dans
 * le contenu de `domain/roles.yaml` : jamais ici. Fonctions pures.
 */
const FEATURE_FILE = /^features\/(F-\d{3,})(?:-[^/]*)?\.md$/;
const RULE_FILE = /^domain\/rules\/(R-\d{3,})(?:-[^/]*)?\.md$/;
const FLOW_FILE = /^design\/flows\/(P-[^/]*?)\.(?:yaml|json)$/;
const TABLE_FILE = /^data\/tables\/(?:T-)?([a-z0-9][a-z0-9-]*)\.yaml$/;
const FIXTURE_FILE = /^data\/fixtures\/(FX-[a-z0-9][a-z0-9-]*)\.yaml$/;
const COMPONENT_FILE = /^architecture\/components\/([a-z0-9][a-z0-9-]*)\.yaml$/;
const ARCHFLOW_FILE = /^architecture\/flows\/(P-[a-z0-9][a-z0-9-]*)\.yaml$/;
const ADR_FILE = /^architecture\/adr\/(ADR-\d{3,})-[^/]*\.md$/;

export interface DocSections {
  /** `DOC-<slug>` -> chemin. */
  readonly byId: Map<string, string>;
  /** Plus grand numéro NN pris (0 sans section). */
  readonly last: number;
}

export interface FlowIndex {
  /** Parcours `.yaml` : seuls modifiables ou supprimables. */
  readonly owned: Map<string, string>;
  /** Tout identifiant occupé, `.json` hérité compris. */
  readonly taken: Set<string>;
}

export interface SpecPathIndex {
  readonly features: Map<string, string>;
  readonly rules: Map<string, string>;
  readonly flows: FlowIndex;
  readonly tables: Map<string, string>;
  readonly fixtures: Set<string>;
  readonly components: Map<string, string>;
  readonly archflows: Map<string, string>;
  readonly adrs: Map<string, string>;
  readonly docs: DocSections;
}

/** Ce que l'index lit d'une opération : son genre (préfixe du `kind`) et son identifiant cible. */
export interface SpecPathOperation {
  readonly kind: string;
  readonly targetSpecId: string | null;
}

export type SpecConflictReason = "exists" | "missing" | "duplicate";

/** Opération en conflit : `position` est son rang (0, 1, …) dans la liste donnée. */
export interface SpecConflict {
  readonly position: number;
  readonly reason: SpecConflictReason;
}

function mapOf(paths: Iterable<string>, pattern: RegExp, idOf = (found: string) => found) {
  const index = new Map<string, string>();
  for (const path of paths) {
    const found = pattern.exec(path)?.[1];
    if (found !== undefined) index.set(idOf(found), path);
  }
  return index;
}

/** Identifiant de la feature portée par un chemin `features/F-nnn[-slug].md`, sinon `undefined`. */
export const featureIdOfPath = (path: string): string | undefined => FEATURE_FILE.exec(path)?.[1];

export const featureIndex = (paths: Iterable<string>) => mapOf(paths, FEATURE_FILE);
export const ruleIndex = (paths: Iterable<string>) => mapOf(paths, RULE_FILE);
/** Un fichier v1 `T-<slug>.yaml` occupe aussi son identifiant. */
export const tableIndex = (paths: Iterable<string>) => mapOf(paths, TABLE_FILE, (s) => `T-${s}`);
export const componentIndex = (paths: Iterable<string>) =>
  mapOf(paths, COMPONENT_FILE, (slug) => `C-${slug}`);
export const archFlowIndex = (paths: Iterable<string>) => mapOf(paths, ARCHFLOW_FILE);
export const adrIndex = (paths: Iterable<string>) => mapOf(paths, ADR_FILE);
export const fixtureIndex = (paths: Iterable<string>): Set<string> =>
  new Set(mapOf(paths, FIXTURE_FILE).keys());

/**
 * Parcours de la tête. Un `.json` hérité (`P-001-inscription.json`) occupe aussi son identifiant : on ne crée jamais un
 * second fichier pour lui. Seul un `.yaml` se modifie ou se supprime.
 */
export function flowIndex(paths: Iterable<string>): FlowIndex {
  const owned = new Map<string, string>();
  const taken = new Set<string>();
  for (const path of paths) {
    const stem = FLOW_FILE.exec(path)?.[1];
    if (stem === undefined) continue;
    taken.add(stem);
    if (path.endsWith(".yaml")) owned.set(stem, path);
  }
  return { owned, taken };
}

/** Sections de la tête : `DOC-<slug>` -> chemin ; le numéro suivant se déduit du plus grand préfixe. */
export function docSectionIndex(paths: Iterable<string>): DocSections {
  const byId = new Map<string, string>();
  let last = 0;
  for (const path of paths) {
    const found = docSectionSlugOf(path);
    if (found === undefined) continue;
    byId.set(`DOC-${found.slug}`, path);
    last = Math.max(last, found.num);
  }
  return { byId, last };
}

/** Index de la tête, genre par genre, depuis la liste des chemins (relatifs à la racine de la spec). */
export function specPathIndex(paths: readonly string[]): SpecPathIndex {
  return {
    features: featureIndex(paths),
    rules: ruleIndex(paths),
    flows: flowIndex(paths),
    tables: tableIndex(paths),
    fixtures: fixtureIndex(paths),
    components: componentIndex(paths),
    archflows: archFlowIndex(paths),
    adrs: adrIndex(paths),
    docs: docSectionIndex(paths),
  };
}

/** Genre d'une opération : le préfixe de son `kind` (`feature`, `rule`, `doc`, `layout`, `architecture`…). */
export const genreOf = (operation: SpecPathOperation): string => operation.kind.split(".")[0] ?? "";

const PRESENCE: Readonly<Record<string, (index: SpecPathIndex, id: string) => boolean>> = {
  feature: (index, id) => index.features.has(id),
  rule: (index, id) => index.rules.has(id),
  table: (index, id) => index.tables.has(id),
  fixture: (index, id) => index.fixtures.has(id),
  component: (index, id) => index.components.has(id),
  archflow: (index, id) => index.archflows.has(id),
  adr: (index, id) => index.adrs.has(id),
  doc: (index, id) => index.docs.byId.has(id),
};

/**
 * L'identifiant visé est-il présent sur la tête ? Un parcours créé vise tout identifiant occupé, un parcours modifié un
 * `.yaml`. `undefined` pour un genre que l'index par chemins ne connaît pas (rôle, mise en page) : non vérifié.
 */
export function presentAtHead(
  index: SpecPathIndex,
  operation: SpecPathOperation,
): boolean | undefined {
  const id = operation.targetSpecId ?? "";
  const genre = genreOf(operation);
  if (genre === "flow") {
    return operation.kind === "flow.create" ? index.flows.taken.has(id) : index.flows.owned.has(id);
  }
  return PRESENCE[genre]?.(index, id);
}

/**
 * Conflits d'un lot : `create` d'un identifiant pris (`exists`), `update`/`delete` d'un absent (`missing`), seconde création
 * d'un même identifiant du même genre dans le lot (`duplicate`). `isPresent` rend `undefined` : opération non vérifiée.
 */
export function conflictsOf<Operation extends SpecPathOperation>(
  operations: readonly Operation[],
  isPresent: (operation: Operation) => boolean | undefined,
): SpecConflict[] {
  const conflicts: SpecConflict[] = [];
  const created = new Set<string>();
  operations.forEach((operation, position) => {
    const present = isPresent(operation);
    if (present === undefined) return;
    const creates = operation.kind.endsWith(".create");
    const key = `${genreOf(operation)}:${operation.targetSpecId ?? ""}`;
    if (creates === present) {
      conflicts.push({ position, reason: creates ? "exists" : "missing" });
    } else if (creates && created.has(key)) {
      conflicts.push({ position, reason: "duplicate" });
    }
    if (creates) created.add(key);
  });
  return conflicts;
}
