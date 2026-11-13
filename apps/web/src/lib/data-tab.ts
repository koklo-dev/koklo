import type { IconName } from "@koklo/ui";

/**
 * Onglets de l'écran Données (`/projects/<id>/spec/data`, maquette 11 l.588-598) : Relecture devant les trois onglets
 * de lecture tant qu'une relecture est ouverte (`view=review`).
 */
export const DATA_TABS = ["review", "diagram", "tables", "fixtures"] as const;
export type DataTab = (typeof DATA_TABS)[number];

export const DATA_TAB_LABELS: Record<DataTab, string> = {
  review: "Relecture",
  diagram: "Diagramme",
  tables: "Tables",
  fixtures: "Jeux d'exemple",
};

export const DATA_TAB_ICONS: Record<DataTab, IconName> = {
  review: "rate_review",
  diagram: "schema",
  tables: "table",
  fixtures: "dataset",
};

/** Onglets affichés : « Relecture » en tête quand une relecture est ouverte, sinon absent. */
export const visibleDataTabs = (reviewing: boolean): readonly DataTab[] =>
  reviewing ? DATA_TABS : DATA_TABS.filter((tab) => tab !== "review");

const TABLE_ID = /^T-[a-z0-9][a-z0-9-]*$/;

export interface DataUrl {
  tab: DataTab;
  review: boolean;
  /** Table ouverte à l'arrivée (`?sel=T-slug`) : la liste s'ouvre sur la page qui la contient. */
  sel: string | undefined;
  q: string | undefined;
  zone: string | undefined;
  new: boolean;
  edit: string | undefined;
}

const tableId = (value: string | null): string | undefined =>
  value && TABLE_ID.test(value) ? value : undefined;
const nonEmpty = (value: string | null): string | undefined => value?.trim() || undefined;

/**
 * Lit l'adresse : onglet inconnu = Diagramme, ou Tables sous 1024 px (`narrow`, B425) ; Relecture seulement si
 * `view=review` ; identifiants invalides ignorés.
 */
export function readDataUrl(
  search: string,
  { narrow = false }: { narrow?: boolean } = {},
): DataUrl {
  const params = new URLSearchParams(search);
  const review = params.get("view") === "review";
  const asked = DATA_TABS.find((tab) => tab === params.get("tab"));
  const fallback: DataTab = narrow ? "tables" : "diagram";
  const tab =
    asked === "review" ? (review ? "review" : fallback) : (asked ?? (review ? "review" : fallback));
  return {
    tab,
    review,
    sel: tableId(params.get("sel")),
    q: nonEmpty(params.get("q")),
    zone: nonEmpty(params.get("zone")),
    new: params.get("new") === "1",
    edit: tableId(params.get("edit")),
  };
}

export interface DataUrlPatch {
  tab?: DataTab | null;
  review?: boolean | null;
  sel?: string | null;
  q?: string | null;
  zone?: string | null;
  new?: boolean | null;
  edit?: string | null;
}

const setOrDelete = (params: URLSearchParams, name: string, value: string | null | undefined) => {
  if (value === undefined) return;
  if (value === null || value === "") params.delete(name);
  else params.set(name, value);
};

/** `review: true` écrit `view=review` (et l'onglet Relecture sauf onglet demandé) ; `null` ou `false` les retire. */
function applyReview(params: URLSearchParams, patch: DataUrlPatch): void {
  if (patch.review === undefined) return;
  if (patch.review === true) {
    params.set("view", "review");
    if (patch.tab === undefined) params.set("tab", "review");
    return;
  }
  params.delete("view");
  if (params.get("tab") === "review") params.delete("tab");
}

/** Applique un patch à la requête : `null` ou chaîne vide retire le paramètre ; renvoie `?…` ou `""`. */
export function withDataUrl(search: string, patch: DataUrlPatch): string {
  const params = new URLSearchParams(search);
  setOrDelete(params, "tab", patch.tab);
  setOrDelete(params, "sel", patch.sel);
  setOrDelete(params, "q", patch.q);
  setOrDelete(params, "zone", patch.zone);
  setOrDelete(params, "edit", patch.edit);
  if (patch.new !== undefined) setOrDelete(params, "new", patch.new ? "1" : null);
  applyReview(params, patch);
  const text = params.toString();
  return text ? `?${text}` : "";
}
