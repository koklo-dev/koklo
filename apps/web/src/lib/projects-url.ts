import {
  type ProjectCardsInput,
  projectCardsSortSchema,
  projectPhaseSchema,
} from "@koklo/contract";

export type ProjectsSort = NonNullable<ProjectCardsInput["sort"]>;
export type ProjectsPhase = NonNullable<ProjectCardsInput["phase"]>;

export interface ProjectsUrl {
  q: string;
  phase: ProjectsPhase | null;
  sort: ProjectsSort;
}

export const DEFAULT_SORT: ProjectsSort = "activity";
export const QUERY_MAX_LENGTH = 200;

/** Lit la recherche, la phase et le tri de l'adresse ; une valeur inconnue revient à la valeur par défaut. */
export function readProjectsUrl(search: string): ProjectsUrl {
  const params = new URLSearchParams(search);
  const phase = projectPhaseSchema.safeParse(params.get("phase"));
  const sort = projectCardsSortSchema.safeParse(params.get("sort"));
  return {
    q: (params.get("q") ?? "").slice(0, QUERY_MAX_LENGTH),
    phase: phase.success ? phase.data : null,
    sort: sort.success ? sort.data : DEFAULT_SORT,
  };
}

export type ProjectsUrlPatch = Partial<{
  q: string | null;
  phase: ProjectsPhase | null;
  sort: ProjectsSort | null;
}>;

/** Adresse (« ?q=…&phase=… » ou vide) après le changement : une valeur par défaut ou vide n'est pas écrite. */
export function withProjectsUrl(search: string, patch: ProjectsUrlPatch): string {
  const params = new URLSearchParams(search);
  const set = (key: string, value: string | null | undefined) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  if ("q" in patch) set("q", patch.q?.trim().slice(0, QUERY_MAX_LENGTH));
  if ("phase" in patch) set("phase", patch.phase);
  if ("sort" in patch) set("sort", patch.sort === DEFAULT_SORT ? null : patch.sort);
  const text = params.toString();
  return text ? `?${text}` : "";
}
