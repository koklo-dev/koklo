import { Document, stringify, visit } from "yaml";

/** Statut d'une page d'idée tel que la base le porte (miroir de l'enum `IdeaPageStatus`). */
export type IdeaPageFileStatus = "empty" | "draft" | "review" | "stable";
export type IdeaPageFileOrigin = "template" | "user" | "agent";

/** Une page d'idée à écrire dans `idea/<slug>.md` (passation 02 §4). */
export interface IdeaPageFile {
  readonly slug: string;
  readonly title: string;
  readonly status: IdeaPageFileStatus;
  readonly required: boolean;
  readonly origin: IdeaPageFileOrigin;
  /** Instant ISO 8601 ; seule la date est écrite (`mis_a_jour: 2026-11-05`). */
  readonly updatedAt: string;
  /** Noms d'affichage des contributeurs, jamais d'e-mail. */
  readonly contributors: readonly string[];
  readonly contentMd: string;
}

export interface IdeaIndexPage {
  readonly slug: string;
  readonly title: string;
  readonly position: number;
  readonly required: boolean;
  readonly origin: IdeaPageFileOrigin;
}

/** Contenu de `idea/_index.yaml` : l'ordre des pages est porté par `position`. */
export interface IdeaIndex {
  readonly structure: string;
  readonly pages: readonly IdeaIndexPage[];
}

/** Erreur typée : `path` est le pointeur JSON de la valeur refusée. */
export class EmitIdeaError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(`${message} (${path === "" ? "racine" : path})`);
    this.name = "EmitIdeaError";
    this.path = path;
  }
}

const STATUS_LABEL: Record<IdeaPageFileStatus, string> = {
  empty: "vide",
  draft: "brouillon",
  review: "a-relire",
  stable: "stable",
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T|$)/;
const FORBIDDEN_IN_LINE = /[\p{Cc}\u2028\u2029]/u;

/** Une ligne, sans caractère de contrôle ni séparateur de ligne Unicode : sinon le texte sortirait de sa ligne. */
function assertLine(value: string, path: string): void {
  if (FORBIDDEN_IN_LINE.test(value)) {
    throw new EmitIdeaError("saut de ligne ou caractère de contrôle interdit", path);
  }
}

function assertPage(page: IdeaPageFile): void {
  assertLine(page.slug, "/slug");
  assertLine(page.title, "/title");
  if (!ISO_DATE.test(page.updatedAt)) throw new EmitIdeaError("date invalide", "/updatedAt");
  page.contributors.forEach((name, i) => {
    assertLine(name, `/contributors/${i}`);
  });
  if (page.contentMd.includes("\0"))
    throw new EmitIdeaError("caractère NUL interdit", "/contentMd");
}

/** Fichier `idea/<slug>.md` : en-tête YAML, titre h1, puis le contenu Markdown tel quel. */
export function emitIdeaPage(page: IdeaPageFile): string {
  assertPage(page);
  const header = stringify(
    {
      id: page.slug,
      titre: page.title,
      statut: STATUS_LABEL[page.status],
      requise: page.required,
      origine: page.origin,
      mis_a_jour: page.updatedAt.slice(0, 10),
      contributeurs: [...page.contributors],
    },
    { lineWidth: 0, flowCollectionPadding: false },
  );
  const body = page.contentMd.trim() === "" ? "" : `\n${page.contentMd}`;
  return `---\n${header}---\n# ${page.title}\n${body}`;
}

function assertIndex(index: IdeaIndex): void {
  assertLine(index.structure, "/structure");
  const seen = new Set<string>();
  index.pages.forEach((page, i) => {
    assertLine(page.slug, `/pages/${i}/slug`);
    assertLine(page.title, `/pages/${i}/title`);
    if (seen.has(page.slug)) throw new EmitIdeaError("slug en double", `/pages/${i}/slug`);
    seen.add(page.slug);
  });
}

/** Fichier `idea/_index.yaml` : pages triées par position, `requise` si vraie, `origine` hors gabarit. */
export function emitIdeaIndex(index: IdeaIndex): string {
  assertIndex(index);
  const pages = [...index.pages]
    .sort((a, b) => a.position - b.position)
    .map((page) => ({
      slug: page.slug,
      titre: page.title,
      ...(page.required ? { requise: true } : {}),
      ...(page.origin === "template" ? {} : { origine: page.origin }),
    }));
  const doc = new Document({ structure: index.structure, pages });
  doc.commentBefore = " idea/_index.yaml";
  visit(doc, {
    Map(key, node) {
      if (key !== null) node.flow = true;
    },
  });
  return doc.toString({ lineWidth: 0, flowCollectionPadding: true });
}
