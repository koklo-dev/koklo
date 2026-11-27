import type {
  SecurityAsvsReport,
  SecurityRightsMatrix,
  SecuritySummaryCard,
  ThreatDetail,
  ThreatSummary,
} from "@koklo/contract";
import {
  ABUSE_SCENARIO_DIR,
  API_SURFACE_TITLE,
  type AsvsFile,
  abuseCases,
  asvsCoverage,
  type DataEntry,
  effectiveAsvsLevel,
  type MatrixRow,
  type RightsFile,
  type RolesFile,
  recommendedAsvsLevel,
  rightsMatrix,
  SECURITY_PROPOSAL_VOCABULARY,
  type SecuritySummary,
  summaryCards,
  type Threat,
  threatGherkin,
  threatStateOf,
} from "@koklo/schema";
import { englishOf, record } from "../spec-technical/technical-values.ts";

/**
 * Valeurs de l'index d'entités de la Sécurité (écrit par le worker depuis `security/`) rendues dans les mots du contrat
 * (anglais). Fonctions pures.
 */
const VOCABULARY = SECURITY_PROPOSAL_VOCABULARY;
const API = "api";

export interface IndexRow {
  readonly kind: string;
  readonly specId: string;
  readonly path: string;
  readonly data: unknown;
}

/** Mot du contrat pour une valeur de fichier (le worker n'indexe que des valeurs du format). */
export const english = <E extends string>(words: Readonly<Record<E, string>>, value: unknown): E =>
  englishOf(words, value, Object.keys(words)[0] as E);

export const threatOf = (data: unknown): Threat => data as Threat;

export const surfaceTitle = (id: string, titles: ReadonlyMap<string, string>): string =>
  id === API ? API_SURFACE_TITLE : (titles.get(id) ?? id);

export function threatSummary(row: Pick<IndexRow, "specId" | "data">): ThreatSummary {
  const threat = threatOf(row.data);
  return {
    id: row.specId,
    title: threat.titre,
    surface: threat.surfaces[0] ?? API,
    surfaces: [...threat.surfaces],
    category: english(VOCABULARY.category, threat.categorie),
    severity: english(VOCABULARY.severity, threat.gravite),
    status: threatStateOf(threat),
    verification: english(VOCABULARY.verification, threat.verification.mode),
  };
}

export function threatDetail(
  row: IndexRow,
  titles: ReadonlyMap<string, string>,
  commitSha: string,
): ThreatDetail {
  const threat = threatOf(row.data);
  const summary = threatSummary(row);
  const scripted = threat.verification.mode === "scenario";
  const { scenario, verification } = threat;
  return {
    ...summary,
    surfaceTitles: summary.surfaces.map((id) => ({ id, title: surfaceTitle(id, titles) })),
    risk: threat.risque,
    measures: [...threat.parades],
    ...(verification.detail === undefined ? {} : { verificationDetail: verification.detail }),
    ...(scenario ? { scenario: { when: scenario.quand, expected: scenario.alors } } : {}),
    links: [...threat.liens],
    gherkin: scripted ? threatGherkin(threat, surfaceTitle(summary.surface, titles)) : "",
    scenarioPath: scripted ? `${ABUSE_SCENARIO_DIR}/${row.specId}.feature` : null,
    filePath: row.path,
    commitSha,
  };
}

export const rowsOfKind = (rows: readonly IndexRow[], kind: string): IndexRow[] =>
  rows.filter((row) => row.kind === kind);
export const dataOf = <T>(rows: readonly IndexRow[], kind: string): T | undefined =>
  rows.find((row) => row.kind === kind)?.data as T | undefined;
export const entriesOf = (rows: readonly IndexRow[]): DataEntry[] =>
  rowsOfKind(rows, "sensitive").map((row) => row.data as DataEntry);

const ACCESS = { oui: "yes", non: "no", restreint: "restricted" } as const;

const cellsOf = (row: MatrixRow) =>
  row.cases.map(({ role, acces, restriction }) => ({
    role,
    access: ACCESS[acces],
    ...(restriction === undefined ? {} : { restriction }),
  }));

/** Matrice recalculée depuis les rôles de la tête : toujours à jour, même avant le prochain lot de sécurité. */
export function rightsView(
  roles: RolesFile | undefined,
  rights: RightsFile | undefined,
): Omit<SecurityRightsMatrix, "commitSha"> {
  const restrictions = rights?.restrictions ?? [];
  const matrix = roles ? rightsMatrix(roles, restrictions) : [];
  return {
    roles: (roles?.roles ?? []).map((role) => ({ id: role.id, name: role.nom })),
    actions: matrix.map((row) => ({ id: row.action, label: row.libelle, cells: cellsOf(row) })),
    restrictions: restrictions.map((entry) => ({ ...entry })),
    ownershipRules: [...(rights?.propriete ?? [])],
    abuseScenarios: abuseCases(matrix).length,
  };
}

export function asvsView(
  file: Partial<AsvsFile> | undefined,
  entries: readonly DataEntry[],
): Omit<SecurityAsvsReport, "commitSha"> {
  const level = effectiveAsvsLevel(file, entries);
  const coverage = asvsCoverage(file?.exigences ?? [], level);
  return {
    level,
    recommendedLevel: recommendedAsvsLevel(entries),
    chosen: file?.niveau !== undefined,
    chapters: coverage.chapters.map(({ chapitre, answered, total, where, state }) => ({
      chapter: english(VOCABULARY.chapter, chapitre),
      answered,
      total,
      where: [...where],
      status: state,
    })),
    answered: coverage.answered,
    total: coverage.total,
    facts: (file?.secrets_et_dependances ?? []).map((fact) => ({
      label: fact.libelle,
      value: fact.valeur,
    })),
  };
}

const CARD_KEYS = {
  donnees: "location",
  protection: "protection",
  acces: "access",
  connexion: "signIn",
  conservation: "retention",
  verification: "checks",
  incident: "incident",
} as const;

/** Les sept cartes du résumé ; vide sans résumé indexé. La conservation est recomposée à la lecture. */
export function summaryView(rows: readonly IndexRow[]): SecuritySummaryCard[] {
  const summary = dataOf<SecuritySummary>(rows, "security_summary");
  if (summary === undefined) return [];
  return summaryCards(summary, entriesOf(rows)).map(({ key, title, text }) => ({
    key: CARD_KEYS[key],
    title,
    text,
  }));
}

/** Identifiants de fonctionnalité des surfaces, pour lire leurs titres. */
export const featureSurfaces = (rows: readonly IndexRow[]): string[] => [
  ...new Set(
    rows.flatMap((row) => {
      const surfaces = record(row.data).surfaces;
      return Array.isArray(surfaces) ? surfaces.filter((id) => id !== API) : [];
    }),
  ),
];
