import { randomUUID } from "node:crypto";
import {
  type GitOwner,
  type GitUserCredentials,
  PROJECT_CREATION_QUEUE,
  projectCreationSingletonKey,
} from "@koklo/domain";
import { keyRingOf, sealUserCredentials } from "@koklo/github";
import { vi } from "vitest";
import type { WorkerBench } from "./spec-write-bench.ts";

/** Clé de chiffrement de test (jamais une vraie clé) et porte-clés correspondant. */
export const KEYRING = { current: { version: 1, key: Buffer.alloc(32, 5) }, previous: [] };

export interface CreationScene {
  organizationId: string;
  projectId: string;
  userId: string;
  installationId: string;
  creationId: string;
  owner: GitOwner;
}

export interface CreationOptions {
  ownerKind?: "user" | "organization";
  installationStatus?: "active" | "suspended" | "deleted";
  /** `false` : création sans installation choisie (aucun compte GitHub). */
  withInstallation?: boolean;
  repoName?: string;
  status?: string;
  userCredentials?: GitUserCredentials;
}

/** Organisation, membre demandeur, projet, installation et ligne `project_creations` `pending`. */
export async function seedCreation(
  bench: WorkerBench,
  options: CreationOptions = {},
): Promise<CreationScene> {
  const id = randomUUID();
  const kind = options.ownerKind ?? "organization";
  const scene: CreationScene = {
    organizationId: randomUUID(),
    projectId: randomUUID(),
    userId: randomUUID(),
    installationId: randomUUID(),
    creationId: randomUUID(),
    owner: { kind, login: `compte-${id.slice(0, 8)}` },
  };
  await bench.query(
    "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
    [scene.organizationId, `org-${id}`, `org-${id.slice(0, 8)}`],
  );
  await bench.query(
    "INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Demandeur', $2, true, now(), now())",
    [scene.userId, `u-${id.slice(0, 8)}@example.test`],
  );
  await bench.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'Refonte du portail', now(), now())",
    [scene.projectId, scene.organizationId],
  );
  await bench.query(
    `INSERT INTO provider_installations (id, organization_id, provider, external_id, owner_kind, owner_login, status, created_at, updated_at)
     VALUES ($1, $2, 'github', $3, $4::owner_kind, $5, $6::installation_status, now(), now())`,
    [
      scene.installationId,
      scene.organizationId,
      `${Math.floor(Math.random() * 1e9)}`,
      kind,
      scene.owner.login,
      options.installationStatus ?? "active",
    ],
  );
  await bench.query(
    `INSERT INTO project_creations (id, organization_id, project_id, status, repo_name, installation_id, idea_template, requested_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'default', $7, now(), now())`,
    [
      scene.creationId,
      scene.organizationId,
      scene.projectId,
      options.status ?? "pending",
      options.repoName ?? "refonte-du-portail-spec",
      options.withInstallation === false ? null : scene.installationId,
      scene.userId,
    ],
  );
  if (options.userCredentials) await seedCredentials(bench, scene, options.userCredentials);
  return scene;
}

/** Jeton utilisateur chiffré comme le fait l'API (AES-256-GCM, données associées utilisateur:installation). */
async function seedCredentials(
  bench: WorkerBench,
  scene: CreationScene,
  credentials: GitUserCredentials,
): Promise<void> {
  const cipher = keyRingOf({ encryptionKeyring: KEYRING });
  if (!cipher) throw new Error("porte-clés de test absent");
  await bench.query(
    `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, 'admin', now(), now())`,
    [randomUUID(), scene.organizationId, scene.userId],
  );
  const row = sealUserCredentials(cipher, scene.userId, scene.installationId, credentials);
  await bench.query(
    `INSERT INTO provider_user_credentials (id, organization_id, user_id, installation_id, ciphertext, nonce, key_version, expires_at, refresh_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
    [
      randomUUID(),
      scene.organizationId,
      scene.userId,
      scene.installationId,
      Buffer.from(row.ciphertext),
      Buffer.from(row.nonce),
      row.keyVersion,
      row.expiresAt,
      row.refreshExpiresAt,
    ],
  );
}

/** Dépose le job comme le fera l'API : `{ creationId }` seul, id et clé de singleton = création. */
export async function enqueueCreation(bench: WorkerBench, scene: CreationScene): Promise<void> {
  const worker = bench.worker;
  if (!worker) throw new Error("worker non démarré");
  await worker.boss.send(
    PROJECT_CREATION_QUEUE,
    { creationId: scene.creationId },
    { id: scene.creationId, singletonKey: projectCreationSingletonKey(scene.creationId) },
  );
}

export interface CreationRow {
  status: string;
  error_code: string | null;
  retry_after_ms: number | null;
}

export async function creationRow(bench: WorkerBench, creationId: string): Promise<CreationRow> {
  const [row] = await bench.query<CreationRow>(
    "SELECT status, error_code, retry_after_ms FROM project_creations WHERE id = $1",
    [creationId],
  );
  if (!row) throw new Error("création introuvable");
  return row;
}

/** Attend un statut réglé (jamais `pending` ni `running`). */
export function settledCreation(bench: WorkerBench, creationId: string, timeout = 40_000) {
  return vi.waitFor(
    async () => {
      const row = await creationRow(bench, creationId);
      if (row.status === "pending" || row.status === "running") {
        throw new Error(`création ${creationId} non réglée (${row.status})`);
      }
      return row;
    },
    { timeout, interval: 150 },
  );
}

export const repoRows = (bench: WorkerBench, projectId: string) =>
  bench.query<{ role: string; mode: string; name: string; owner_login: string }>(
    "SELECT role, mode, name, owner_login FROM project_repos WHERE project_id = $1",
    [projectId],
  );
