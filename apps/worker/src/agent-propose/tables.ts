import { AGENT_PROPOSE_LIMITS } from "@koklo/domain";
import { componentProposalSchema } from "@koklo/schema";
import { stringsOf } from "../job-support.ts";
import {
  type Complement,
  type CoverageIndex,
  coverageOf,
  type Dependency,
  dependencyUnion,
  type IndexedComponent,
  type PublishedProposal,
  unionOf,
} from "./coverage.ts";
import { type Candidate, titleKey } from "./triage.ts";
import { componentIdOf, proposedComponentId } from "./triage-architecture.ts";

/**
 * Règle des tables (TK-114b, B614) : les tables sans propriétaire sont rattachées par le code, jamais par le modèle, toujours
 * par une proposition relue par l'équipe. Propriétaire : `C-base-de-donnees` (index ou lancement), sinon le premier `store` de
 * l'index par identifiant, sinon le premier `store` en attente du lancement, sinon une proposition « Base de données ».
 */
export interface LinkPlan {
  readonly creations: Candidate[];
  readonly complements: Complement[];
}

const DATABASE_NAME = "Base de données";
const DATABASE_ID = componentIdOf(DATABASE_NAME);
const DATA_ZONE = "Données";
export const TABLES_RATIONALE = "Tables sans composant propriétaire.";
const DATABASE_RESPONSIBILITY = "Garde les tables du modèle de données.";
/** Rôles d'un composant, 20 au plus (B650). */
export const ACTORS_MAX = 20;
/** Responsabilité d'une proposition `specId` : jamais appliquée (B615 ; seuls `owns`, `serves` et `dependsOn` le sont). */
const UPDATE_RESPONSIBILITY = "Mise à jour des liens du composant.";

const isPendingComponent = (proposal: PublishedProposal): boolean =>
  proposal.kind === "component" && proposal.status === "pending" && !proposal.applied;

/**
 * Proposition `specId` d'un composant indexé (B615) : nom, type et zone de l'index, liens = index ∪ ajouts ; `dependsOn`
 * (index ∪ ajouts par cible, 30 au plus) seulement si des dépendances sont ajoutées (TK-114c, B636, B637). `undefined` si la
 * charge n'est pas valide (composant indexé incomplet) : la cible est alors ignorée. `actors` (index ∪ ajouts, 20 au plus)
 * seulement si des rôles sont ajoutés (TK-114d, B653) : la mise à jour remplace la liste.
 */
export function updateProposalOf(
  component: IndexedComponent,
  add: {
    owns?: readonly string[];
    serves?: readonly string[];
    dependsOn?: readonly Dependency[];
    actors?: readonly string[];
  },
  rationale: string,
): Candidate | undefined {
  const zone = component.zone ?? DATA_ZONE;
  const added = add.dependsOn ?? [];
  const actors = add.actors ?? [];
  const payload = {
    specId: component.specId,
    name: component.title,
    type: component.type,
    zone,
    responsibility: UPDATE_RESPONSIBILITY,
    owns: unionOf(component.owns, add.owns ?? []),
    serves: unionOf(component.serves, add.serves ?? []),
    ...(added.length > 0 ? { dependsOn: dependencyUnion(component.dependsOn ?? [], added) } : {}),
    ...(actors.length > 0 ? { actors: unionOf(component.actors ?? [], actors, ACTORS_MAX) } : {}),
  };
  if (!componentProposalSchema.safeParse(payload).success) return undefined;
  return { kind: "component", title: component.title, rationale, zone, payload };
}

/** Cible d'un ajout de liens : une proposition en attente du lancement, ou un composant indexé (proposition `specId`). */
export type LinkTarget =
  | { readonly kind: "pending"; readonly proposal: PublishedProposal }
  | { readonly kind: "indexed"; readonly component: IndexedComponent };

/** Composant indexé : sa proposition `specId` en attente, sinon lui-même ; `undefined` si elle a été décidée (B621). */
export function indexedTarget(
  component: IndexedComponent,
  proposals: readonly PublishedProposal[],
): LinkTarget | undefined {
  const update = proposals.find(
    (proposal) => proposal.kind === "component" && proposal.payload.specId === component.specId,
  );
  if (update === undefined) return { kind: "indexed", component };
  return isPendingComponent(update) ? { kind: "pending", proposal: update } : undefined;
}

