import { DELIVERABLE_DEPENDENCIES, type DeliverableKey } from "./deliverables.ts";

/**
 * Impact amont (TK-100 lot C, B1) : quand une source change, les livrables qui en dépendent, de proche en proche, sont à
 * revoir. Règles pures, sans lecture ni horloge.
 */
export type SourceNode = "idea" | DeliverableKey;

/** Sources de chaque livrable : le Fonctionnel lit le dossier d'idée, les autres leur amont de B1 (une seule table). */
export const DELIVERABLE_SOURCES: Readonly<Record<DeliverableKey, readonly SourceNode[]>> = {
  ...DELIVERABLE_DEPENDENCIES,
  functional: ["idea"],
};

/**
 * Livrables rendus périmés par le changement de ces sources : leurs dépendants, directs ou non, dans l'ordre du graphe.
 */
export function staleLivrables(changed: readonly SourceNode[]): DeliverableKey[] {
  const stale = new Set<SourceNode>();
  const keys = Object.keys(DELIVERABLE_SOURCES) as DeliverableKey[];
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of keys) {
      const touched = DELIVERABLE_SOURCES[key].some(
        (source) => changed.includes(source) || stale.has(source),
      );
      if (touched && !stale.has(key)) {
        stale.add(key);
        grew = true;
      }
    }
  }
  return keys.filter((key) => stale.has(key));
}

/** Empreinte d'un dossier d'idée : version de chaque page (`idea_versions.pages_versions`), clé = identifiant de page. */
export type PagesVersions = Readonly<Record<string, number>>;

export interface IdeaPagesDiff {
  added: string[];
  modified: string[];
  removed: string[];
  /** Pages ajoutées, modifiées ou retirées. */
  changedPages: number;
}

/** Différence entre deux versions d'idée ; listes triées par identifiant de page. */
export function ideaPagesDiff(from: PagesVersions, to: PagesVersions): IdeaPagesDiff {
  const has = (versions: PagesVersions, slug: string) => Object.hasOwn(versions, slug);
  const sorted = (list: string[]) => list.sort();
  const added = sorted(Object.keys(to).filter((slug) => !has(from, slug)));
  const modified = sorted(
    Object.keys(to).filter((slug) => has(from, slug) && from[slug] !== to[slug]),
  );
  const removed = sorted(Object.keys(from).filter((slug) => !has(to, slug)));
  return {
    added,
    modified,
    removed,
    changedPages: added.length + modified.length + removed.length,
  };
}
