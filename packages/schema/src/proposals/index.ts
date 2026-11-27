import {
  adrProposalSchema,
  archflowProposalSchema,
  componentProposalSchema,
  docSectionProposalSchema,
} from "./architecture.ts";
import { fixturesProposalSchema, relationsProposalSchema, tableProposalSchema } from "./data.ts";
import { criteriaProposalSchema, featureProposalSchema } from "./feature.ts";
import { flowProposalSchema, roleProposalSchema, ruleProposalSchema } from "./others.ts";
import {
  asvsProposalSchema,
  rightProposalSchema,
  sensitiveProposalSchema,
  summaryProposalSchema,
  threatProposalSchema,
} from "./security.ts";
import {
  environmentProposalSchema,
  nfrProposalSchema,
  operationProposalSchema,
  stackProposalSchema,
} from "./technical.ts";

export { isSafeText, safeText } from "./ai-text-policy.ts";
export {
  adrProposalSchema,
  archflowProposalSchema,
  componentDependencySchema,
  componentProposalSchema,
  docSectionProposalSchema,
} from "./architecture.ts";
export {
  fixturesProposalSchema,
  relationsProposalSchema,
  tableProposalSchema,
} from "./data.ts";
export {
  CRITERIA_MAX,
  criteriaListSchema,
  criteriaProposalSchema,
  featureProposalSchema,
} from "./feature.ts";
export { jsonSchemaOf } from "./json-schema.ts";
export { flowProposalSchema, roleProposalSchema, ruleProposalSchema } from "./others.ts";
export {
  asvsProposalSchema,
  rightProposalSchema,
  SECURITY_PROPOSAL_VOCABULARY,
  securityProposalTitle,
  sensitiveProposalSchema,
  summaryProposalSchema,
  threatProposalSchema,
} from "./security.ts";
export {
  environmentProposalSchema,
  nfrProposalSchema,
  operationProposalSchema,
  stackProposalSchema,
  TECHNICAL_PROPOSAL_VOCABULARY,
} from "./technical.ts";

/** Un schéma de charge par type de proposition (ordre du vocabulaire `AGENT_PROPOSAL_KINDS`). */
export const PROPOSAL_SCHEMAS = {
  feature: featureProposalSchema,
  criteria: criteriaProposalSchema,
  rule: ruleProposalSchema,
  role: roleProposalSchema,
  flow: flowProposalSchema,
  table: tableProposalSchema,
  relations: relationsProposalSchema,
  fixtures: fixturesProposalSchema,
  component: componentProposalSchema,
  archflow: archflowProposalSchema,
  adr: adrProposalSchema,
  doc_section: docSectionProposalSchema,
  stack: stackProposalSchema,
  op: operationProposalSchema,
  nfr: nfrProposalSchema,
  env: environmentProposalSchema,
  threat: threatProposalSchema,
  sensitive: sensitiveProposalSchema,
  right: rightProposalSchema,
  asvs: asvsProposalSchema,
  summary: summaryProposalSchema,
} as const;