/** Cible d'une affectation par identifiant (B616, B621) : composant indexé, ou proposition en attente du lancement. */
export function targetOf(
  id: string,
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): LinkTarget | undefined {
  const component = index.components.find((item) => item.specId === id);
  if (component !== undefined) return indexedTarget(component, proposals);
  const proposal = proposals.find(
    (item) => item.kind === "component" && proposedComponentId(item.payload) === id,
  );
  return proposal !== undefined && isPendingComponent(proposal)
    ? { kind: "pending", proposal }
    : undefined;
}

function ownerOf(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): LinkTarget | undefined {
  const database = index.components.find((component) => component.specId === DATABASE_ID);
  const fromIndex = database && indexedTarget(database, proposals);
  if (fromIndex !== undefined) return fromIndex;
  const pending = proposals.filter(isPendingComponent);
  const named = pending.find((proposal) => proposedComponentId(proposal.payload) === DATABASE_ID);
  if (named !== undefined) return { kind: "pending", proposal: named };
  const stores = index.components
    .filter((component) => component.type === "store")
    .sort((a, b) => (a.specId < b.specId ? -1 : 1));
  for (const store of stores) {
    const target = indexedTarget(store, proposals);
    if (target !== undefined) return target;
  }
  const store = pending.find((proposal) => proposal.payload.type === "store");
  return store === undefined ? undefined : { kind: "pending", proposal: store };
}

const ownedCount = (target: LinkTarget): number =>
  target.kind === "pending"
    ? stringsOf(target.proposal.payload.owns).length
    : target.component.owns.length;

/** Noms libres « Base de données », « Base de données 2 »… : jamais celui d'un composant connu. */
function* databaseNames(index: CoverageIndex, proposals: readonly PublishedProposal[]) {
  const taken = new Set([
    ...index.components.map((component) => titleKey(component.title)),
    ...proposals.map((proposal) => titleKey(proposal.title)),
  ]);
  for (let rank = 1; ; rank += 1) {
    const name = rank === 1 ? DATABASE_NAME : `${DATABASE_NAME} ${rank}`;
    if (!taken.has(titleKey(name))) yield name;
  }
}

const databaseProposal = (name: string, owns: readonly string[]): Candidate => ({
  kind: "component",
  title: name,
  rationale: TABLES_RATIONALE,
  zone: DATA_ZONE,
  payload: {
    name,
    type: "store",
    zone: DATA_ZONE,
    responsibility: DATABASE_RESPONSIBILITY,
    owns: [...owns],
  },
});

/** Plan de rattachement des tables sans propriétaire : au plus 200 par composant, l'excédent à de nouvelles bases. */
export function tablesPlan(
  index: CoverageIndex,
  proposals: readonly PublishedProposal[],
): LinkPlan {
  const unowned = coverageOf(index, proposals).unownedTables;
  const plan: LinkPlan = { creations: [], complements: [] };
  if (unowned.length === 0) return plan;
  const max = AGENT_PROPOSE_LIMITS.links;
  const target = ownerOf(index, proposals);
  let rest = unowned;
  if (target !== undefined) {
    const taken = rest.slice(0, Math.max(0, max - ownedCount(target)));
    const linked = linkTo(target, taken, TABLES_RATIONALE);
    if (linked !== undefined) {
      rest = rest.slice(taken.length);
      if ("id" in linked) plan.complements.push(linked);
      else plan.creations.push(linked);
    }
  }
  const names = databaseNames(index, proposals);
  for (let start = 0; start < rest.length; start += max) {
    plan.creations.push(
      databaseProposal(names.next().value as string, rest.slice(start, start + max)),
    );
  }
  return plan;
}

/** Tables liées à une cible : complément d'une proposition en attente, ou proposition `specId` du composant indexé. */
function linkTo(
  target: LinkTarget,
  owns: readonly string[],
  rationale: string,
): Complement | Candidate | undefined {
  if (owns.length === 0) return undefined;
  if (target.kind === "pending") return { id: target.proposal.id, owns, serves: [] };
  return updateProposalOf(target.component, { owns }, rationale);
}
