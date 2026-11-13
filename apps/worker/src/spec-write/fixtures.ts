import { EmitFixtureError, emitFixtureYaml, type Fixture } from "@koklo/schema";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, invalidEmit, type Workspace, writeFile } from "./workspace.ts";

/** Champs d'une opération `fixture.create` (contrat 3.5.0). */
interface FixturePayload {
  title?: string;
  table?: string;
  locale?: string;
  rows?: Fixture["lignes"];
}

const FIXTURE_FILE = /^data\/fixtures\/(FX-[a-z0-9][a-z0-9-]*)\.yaml$/;

/** Chemin d'un jeu nouveau : `data/fixtures/FX-<slug>.yaml`. */
export const fixturePathOf = (id: string): string => `data/fixtures/${id}.yaml`;

/** Jeux de la tête : identifiants pris. */
export function fixtureIndex(paths: Iterable<string>): Set<string> {
  const taken = new Set<string>();
  for (const path of paths) {
    const id = FIXTURE_FILE.exec(path)?.[1];
    if (id !== undefined) taken.add(id);
  }
  return taken;
}

/** `fixture.create` : un jeu d'exemple ne se modifie pas ici (le volume réel est généré côté serveur, TK-110). */
export function applyFixture(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as FixturePayload;
  const path = fixturePathOf(id);
  try {
    writeFile(
      workspace,
      path,
      emitFixtureYaml({
        id,
        titre: payload.title ?? "",
        table: payload.table ?? "",
        locale: payload.locale ?? "fr-FR",
        lignes: payload.rows ?? [],
      }),
    );
  } catch (error) {
    if (!(error instanceof EmitFixtureError)) throw error;
    invalidEmit(path, id, error);
  }
}
