import {
  API_SURFACE,
  type Feature,
  type MatrixRow,
  type Operation,
  PATTERNS,
  type RolesFile,
  type Threat,
} from "../entities/index.ts";
import { compare } from "../issue.ts";
import type { SpecFile } from "../types.ts";
import { groupedBy } from "./group.ts";
import { type AbuseCase, abuseCases } from "./rights.ts";
import { oneLineOf } from "./text.ts";

/**
 * Scénarios d'abus Gherkin générés (TK-117, B793) : un fichier par menace vérifiée par scénario, un par rôle pour les
 * cases « non » ou restreintes de la matrice. Chaque valeur tient sur sa ligne : aucun texte ne peut ouvrir une étape,
 * une étiquette ou un scénario. Non indexés ; fonctions pures.
 */
export const ABUSE_SCENARIO_DIR = "quality/scenarios/abuse";
export const API_SURFACE_TITLE = "API, secrets et intégrations";
const STEP_MAX = 600;
const GENERATED = new RegExp(
  `^${ABUSE_SCENARIO_DIR}/(?:SEC-T\\d{2,}|droits-[a-z0-9][a-z0-9-]*)\\.feature$`,
);

/** Fichier écrit par ce générateur : les périmés se suppriment, tout autre fichier est laissé. */
export const isAbuseScenarioPath = (path: string): boolean => GENERATED.test(path);

const line = (text: string): string => oneLineOf(text, STEP_MAX);
const lines = (rows: readonly string[]): string => `${rows.join("\n")}\n`;
/** Étiquettes : un identifiant de fonctionnalité ou « api », rien d'autre. */
const tags = (ids: readonly string[]): string[] =>
  ids.filter((id) => id === API_SURFACE || PATTERNS.feature.test(id)).map((id) => `@${id}`);

/** Scénario d'une menace ; sans « Quand / Alors » écrits, texte déterministe tiré du titre. */
export function threatGherkin(threat: Threat, featureTitle: string): string {
  const when = threat.scenario?.quand ?? `quelqu'un tente : ${threat.titre}`;
  const then = threat.scenario?.alors ?? "l'action est refusée";
  return lines([
    "# language: fr",
    [`@${line(threat.id)}`, ...tags(threat.surfaces), "@abus"].join(" "),
    `Fonctionnalité: ${line(featureTitle)}`,
    "",
    `  Scénario: ${line(threat.titre)}`,
    "    Étant donné les jeux de données d'exemple du projet",
    `    Quand ${line(when)}`,
    `    Alors ${line(then)}`,
  ]);
}

function rightScenario(role: string, entry: AbuseCase, features: readonly string[]): string[] {
  const denied = entry.acces === "non";
  const limit = line(entry.restriction ?? "non précisée");
  const label = line(entry.libelle);
  return [
    "",
    ["  @droits @abus", ...tags(features)].join(" "),
    denied ? `  Scénario: Interdit · ${label}` : `  Scénario: Restreint · ${label} : ${limit}`,
    `    Étant donné un compte « ${role} »`,
    denied
      ? `    Quand il tente : ${label}`
      : `    Quand il tente : ${label} au-delà de la restriction « ${limit} »`,
    "    Alors la réponse est 403 ou 404",
  ];
}

export interface AbuseScenarioInput {
  readonly threats: readonly Threat[];
  readonly matrix: readonly MatrixRow[];
  readonly roles: RolesFile | undefined;
  readonly features: readonly Pick<Feature, "id" | "titre">[];
  readonly operations: readonly Pick<Operation, "id" | "permission" | "sert">[];
}

/** Fonctionnalités servies par les opérations d'une permission : celles qui la déclarent ou qu'elle cite. */
function featuresOf({ roles, operations }: AbuseScenarioInput, permission: string): string[] {
  const cited: readonly string[] =
    roles?.permissions.find((entry) => entry.id === permission)?.endpoints ?? [];
  const served = operations
    .filter((operation) => operation.permission === permission || cited.includes(operation.id))
    .flatMap((operation) => operation.sert);
  return [...new Set(served)].sort(compare);
}

function threatFiles({ threats, features }: AbuseScenarioInput): SpecFile[] {
  const titles = new Map<string, string>(features.map((feature) => [feature.id, feature.titre]));
  return threats
    .filter((threat) => threat.verification.mode === "scenario")
    .map((threat) => {
      const surface = threat.surfaces[0] as string;
      const title = surface === API_SURFACE ? API_SURFACE_TITLE : (titles.get(surface) ?? surface);
      const path = `${ABUSE_SCENARIO_DIR}/${threat.id}.feature`;
      return { path, content: threatGherkin(threat, title) };
    });
}

function rightsFiles(input: AbuseScenarioInput): SpecFile[] {
  const byRole = groupedBy(abuseCases(input.matrix), (entry) => entry.role);
  return [...byRole].map(([id, cases]) => {
    const name = line(input.roles?.roles.find((role) => role.id === id)?.nom ?? id);
    const scenarios = cases.flatMap((entry) =>
      rightScenario(name, entry, featuresOf(input, entry.action)),
    );
    return {
      path: `${ABUSE_SCENARIO_DIR}/droits-${id.replace(/^RL-/, "")}.feature`,
      content: lines(["# language: fr", `Fonctionnalité: Droits · ${name}`, ...scenarios]),
    };
  });
}

/** Tous les fichiers de scénarios d'abus de la spec, triés par chemin. */
export const abuseScenarioFiles = (input: AbuseScenarioInput): SpecFile[] =>
  [...threatFiles(input), ...rightsFiles(input)].sort((a, b) => compare(a.path, b.path));
