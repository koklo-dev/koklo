export * from "./ai/index.ts";
export {
  createDbClient,
  createRawDbClient,
  type PrismaClient,
  type TenantClient,
} from "./client.ts";
export {
  type CounterName,
  type CounterScope,
  raiseCounterTo,
  type TenantTx,
} from "./counters.ts";
export {
  type CurrentDataModel,
  type CurrentDomainTitles,
  type CurrentFeature,
  type CurrentTable,
  type CurrentTitle,
  currentDataModel,
  currentDomainTitles,
  currentFeatures,
  type DossierClient,
  type DossierSources,
  type FrozenPage,
  frozenPages,
  frozenVersion,
  previousVersion,
  publishedSynthesis,
  RISKS_SLUG,
  readFrozenDossier,
  versionsOf,
} from "./dossier-sources.ts";
export { SEARCH_LIMIT, type SearchTarget, searchIds, tsqueryOf } from "./full-text.ts";
export type { Prisma } from "./generated/client.ts";
export { latestMigration, type RollbackPorts, rollbackLatest } from "./rollback.ts";
export { SEED_IDS, seed } from "./seed.ts";
export {
  SEED_VOLUME_IDS,
  seedLarge,
  seedPlanche,
  seedVolume,
  type VolumeOptions,
  type VolumeProfile,
  type VolumeTarget,
} from "./seed-volume.ts";
export { PENDING_VOLUMES, SEED_VOLUMES } from "./seed-volumes.ts";
export {
  type EntityRef,
  entitiesReferencing,
  likePrefixOf,
  searchEntityIds,
  searchEntityRefs,
  tableRelationCounts,
  tableRelationTotal,
  tableZoneFacets,
} from "./spec-entity-queries.ts";
export {
  currentOrganizationId,
  MissingOrganizationContextError,
  OrganizationMismatchError,
  RawQueryNotAllowedError,
  withOrganization,
} from "./tenant-context.ts";
export {
  TENANT_EXCLUDED_MODELS,
  TENANT_MODELS,
  withTenantIsolation,
} from "./tenant-extension.ts";
