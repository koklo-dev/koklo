import { criteriaProposalSchema, featureProposalSchema } from "./feature.ts";
import { flowProposalSchema, roleProposalSchema, ruleProposalSchema } from "./others.ts";

export { isSafeText, safeText } from "./ai-text-policy.ts";
export {
  CRITERIA_MAX,
  criteriaListSchema,
  criteriaProposalSchema,
  featureProposalSchema,
} from "./feature.ts";
export { jsonSchemaOf } from "./json-schema.ts";
export { flowProposalSchema, roleProposalSchema, ruleProposalSchema } from "./others.ts";

/** Un schéma de charge par type de proposition (ordre du vocabulaire `AGENT_PROPOSAL_KINDS`). */
export const PROPOSAL_SCHEMAS = {
  feature: featureProposalSchema,
  criteria: criteriaProposalSchema,
  rule: ruleProposalSchema,
  role: roleProposalSchema,
  flow: flowProposalSchema,
} as const;
