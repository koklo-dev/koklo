import {
  type DocSectionStatus,
  type DocSections,
  docSectionPath,
  EmitDocSectionError,
  emitDocSection,
  parseDocSection,
} from "@koklo/schema";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, invalidEmit, removeFile, type Workspace, writeFile } from "./workspace.ts";

/** Champs d'une opération `doc.section.create|update` (contrat 3.9.0). */
interface DocSectionPayload {
  title?: string;
  markdown?: string;
  status?: DocSectionStatus;
}

/** Slug d'un identifiant `DOC-<slug>`. */
export const docSlugOf = (id: string): string => id.slice(4);

function write(workspace: Workspace, path: string, id: string, text: () => string): void {
  try {
    writeFile(workspace, path, text());
  } catch (error) {
    if (!(error instanceof EmitDocSectionError)) throw error;
    invalidEmit(path, id, error);
  }
}

/**
 * `doc.section.create|update|delete` : le fichier est `architecture/overview/NN-<slug>.md`, NN = numéro suivant à la création.
 * Plusieurs créations d'un même lot prennent des numéros consécutifs.
 */
export function applyDocSection(
  workspace: Workspace,
  operation: BatchOperation,
  sections: DocSections & { next: number },
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as DocSectionPayload;
  const path = sections.byId.get(id);
  if (operation.kind === "doc.section.create") {
    const created = docSectionPath(sections.next, docSlugOf(id));
    write(workspace, created, id, () =>
      emitDocSection({
        title: payload.title ?? "",
        status: payload.status ?? "brouillon",
        markdown: payload.markdown ?? "",
      }),
    );
    sections.byId.set(id, created);
    sections.next += 1;
  } else if (path !== undefined && operation.kind === "doc.section.delete") {
    removeFile(workspace, path);
    sections.byId.delete(id);
  } else if (path !== undefined) {
    const base = parseDocSection(workspace.files.get(path) ?? "");
    write(workspace, path, id, () =>
      emitDocSection({
        title: payload.title ?? base.title,
        status: payload.status ?? (base.status === "a_rediger" ? "brouillon" : base.status),
        markdown: payload.markdown ?? base.markdown,
      }),
    );
  }
}
