import type { RepoBench } from "./repo-scene.ts";
import type { SpecReadScene } from "./spec-read.ts";

const BOT = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" } as const;

/** Commit `files` sur `cadrage` puis fait pointer l'instantané indexé dessus (le service lit git au SHA indexé). */
export async function commitAtHead(
  bench: RepoBench,
  s: SpecReadScene,
  snapshotId: string,
  files: { path: string; content: string }[],
): Promise<string> {
  const auth = await bench.harness.authFor(s.owner);
  const commit = await bench.harness.inner.writeCommit({
    auth,
    repo: s.ref,
    branch: "cadrage",
    author: BOT,
    message: "test: fichiers de l'architecture",
    files,
  });
  await bench.database.query("UPDATE spec_snapshots SET commit_sha = $2 WHERE id = $1", [
    snapshotId,
    commit.sha,
  ]);
  return commit.sha;
}

/** Chemin que le worker a posé à une entité indexée (les graines de test en inventent un par défaut). */
export async function setEntityPath(
  bench: RepoBench,
  snapshotId: string,
  specId: string,
  path: string,
): Promise<void> {
  await bench.database.query(
    "UPDATE spec_entities SET path = $3 WHERE snapshot_id = $1 AND spec_id = $2",
    [snapshotId, specId, path],
  );
}
