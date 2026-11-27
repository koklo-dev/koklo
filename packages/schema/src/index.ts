export { CanonicalizeError, canonicalize } from "./canonical.ts";
export { ISSUE_CODES, type IssueCode } from "./codes.ts";
export {
  DOC_SECTION_DELIVERABLES,
  DOC_SECTION_DIR,
  DOC_SECTION_DIRS,
  DOC_SECTION_STATUSES,
  type DocSection,
  type DocSectionDeliverable,
  type DocSectionStatus,
  docSectionPath,
  docSectionSlugOf,
  EmitDocSectionError,
  emitDocSection,
  parseDocSection,
  SECURITY_DOSSIER_SECTIONS,
} from "./doc-section.ts";
export { EmitAdrError, emitAdrMarkdown } from "./emit/adr-markdown.ts";
export {
  EmitArchFlowError,
  EmitComponentError,
  emitArchFlowYaml,
  emitComponentYaml,
} from "./emit/architecture-yaml.ts";
export { emitAsvsYaml } from "./emit/asvs-yaml.ts";
export { EmitEnvironmentsError, emitEnvironmentsYaml } from "./emit/environments-yaml.ts";
export { EmitError } from "./emit/errors.ts";
export { EmitFeatureError, emitFeatureMarkdown } from "./emit/feature-markdown.ts";
export { EmitFixtureError, emitFixtureYaml } from "./emit/fixture-yaml.ts";
export { emitFlowMermaid } from "./emit/flow-mermaid.ts";
export { EmitFlowError, emitFlowYaml } from "./emit/flow-yaml.ts";
export {
  EmitIdeaError,
  emitIdeaIndex,
  emitIdeaPage,
  emitIdeaSynthesis,
  type IdeaIndex,
  type IdeaIndexPage,
  type IdeaPageFile,
  type IdeaPageFileOrigin,
  type IdeaPageFileStatus,
  type IdeaSynthesisFile,
} from "./emit/idea.ts";
export { emitModelMermaid, type TableRelation, tableRelations } from "./emit/model-mermaid.ts";
export { EmitNfrError, emitNfrYaml } from "./emit/nfr-yaml.ts";
export { EmitOperationError, emitOperationYaml } from "./emit/operation-yaml.ts";
export { emitRightsYaml } from "./emit/rights-yaml.ts";
export { EmitRolesError, emitRolesYaml } from "./emit/roles-yaml.ts";
export { EmitRuleError, emitRuleMarkdown } from "./emit/rule-markdown.ts";
export { emitSchemaMermaid } from "./emit/schema-mermaid.ts";
export { emitSecurityDataYaml } from "./emit/security-data-yaml.ts";
export { EmitSecurityError } from "./emit/security-error.ts";
export { EmitStackError, emitStackYaml } from "./emit/stack-yaml.ts";
export { emitSummaryMarkdown } from "./emit/summary-markdown.ts";
export { EmitTableError, emitTableYaml } from "./emit/table-yaml.ts";
export { emitThreatYaml } from "./emit/threat-yaml.ts";
export * from "./entities/index.ts";
export {
  type FixtureRow,
  fixtureRowCount,
  generateFixturePage,
  generateFixtureRow,
} from "./fixture-generator.ts";
export { jsonSchemas, type SchemaName } from "./json-schemas.ts";
export {
  MIGRATION_EXTRA_PATHS,
  type MigrationChange,
  type MigrationResult,
  migrateSpecToV2,
} from "./migrate/index.ts";
export { parseAdrMarkdown } from "./parse/adr-markdown.ts";
export { parseFeatureMarkdown } from "./parse/feature-markdown.ts";
export { parseSpecFiles } from "./parse/files.ts";
export { parseFlowFile } from "./parse/flow-file.ts";
export { isFlowPath, isTableDirPath, type Kind, kindOf, type SpecVersion } from "./parse/kinds.ts";
export { parseRuleMarkdown } from "./parse/rule-markdown.ts";
export { parseSummaryMarkdown } from "./parse/summary-markdown.ts";
export { parseTableFile } from "./parse/table-file.ts";
export * from "./proposals/index.ts";
export {
  type ArchitectureCoverage,
  type ArchitectureCoverageInput,
  type ArchitectureInput,
  type ArchitectureWarning,
  type ArchitectureWarningCode,
  architectureChecks,
  architectureCoverage,
  type CoverageCount,
  closesSyncCycle,
  synchronousGraph,
} from "./rules/architecture-checks.ts";
export {
  DIRECT_COMPONENT_TYPES,
  type Exchange,
  entryAppsOf,
  exchangesOf,
  type FlowItemInput,
  isDirectFlow,
  isRoleId,
  type RoleComponent,
  type RoleFlow,
  roleCoverage,
  roleSideOf,
} from "./rules/architecture-roles.ts";
export { checkCriteriaSteps } from "./rules/rule5-criteria.ts";
export { findSecretPaths, SECRET_REFUSAL_MESSAGE, SECRET_VALUE_CODE } from "./secrets.ts";
export {
  ABUSE_SCENARIO_DIR,
  type AbuseScenarioInput,
  API_SURFACE_TITLE,
  abuseScenarioFiles,
  isAbuseScenarioPath,
  threatGherkin,
} from "./security/abuse-gherkin.ts";
export {
  type AsvsCoverage,
  asvsCoverage,
  type ChapterCoverage,
  effectiveAsvsLevel,
  recommendedAsvsLevel,
} from "./security/asvs.ts";
export {
  blockerReasonOf,
  expandDataFields,
  isPersonalData,
  type ModelTable,
  modelFields,
  type SecurityBlockerFacts,
  type SecurityBlockerReason,
  type SecurityBlockers,
  securityBlockers,
  type ThreatState,
  threatStateOf,
  unclassifiedFields,
  undecidedEntries,
} from "./security/blockers.ts";
export {
  type RegistryInput,
  rgpdRegistry,
  type SecurityContext,
  type SecurityContextFacts,
  securityContext,
} from "./security/registry.ts";
export {
  type AbuseCase,
  abuseCases,
  permissionLabel,
  rightsFileOf,
  rightsMatrix,
} from "./security/rights.ts";
export {
  RETENTION_UNDECIDED,
  retentionText,
  type SummaryCard,
  summaryCards,
} from "./security/summary.ts";
export {
  exposedSurfaces,
  surfacesToComplete,
  unansweredRequirements,
} from "./security/surfaces.ts";
export { technicalTraceIn } from "./security/text.ts";
export {
  adrIndex,
  archFlowIndex,
  componentIndex,
  conflictsOf,
  type DocSections,
  docSectionIndex,
  endpointIndex,
  type FlowIndex,
  featureIdOfPath,
  featureIndex,
  fixtureIndex,
  flowIndex,
  genreOf,
  nfrIndex,
  presentAtHead,
  ruleIndex,
  type SpecConflict,
  type SpecConflictReason,
  type SpecPathIndex,
  type SpecPathOperation,
  specPathIndex,
  stackIndex,
  tableIndex,
  threatIndex,
} from "./spec-path-index.ts";
export type { Issue, Parsed, ParsedSpec, SpecFile, ValidationReport } from "./types.ts";
export { checkSpec, validateSpec } from "./validate.ts";
