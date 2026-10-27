import { type IconName, iconLoaders } from "./generated/registry.ts";

/** Tracés d'une icône : contour (fill 0) et plein (fill 1). */
export interface IconPaths {
  outline: string;
  filled: string;
}

const loaded = new Map<IconName, IconPaths>();
const pending = new Map<IconName, Promise<IconPaths>>();

export function readIcon(name: IconName): IconPaths | undefined {
  return loaded.get(name);
}

/** Enregistre un tracé déjà importé (icônes toujours visibles, rendues sans attente). */
export function primeIcon(name: IconName, paths: IconPaths): void {
  loaded.set(name, paths);
}

/** Charge le module de l'icône à la demande (un seul import par nom). */
export function loadIcon(name: IconName): Promise<IconPaths> {
  const known = loaded.get(name);
  if (known) return Promise.resolve(known);
  let request = pending.get(name);
  if (!request) {
    const load = iconLoaders[name] as (() => Promise<IconPaths>) | undefined;
    // Nom hors registre (contournement du typage) : icône vide plutôt qu'une exception au rendu.
    if (!load) return Promise.resolve({ outline: "", filled: "" });
    request = load().then(({ outline, filled }) => {
      const paths = { outline, filled };
      loaded.set(name, paths);
      pending.delete(name);
      return paths;
    });
    pending.set(name, request);
  }
  return request;
}
