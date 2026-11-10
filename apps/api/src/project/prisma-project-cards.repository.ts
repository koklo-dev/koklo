import { withOrganization } from "@koklo/db";
import type { ProjectCreationErrorCode, ProjectCreationStatus } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import {
  readActivity,
  readBaselines,
  readClients,
  readIdea,
  readSpec,
  readSprints,
  readStaff,
} from "./prisma-project-cards-reads.ts";
import type {
  CardsRead,
  CardsRequest,
  ProjectCardsRepository,
} from "./project-cards.repository.ts";
import type { CardFacts } from "./project-cards.ts";
import {
  type CreationRecord,
  creationStatusOf,
  showsCreationCard,
} from "./project-creation-status.ts";

/** Dernière tentative de création de chaque projet, avec le compte GitHub choisi (une requête chacune). */
async function readCreations(
  tx: Tx,
  ids: readonly string[],
): Promise<Map<string, CreationRecord & { createdAt: Date }>> {
  const rows = await tx.projectCreation.findMany({
    where: { projectId: { in: [...ids] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const installations = await tx.providerInstallation.findMany({
    where: { id: { in: rows.flatMap((row) => row.installationId ?? []) } },
    select: { id: true, ownerLogin: true },
  });
  const login = new Map(
    installations.map((installation) => [installation.id, installation.ownerLogin]),
  );
  const failedInvitation = new Set(
    rows.filter((row) => row.invitationFailed).map((row) => row.projectId),
  );
  const latest = new Map<string, CreationRecord & { createdAt: Date }>();
  for (const row of rows) {
    if (latest.has(row.projectId)) continue;
    latest.set(row.projectId, {
      status: row.status as ProjectCreationStatus,
      errorCode: row.errorCode as ProjectCreationErrorCode | null,
      retryAfterMs: row.retryAfterMs,
      repoName: row.repoName,
      invitationFailed: failedInvitation.has(row.projectId),
      ownerLogin: row.installationId ? (login.get(row.installationId) ?? null) : null,
      createdAt: row.createdAt,
    });
  }
  return latest;
}

/** Projets pour lesquels une invitation a été proposée (en plus des clients déjà liés). */
async function readInvited(tx: Tx, ids: readonly string[]): Promise<Set<string>> {
  const rows = await tx.invitationProject.findMany({
    where: { projectId: { in: [...ids] } },
    select: { projectId: true },
  });
  return new Set(rows.map((row) => row.projectId));
}

interface GroupedReads {
  staff: Awaited<ReturnType<typeof readStaff>>;
  clients: Awaited<ReturnType<typeof readClients>>;
  idea: Awaited<ReturnType<typeof readIdea>>;
  baselines: Awaited<ReturnType<typeof readBaselines>>;
  specs: Awaited<ReturnType<typeof readSpec>>;
  sprints: Awaited<ReturnType<typeof readSprints>>;
  activity: Awaited<ReturnType<typeof readActivity>>;
  creations: Awaited<ReturnType<typeof readCreations>>;
  invited: Set<string>;
}

/** Les faits d'un projet, assemblés depuis les lectures groupées (aucune lecture ici). */
function factsOf(project: CardFacts["project"], read: GroupedReads, canAct: boolean): CardFacts {
  const spec = read.specs.get(project.id);
  const pages = read.idea.pages.get(project.id) ?? [];
  const proposals = read.idea.proposals.get(project.id);
  const clients = read.clients.get(project.id) ?? [];
  const creation = read.creations.get(project.id);
  const invited = clients.length > 0 || read.invited.has(project.id);
  return {
    project,
    phaseFacts: {
      featureCount: spec?.featureCount ?? 0,
      validatedBaselines: read.baselines.get(project.id) ?? 0,
      ideaVersions: read.idea.versions.get(project.id) ?? 0,
    },
    pages,
    clients,
    staff: read.staff,
    spec: spec
      ? { failed: spec.failed, head: spec.head, verdicts: spec.verdicts }
      : { failed: false, head: null, verdicts: [] },
    sprint: read.sprints.get(project.id) ?? null,
    pendingProposals: proposals?.count ?? 0,
    proposalAuthor: proposals?.author ?? null,
    activity: read.activity.get(project.id) ?? null,
    creation:
      creation && showsCreationCard(creation.status)
        ? creationStatusOf(creation, { ideaPages: pages.length, invited, canAct })
        : null,
  };
}

@Injectable()
export class PrismaProjectCardsRepository implements ProjectCardsRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  read(request: CardsRequest): Promise<CardsRead> {
    const { organizationId, visibleProjectIds } = request;
    if (visibleProjectIds?.length === 0) return Promise.resolve({ facts: [], aiConfigured: null });
    return withOrganization(organizationId, () => this.readAll(this.database.client, request));
  }

  private async readAll(tx: Tx, request: CardsRequest): Promise<CardsRead> {
    const projects = await tx.project.findMany({
      where: request.visibleProjectIds ? { id: { in: [...request.visibleProjectIds] } } : {},
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, createdAt: true },
    });
    const ids = projects.map((project) => project.id);
    const [staff, clients, idea, baselines, specs, sprints, activity, creations, invited] =
      await Promise.all([
        readStaff(tx),
        readClients(tx, ids),
        readIdea(tx, ids),
        readBaselines(tx, ids),
        readSpec(tx, ids),
        readSprints(tx, ids),
        readActivity(tx, ids, request.audience),
        readCreations(tx, ids),
        readInvited(tx, ids),
      ]);
    const aiConfigured = request.withAi
      ? (await tx.llmProviderCredential.count({ where: { invalidatedAt: null } })) > 0
      : null;
    const read = { staff, clients, idea, baselines, specs, sprints, activity, creations, invited };
    const facts = projects.map((project) => factsOf(project, read, request.canAct));
    return { facts, aiConfigured };
  }
}
