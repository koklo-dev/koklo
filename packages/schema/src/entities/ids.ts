import { z } from "zod";

const slug = "[a-z0-9][a-z0-9-]*";
const field = "[a-z_][a-z0-9_]*";

export const PATTERNS = {
  feature: /^F-\d{3,}$/,
  criterion: /^AC-\d+$/,
  table: new RegExp(`^T-${slug}$`),
  fixture: new RegExp(`^FX-${slug}$`),
  /** Endpoint : `E-<slug>` (format v1) ou `<zone>.<verbe>` (format v2). */
  endpoint: new RegExp(`^(E-${slug}|${slug}\\.${slug})$`),
  screen: new RegExp(`^S-${slug}$`),
  role: new RegExp(`^RL-${slug}$`),
  permission: new RegExp(`^PM-${slug}(\\.${slug})*$`),
  rule: /^R-\d{3,}$/,
  flow: new RegExp(`^P-${slug}$`),
  nfr: new RegExp(`^NFR-${slug}$`),
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
