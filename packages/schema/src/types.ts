import type {
  Adr,
  ArchFlow,
  BusinessRule,
  Component,
  Endpoint,
  EnvironmentsFile,
  Feature,
  Fixture,
  Flow,
  Nfr,
  Operation,
  ProjectManifest,
  RelationsFile,
  RolesFile,
  Screen,
  Stack,
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
  /** Endpoints au format REST seuls ; les opérations du cahier technique sont dans `operations`. */
  endpoints: Parsed<Endpoint>[];
  screens: Parsed<Screen>[];
  tests: Parsed<TestScenario>[];
  roles: Parsed<RolesFile>[];
  rules: Parsed<BusinessRule>[];
  flows: Parsed<Flow>[];
  fixtures: Parsed<Fixture>[];
  components: Parsed<Component>[];
  archFlows: Parsed<ArchFlow>[];
  adrs: Parsed<Adr>[];
  stacks: Parsed<Stack>[];
  operations: Parsed<Operation>[];
  nfrs: Parsed<Nfr>[];
  environments: Parsed<EnvironmentsFile>[];
};
