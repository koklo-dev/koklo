import type { Snapshot, SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { GitSource, IndexFailure } from "./spec-architecture.repository.ts";

export const failureOf = (snapshot: Snapshot): IndexFailure => ({
  kind: "failed",
  errorCode: snapshot.errorCode ?? "unknown",
  commitSha: snapshot.commitSha,
});

type Found = NonNullable<Awaited<ReturnType<SpecHeadResolver["resolve"]>>>;

/** Instantané lisible : `null` (rien d'indexé), échec d'indexation, ou l'instantané dont les entités sont indexées. */
export async function readableHead(
  resolver: SpecHeadResolver,
  tx: Tx,
  scope: ProjectScope,
  revision: Revision,
) {
  const found = await resolver.resolve(tx, scope, revision);
  const snapshot = found?.snapshot;
  if (!found || !snapshot) return null;
  if (snapshot.status === "failed") return failureOf(snapshot);
  return snapshot.entitiesIndexedAt === null ? null : { found, snapshot };
}

/** Où lire git pour l'instantané lisible : commit, dossier de spec, dépôt, propriétaire et installation. */
export async function gitSourceOf(tx: Tx, found: Found, snapshot: Snapshot): Promise<GitSource> {
  const installation = await tx.providerInstallation.findFirst({
    where: { id: found.repo.installationId },
  });
  return {
    commitSha: snapshot.commitSha,
    specPath: found.repo.specPath,
    repoName: found.repo.name,
    owner: { kind: installation?.ownerKind ?? "organization", login: found.repo.ownerLogin },
    installation: {
      id: installation?.id ?? "",
      externalId: installation?.externalId ?? "",
      active: installation?.status === "active",
    },
  };
}
