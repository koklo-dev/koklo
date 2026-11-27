import { slugOf } from "@koklo/domain";
import { PATTERNS } from "@koklo/schema";
import { nextCounterValue } from "../tracker/counters.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { PreparedOperation } from "./spec-batch.repository.ts";

const numbered = (prefix: string, value: number): string =>
  `${prefix}-${String(value).padStart(3, "0")}`;

/** Identifiant d'un rôle nouveau : `RL-<slug du nom>`. Une collision est tranchée par le worker (`write_conflict`). */
export const roleIdOf = (name: unknown): string => `RL-${slugOf(name, "role")}`;
/** Identifiant d'un parcours nouveau : `P-<slug du titre>`. */
export const flowIdOf = (title: unknown): string => `P-${slugOf(title, "parcours")}`;

/** Identifiant d'une table nouvelle : `T-<slug du nom>` (B385). Une collision est tranchée par le worker (`write_conflict`). */
export const tableIdOf = (name: unknown): string => `T-${slugOf(name, "table")}`;
/** Identifiant d'un jeu d'exemple nouveau : `FX-<slug du titre>`. */
export const fixtureIdOf = (title: unknown): string => `FX-${slugOf(title, "jeu")}`;

/** Identifiant d'un composant nouveau : `C-<slug du nom>` (B514). Une collision est tranchée par le worker (`write_conflict`). */
export const componentIdOf = (name: unknown): string => `C-${slugOf(name, "composant")}`;
/** Identifiant d'une section du document nouvelle : `DOC-<slug du titre>` ; le worker pose le numéro NN du fichier. */
export const docSectionIdOf = (title: unknown): string => `DOC-${slugOf(title, "section")}`;

/** Identifiant d'un choix technique nouveau : `ST-<slug du rôle>` (TK-115). */
export const stackIdOf = (role: unknown): string => `ST-${slugOf(role, "choix")}`;
/** Identifiant d'un environnement nouveau : `ENV-<slug du nom>` (TK-115). */
export const environmentIdOf = (name: unknown): string => `ENV-${slugOf(name, "environnement")}`;

/**
 * Créations dont l'identifiant se déduit du texte saisi, sans compteur : `RL-`, `P-`, `T-`, `FX-`, `C-`, `DOC-`, `ST-`,
 * `ENV-`, le flux technique et l'opération (son nom `<zone>.<verbe>`).
 */
const SLUG_IDS: Readonly<Record<string, (payload: Record<string, unknown>) => string>> = {
  "role.create": (payload) => roleIdOf(payload.name),
  "flow.create": (payload) => flowIdOf(payload.title),
  "table.create": (payload) => tableIdOf(payload.name),
  "fixture.create": (payload) => fixtureIdOf(payload.title),
  "component.create": (payload) => componentIdOf(payload.name),
  "archflow.create": (payload) => String(payload.flow ?? ""),
  "doc.section.create": (payload) => docSectionIdOf(payload.title),
  "stack.create": (payload) => stackIdOf(payload.role),
  "env.create": (payload) => environmentIdOf(payload.name),
  "op.create": (payload) => String(payload.name ?? ""),
};

/** Identifiant d'une création déduit de son texte (pré-vérification, TK-114e), `null` pour une création numérotée par compteur. */
export const slugSpecIdOf = (
  operation: Pick<PreparedOperation, "kind" | "payload">,
): string | null => SLUG_IDS[operation.kind]?.(operation.payload) ?? null;

/**
 * Opérations sans élément cible dans l'index : droits, exigences ASVS (leur identifiant voyage dans la charge), résumé.
 */
const TARGETLESS = new Set([
  "right.create",
  "right.delete",
  "asvs.set_level",
  "asvs.create",
  "asvs.update",
  "summary.update",
]);
const DATA_FIELD = PATTERNS.dataField;

/** Entrée de données : son premier champ ; une table seule est développée par le worker, sans identifiant ici. */
const dataEntryIdOf = (payload: Record<string, unknown>): string | null => {
  const [first] = Array.isArray(payload.fields) ? payload.fields : [];
  return typeof first === "string" && DATA_FIELD.test(first) ? first : null;
};

const threatIdOf = (value: number): string => `SEC-T${String(value).padStart(2, "0")}`;

/**
 * Identifiant d'une création, attribué à l'enfilage : `F-nnn` et `R-nnn` par les compteurs du projet (jamais deux fois la
 * même valeur, même en concurrence), `ADR-nnn` par le compteur `adr` (TK-111), `NFR-nnn` par le compteur `nfr` (TK-115), les
 * autres d'après le texte saisi ; un flux technique porte le `P-` du parcours qu'il détaille (`flow`), `SEC-Tnn` par le
 * compteur `threat` (TK-117) ; une entrée de données, son premier champ. `null` : opération sans cible.
 */
export async function createdSpecId(
  tx: Tx,
  scope: ProjectScope,
  operation: PreparedOperation,
): Promise<string | null> {
  const { kind } = operation;
  if (TARGETLESS.has(kind)) return null;
  if (kind === "sensitive.create") return dataEntryIdOf(operation.payload);
  if (kind === "threat.create") return threatIdOf(await nextCounterValue(tx, scope, "threat"));
  if (kind === "rule.create") return numbered("R", await nextCounterValue(tx, scope, "rule"));
  if (kind === "adr.create") return numbered("ADR", await nextCounterValue(tx, scope, "adr"));
  if (kind === "nfr.create") return numbered("NFR", await nextCounterValue(tx, scope, "nfr"));
  return slugSpecIdOf(operation) ?? numbered("F", await nextCounterValue(tx, scope, "feature"));
}
