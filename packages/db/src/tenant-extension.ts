import type { PrismaClient } from "./generated/client.ts";
import {
  currentOrganizationId,
  MissingOrganizationContextError,
  OrganizationMismatchError,
  RawQueryNotAllowedError,
} from "./tenant-context.ts";

/** Modèles métier : toute opération exige un contexte d'organisation et est filtrée par lui. */
export const TENANT_MODELS: readonly string[] = [
  "Project",
  "Ticket",
  "TicketLabel",
  "TicketFeature",
  "AcceptanceCriterion",
  "TicketDependency",
  "Sprint",
  "ProjectState",
  "Lease",
  "TicketComment",
  "AuditLog",
  "ProjectCounter",
  "ProviderInstallation",
  "ProjectRepo",
  "SpecSnapshot",
  "SpecHead",
  "SpecFeature",
  "SpecCriterion",
  "SpecTable",
  "SpecEndpoint",
  "SpecFeatureTable",
  "SpecFeatureEndpoint",
  "SpecWriteBatch",
  "SpecWriteOperation",
  "ProviderAuthState",
  "Suggestion",
  "ProviderUserCredential",
  "LlmProviderCredential",
];

/** Modèles portant (ou non) `organizationId` mais hors filtre, avec la raison de l'exclusion. */
export const TENANT_EXCLUDED_MODELS: Record<string, string> = {
  User: "Identité globale, sans organisation : gérée par Better Auth sur le client brut.",
  Session: "Session Better Auth portant l'organisation active, lue avant tout contexte.",
  Account: "Compte OAuth Better Auth lié à un utilisateur, pas à une organisation.",
  Verification: "Jeton de vérification Better Auth, sans organisation.",
  Organization: "Racine des organisations : lue avant d'ouvrir un contexte.",
  Member: "organizationId géré par le plugin organization de Better Auth.",
  Invitation: "organizationId géré par le plugin organization de Better Auth.",
  WebhookDelivery:
    "Journal de réception signé mais reçu avant de connaître l'organisation (l'événement installation précède provider_installations) : sans organization_id, lu par le worker via le client brut.",
};

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: unknown;
};

const FILTERED = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

function requireOrganization(): string {
  const organizationId = currentOrganizationId();
  if (!organizationId) {
    throw new MissingOrganizationContextError("Tenant model accessed outside withOrganization");
  }
  return organizationId;
}

/** Affecte l'organisation du contexte à une ligne, ou refuse une autre organisation. */
function scopeRow(row: unknown, organizationId: string): Record<string, unknown> {
  const data = (row ?? {}) as Record<string, unknown>;
  if ("organization" in data) {
    throw new OrganizationMismatchError("Relation 'organization' is not allowed on tenant writes");
  }
  if (data.organizationId !== undefined && data.organizationId !== organizationId) {
    throw new OrganizationMismatchError("Write targets another organization");
  }
  return { ...data, organizationId };
}

/**
 * Refuse un upsert dont la cible existe dans une autre organisation (sinon, filtré par `where`, il
 * créerait un doublon dans l'organisation courante).
 *
 * Limite connue (TOCTOU) : le contrôle et l'upsert sont deux requêtes distinctes. Si une autre
 * transaction crée la ligne de l'autre organisation entre les deux, l'upsert tente un `create` avec
 * le même identifiant et échoue sur la contrainte unique (jamais d'écriture ni de lecture
 * inter-organisation). La contrainte unique est donc le filet ; la fenêtre ne se protège pas sans
 * transaction interactive, volontairement non ouverte ici. Le contrôle passe par le client brut.
 */
async function assertUpsertTargetOwned(
  client: PrismaClient,
  model: string,
  where: unknown,
  organizationId: string,
): Promise<void> {
  const delegate = client[(model.charAt(0).toLowerCase() + model.slice(1)) as "project"];
  const existing = await delegate.findUnique({
    where: where as never,
    select: { organizationId: true },
  });
  if (existing && existing.organizationId !== organizationId) {
    throw new OrganizationMismatchError("Upsert targets a row of another organization");
  }
}

function scopeArgs(operation: string, args: Args, organizationId: string): Args {
  if (FILTERED.has(operation)) {
    return { ...args, where: { ...args.where, organizationId } };
  }
  switch (operation) {
    case "create":
      return { ...args, data: scopeRow(args.data, organizationId) };
    case "createMany":
    case "createManyAndReturn": {
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      return { ...args, data: rows.map((row) => scopeRow(row, organizationId)) };
    }
    case "upsert":
      return {
        ...args,
        where: { ...args.where, organizationId },
        create: scopeRow(args.create, organizationId),
      };
    default:
      // Fermé par défaut : une opération inconnue ne passe jamais sans filtre.
      throw new MissingOrganizationContextError(`Unsupported tenant operation: ${operation}`);
  }
}

function refuseRaw(): never {
  throw new RawQueryNotAllowedError("Raw queries are not allowed on the tenant client");
}

/** Hook commun à tous les modèles : filtre les modèles métier, laisse passer les autres. */
function tenantQuery(client: PrismaClient) {
  return async ({
    model,
    operation,
    args,
    query,
  }: {
    model: string;
    operation: string;
    args: unknown;
    query: (args: never) => Promise<unknown>;
  }) => {
    if (!TENANT_MODELS.includes(model)) return query(args as never);
    const organizationId = requireOrganization();
    const scoped = scopeArgs(operation, args as Args, organizationId);
    if (operation === "upsert") {
      await assertUpsertTargetOwned(client, model, (args as Args).where, organizationId);
    }
    return query(scoped as never);
  };
}

/** Étend un client brut : filtre/affecte `organizationId` sur les modèles métier, refuse le SQL brut. */
export function withTenantIsolation(client: PrismaClient) {
  return client.$extends({
    name: "koklo-tenant",
    query: {
      $allModels: {
        $allOperations: tenantQuery(client),
      },
      $queryRaw: refuseRaw,
      $executeRaw: refuseRaw,
      $queryRawUnsafe: refuseRaw,
      $executeRawUnsafe: refuseRaw,
    },
  });
}

export type TenantClient = ReturnType<typeof withTenantIsolation>;
