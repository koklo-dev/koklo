import { z } from "zod";

const slug = "[a-z0-9][a-z0-9-]*";
const field = "[a-z_][a-z0-9_]*";
/** Segment d'une opération `zone.verbe` (TK-115) : la camelCase et `_` sont admis après le premier caractère. */
const segment = "[a-z0-9][A-Za-z0-9_-]*";
/** Opération `<zone>.<verbe>` : source partagée avec les motifs de chemin de `api/endpoints/`. */
export const OPERATION_NAME = `${segment}\\.${segment}`;

export const PATTERNS = {
  feature: /^F-\d{3,}$/,
  criterion: /^AC-\d+$/,
  table: new RegExp(`^T-${slug}$`),
  fixture: new RegExp(`^FX-${slug}$`),
  /** Endpoint : `E-<slug>` (format v1) ou `<zone>.<verbe>` (format v2). */
  endpoint: new RegExp(`^(E-${slug}|${OPERATION_NAME})$`),
  /** Opération du cahier technique (TK-115) : `<zone>.<verbe>` seul. */
  operation: new RegExp(`^${OPERATION_NAME}$`),
  /** Choix technique `ST-<slug>` (TK-115). */
  stack: new RegExp(`^ST-${slug}$`),
  /** Environnement `ENV-<slug>` (TK-115). */
  environment: new RegExp(`^ENV-${slug}$`),
  screen: new RegExp(`^S-${slug}$`),
  role: new RegExp(`^RL-${slug}$`),
  permission: new RegExp(`^PM-${slug}(\\.${slug})*$`),
  rule: /^R-\d{3,}$/,
  flow: new RegExp(`^P-${slug}$`),
  nfr: new RegExp(`^NFR-${slug}$`),
  /** Composant d'architecture `C-<slug>` (TK-111). */
  component: new RegExp(`^C-${slug}$`),
  /** Décision d'architecture `ADR-<nnn>` (TK-111, compteur `adr`). */
  adr: /^ADR-\d{3,}$/,
  tableField: new RegExp(`^T-${slug}\\.${field}$`),
  fieldName: new RegExp(`^${field}$`),
} as const;

export const featureId = z.string().regex(PATTERNS.feature);
export const criterionId = z.string().regex(PATTERNS.criterion);
export const tableId = z.string().regex(PATTERNS.table);
export const fixtureId = z.string().regex(PATTERNS.fixture);
export const endpointId = z.string().regex(PATTERNS.endpoint);
export const screenId = z.string().regex(PATTERNS.screen);
export const roleId = z.string().regex(PATTERNS.role);
export const permissionId = z.string().regex(PATTERNS.permission);
export const ruleId = z.string().regex(PATTERNS.rule);
export const flowId = z.string().regex(PATTERNS.flow);
export const componentId = z.string().regex(PATTERNS.component);
export const adrId = z.string().regex(PATTERNS.adr);
export const operationId = z.string().regex(PATTERNS.operation);
export const nfrId = z.string().regex(PATTERNS.nfr);
export const stackId = z.string().regex(PATTERNS.stack);
export const environmentId = z.string().regex(PATTERNS.environment);
