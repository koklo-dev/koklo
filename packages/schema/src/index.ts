export { CanonicalizeError, canonicalize } from "./canonical.ts";
export { ISSUE_CODES, type IssueCode } from "./codes.ts";
export {
  DOC_SECTION_DIR,
  DOC_SECTION_STATUSES,
  type DocSection,
  type DocSectionStatus,
  docSectionPath,
  docSectionSlugOf,
  EmitDocSectionError,
  emitDocSection,
  parseDocSection,
} from "./doc-section.ts";
export { EmitAdrError, emitAdrMarkdown } from "./emit/adr-markdown.ts";
export {
  EmitArchFlowError,
  EmitComponentError,
  emitArchFlowYaml,
  emitComponentYaml,
} from "./emit/architecture-yaml.ts";
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
export { EmitRolesError, emitRolesYaml } from "./emit/roles-yaml.ts";
export { EmitRuleError, emitRuleMarkdown } from "./emit/rule-markdown.ts";
export { emitSchemaMermaid } from "./emit/schema-mermaid.ts";
export { EmitTableError, emitTableYaml } from "./emit/table-yaml.ts";
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
export { parseTableFile } from "./parse/table-file.ts";
export * from "./proposals/index.ts";
export {
  type ArchitectureInput,
  type ArchitectureWarning,
  type ArchitectureWarningCode,
  architectureChecks,
} from "./rules/architecture-checks.ts";
export { checkCriteriaSteps } from "./rules/rule5-criteria.ts";
export type { Issue, Parsed, ParsedSpec, SpecFile, ValidationReport } from "./types.ts";
export { checkSpec, validateSpec } from "./validate.ts";
