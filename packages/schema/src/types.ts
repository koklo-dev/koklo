import type {
  Endpoint,
  Feature,
  ProjectManifest,
  RelationsFile,
  Screen,
  Table,
  TestScenario,
} from "./entities/index.ts";

/** Un fichier du dépôt de spec, tel que fourni par l'appelant (aucune I/O ici). */
export type SpecFile = { path: string; content: string };

export type Issue = {
  rule: 4 | 5 | 7 | "structure";
  code: string;
  severity: "error" | "warning";
  path: string;
  pointer: string;
  entityId?: string;
  message: string;
};

export type ValidationReport = {
  ok: boolean;
  counts: { error: number; warning: number };
  issues: Issue[];
};

export type Parsed<T> = { path: string; value: T };

export type ParsedSpec = {
  project?: Parsed<ProjectManifest>;
  features: Parsed<Feature>[];
  tables: Parsed<Table>[];
  relations: Parsed<RelationsFile>[];
  endpoints: Parsed<Endpoint>[];
  screens: Parsed<Screen>[];
  tests: Parsed<TestScenario>[];
};
