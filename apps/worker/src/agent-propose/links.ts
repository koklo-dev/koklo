import { closesSyncCycle, componentDependencySchema, synchronousGraph } from "@koklo/schema";
import { isRecord } from "../job-support.ts";
import { DEPENDENCIES_MAX, type Dependency } from "./coverage.ts";

/**
 * Liens proposés par la passe de couverture (TK-114c, B634 à B636). Le modèle répond `links` ; le code seul décide : motif
 * `C-`, texte brut (`componentDependencySchema`), deux composants connus, au moins une extrémité isolée du paquet, `from` où
 * le lien peut s'écrire, lien absent de `from`, 30 dépendances au plus, jamais un cycle synchrone. Un lien refusé est ignoré
 * sans être compté (ce n'est pas une proposition). Pur, sans I/O.
 */
export interface ProposedLink extends Dependency {
  readonly from: string;
}

export interface LinkContext {
  /** Composants isolés du paquet : chaque lien en touche au moins un. */
  readonly isolated: ReadonlySet<string>;
  /** Dépendances actuelles des composants connus (index, lancement non refusé, même réponse) : leurs clés sont les connus. */
  readonly dependencies: ReadonlyMap<string, readonly Dependency[]>;
  /** `from` peut recevoir le lien : composant de la même réponse, proposition en attente, indexé non décidé (B636). */
  readonly writable: (id: string) => boolean;
}

const fromSchema = componentDependencySchema.shape.to;

/** Sortie `links` du modèle : les entrées bien formées, `async` gardé seulement s'il est vrai ; absent ou invalide : []. */
export function linksOf(raw: unknown): ProposedLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): ProposedLink[] => {
    if (!isRecord(item) || !fromSchema.safeParse(item.from).success) return [];
    const { to, via } = item;
    const parsed = componentDependencySchema.safeParse(
      item.async === true ? { to, via, async: true } : { to, via },
    );
    return parsed.success ? [{ from: item.from as string, ...parsed.data }] : [];
  });
}

/** Graphe synchrone des dépendances connues, complété au fil des liens retenus. */
const graphOf = (dependencies: ReadonlyMap<string, readonly Dependency[]>) =>
  synchronousGraph(
    [...dependencies].map(([id, deps]) => ({
      id,
      depend_de: deps.map((dep) =>
        dep.async === true ? { vers: dep.to, mode: "asynchrone" } : { vers: dep.to },
      ),
    })),
  );

/** Liens retenus, ajoutés par composant `from` dans l'ordre de la réponse (seulement les ajouts). */
export function linksPlan(
  links: readonly ProposedLink[],
  context: LinkContext,
): Map<string, Dependency[]> {
  const graph = graphOf(context.dependencies);
  const added = new Map<string, Dependency[]>();
  const kept = (link: ProposedLink): boolean => {
    const current = [
      ...(context.dependencies.get(link.from) ?? []),
      ...(added.get(link.from) ?? []),
    ];
    return (
      link.from !== link.to &&
      context.dependencies.has(link.from) &&
      context.dependencies.has(link.to) &&
      (context.isolated.has(link.from) || context.isolated.has(link.to)) &&
      context.writable(link.from) &&
      current.length < DEPENDENCIES_MAX &&
      !current.some((dep) => dep.to === link.to) &&
      (link.async === true || !closesSyncCycle(graph, link.from, link.to))
    );
  };
  for (const link of links) {
    if (!kept(link)) continue;
    const { from, ...dep } = link;
    added.set(from, [...(added.get(from) ?? []), dep]);
    if (dep.async !== true) graph.set(from, [...(graph.get(from) ?? []), dep.to]);
  }
  return added;
}
