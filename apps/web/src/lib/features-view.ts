import type { Role } from "@koklo/contract";
import { errorCode, errorData } from "./api-error.ts";
import { canReadRepos } from "./roles.ts";

/** Un seul état principal à la fois (design/screens/S-features.md §4). */
export type FeaturesView =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "index-failed"; errorCode: string | null; commitSha: string | null }
  | { kind: "no-repo" }
  /** Rien à afficher et rien à affirmer : `retryRepos` quand c'est la lecture des dépôts qui a échoué. */
  | { kind: "neutral"; retryRepos: boolean }
  | { kind: "preparing" }
  | { kind: "empty" }
  | { kind: "empty-filtered" }
  | { kind: "list"; building: boolean };

interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  isError: boolean;
}

export interface ViewSources {
  valid: boolean;
  roleKnown: boolean;
  role: Role | undefined;
  /** Une redirection (UNAUTHORIZED) est en cours : aucun état d'erreur n'est montré. */
  redirecting: boolean;
  filtered: boolean;
  head: QueryState<{ status: string; errorCode: string | null; commitSha: string } | null>;
  repos: QueryState<readonly { role: string }[]>;
  features: QueryState<unknown> & { itemCount: number; fetching: boolean };
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Une erreur de lecture : projet introuvable, index en échec (409) ou erreur générique. */
function failure(error: unknown): FeaturesView {
  const code = errorCode(error);
  if (code === "NOT_FOUND") return { kind: "not-found" };
  if (code === "SPEC_INDEX_FAILED") {
    const data = errorData(error);
    return {
      kind: "index-failed",
      errorCode: text(data?.errorCode),
      commitSha: text(data?.commitSha),
    };
  }
  return { kind: "error" };
}

/** `spec.head` vaut `null` : rien n'est indexé ; le rôle décide de ce qu'on peut en dire. */
function withoutIndex({ role, repos }: ViewSources): FeaturesView {
  if (!canReadRepos(role)) return { kind: "neutral", retryRepos: false };
  if (repos.data) {
    return repos.data.some((repo) => repo.role === "spec")
      ? { kind: "preparing" }
      : { kind: "no-repo" };
  }
  if (!repos.isError) return { kind: "loading" };
  return errorCode(repos.error) === "NOT_FOUND"
    ? { kind: "not-found" }
    : { kind: "neutral", retryRepos: true };
}

function withIndex(sources: ViewSources, building: boolean): FeaturesView {
  const { features, filtered } = sources;
  if (features.data === undefined)
    return features.isError ? failure(features.error) : { kind: "loading" };
  if (features.itemCount > 0) return { kind: "list", building };
  // Relecture en cours après un changement de version : pas d'« état vide » qui clignote avant la liste.
  if (features.fetching) return { kind: "loading" };
  if (filtered) return { kind: "empty-filtered" };
  return building ? { kind: "preparing" } : { kind: "empty" };
}

/** Ramène les quatre requêtes (projet, `spec.head`, `repo.list`, liste) à l'état principal de l'écran. */
export function deriveFeaturesView(sources: ViewSources): FeaturesView {
  const { head } = sources;
  if (!sources.valid) return { kind: "not-found" };
  if (head.data === undefined) {
    if (!head.isError) return { kind: "loading" };
    return sources.redirecting ? { kind: "loading" } : failure(head.error);
  }
  if (sources.redirecting) return { kind: "loading" };
  // Le rôle ne conditionne que l'absence d'index (créer le dépôt ou non) : une spec lue s'affiche sans l'attendre.
  if (head.data === null) return sources.roleKnown ? withoutIndex(sources) : { kind: "loading" };
  if (head.data.status === "failed") {
    return { kind: "index-failed", errorCode: head.data.errorCode, commitSha: head.data.commitSha };
  }
  return withIndex(sources, head.data.status === "building");
}
