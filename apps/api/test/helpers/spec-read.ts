import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { RepoRef } from "@koklo/domain";
import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import type { RepoBench } from "./repo-scene.ts";
import { type InstallationRow, insertInstallation, repoApi } from "./repos.ts";
import { createWorld, send, type World } from "./tickets.ts";

/**
 * Banc des tests `spec.head|listFeatures|getFeature` (TK-45c2). L'index est écrit en SQL (ce que
 * produit le worker de 45b), le contenu de git dans le faux fournisseur. Contrat attendu :
 *  - lecture de l'index seule pour `head` et `listFeatures` (aucun appel fournisseur) ;
 *  - `getFeature` lit git au commit indexé (`readFile` avec le SHA du snapshot) ;
 *  - hors périmètre (projet ou organisation) : NOT_FOUND, jamais FORBIDDEN.
 */
export const SPEC_BRANCH = "cadrage";

/** Client des procédures spec.* de lecture du contrat 0.6.0 (HTTP réel). */
export function specReadApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    head: (projectId: string, query = "") =>
      send(app, cookie, "get", `/projects/${projectId}/spec${query}`),
    list: (projectId: string, query = "") =>
      send(app, cookie, "get", `/projects/${projectId}/spec/features${query}`),
    get: (projectId: string, specId: string) =>
      send(app, cookie, "get", `/projects/${projectId}/spec/features/${specId}`),
  };
}

export interface CriterionSeed {
  titre: string;
  etapes?: { type: "etant_donne" | "quand" | "alors" | "et"; texte: string }[];
}

export interface FeatureSeed {
  /** `F-nnn` (au moins trois chiffres). */
  id: string;
  titre?: string;
  statut?: "brouillon" | "specifiee" | "implementee" | "adoptee";
  priorite?: "must" | "should" | "could" | "wont";
  description?: string;
  criteres?: CriterionSeed[];
  tables?: string[];
  endpoints?: string[];
  ecrans?: string[];
  roles?: string[];
  regles?: string[];
  nfr?: string[];
}

export interface SpecReadScene {
  world: World;
  installation: InstallationRow;
  owner: { kind: "organization"; login: string };
  ref: RepoRef;
  repoId: string;
  projectId: string;
  organizationId: string;
}

/**
 * Projet avec son dépôt de spec (par `repo.createSpec`), journal du fournisseur vidé. Sans option :
 * un monde neuf et son projet ; avec `world`/`projectId` : un autre projet d'un monde existant.
 */
export async function readScene(
  bench: RepoBench,
  over: { world?: World; projectId?: string } = {},
): Promise<SpecReadScene> {
  const world = over.world ?? (await createWorld(bench.database));
  const projectId = over.projectId ?? world.projectId;
  const installation = await insertInstallation(bench.database, world.organizationId);
  const created = await repoApi(bench.app, world.actors.owner).createSpec(
    projectId,
    installation.id,
  );
  if (created.status !== 200) throw new Error(`createSpec : ${JSON.stringify(created.body)}`);
  const [row] = await bench.database.query<{ id: string }>(
    "SELECT id FROM project_repos WHERE project_id = $1",
    [projectId],
  );
  bench.harness.calls = [];
  const owner = { kind: "organization", login: installation.ownerLogin } as const;
  return {
    world,
    installation,
    owner,
    ref: { owner, name: created.body.name } as RepoRef,
    repoId: row?.id ?? "",
    projectId,
    organizationId: world.organizationId,
  };
}

const slugOf = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Chemin (relatif à la racine de la spec) du fichier d'une feature. */
export const featurePath = (seed: FeatureSeed) =>
  `features/${seed.id}-${slugOf(seed.titre ?? seed.id)}.md`;

export async function featureMarkdown(seed: FeatureSeed): Promise<string> {
  const { emitFeatureMarkdown } = await import("@koklo/schema");
  return emitFeatureMarkdown({
    id: seed.id,
    titre: seed.titre ?? `Feature ${seed.id}`,
    statut: seed.statut ?? "brouillon",
    priorite: seed.priorite ?? "should",
    tables: seed.tables ?? [],
    endpoints: seed.endpoints ?? [],
    ecrans: seed.ecrans ?? [],
    roles: seed.roles ?? [],
    regles: seed.regles ?? [],
    nfr: seed.nfr ?? [],
    description: seed.description ?? "",
    criteres: (seed.criteres ?? []).map((criterion, index) => ({
      id: `AC-${index + 1}`,
      titre: criterion.titre,
      etapes: criterion.etapes ?? [],
    })),
  } as Parameters<typeof emitFeatureMarkdown>[0]);
}

export interface SeedOptions {
  branch?: string;
  /** Commit réel dans le faux (nécessaire à `getFeature`) ; sinon SHA fictif. */
  commit?: boolean;
  status?: "building" | "ready" | "failed";
  errorCode?: string | null;
  /** Dossier de la spec dans un monorepo (préfixe des chemins git). */
  specPath?: string;
  /** Ne pas déplacer la tête de branche (instantané ancien). */
  noHead?: boolean;
  indexedAt?: string;
  tables?: string[];
  endpoints?: { id: string; method: string; path: string }[];
}

const randomSha = () => randomUUID().replaceAll("-", "").padEnd(40, "0").slice(0, 40);

async function commitFeatures(
  bench: RepoBench,
  s: SpecReadScene,
  branch: string,
  features: FeatureSeed[],
  prefix: string,
): Promise<string> {
  const auth = await bench.harness.authFor(s.owner);
  const files = await Promise.all(
    features.map(async (seed) => ({
      path: `${prefix}${featurePath(seed)}`,
      content: await featureMarkdown(seed),
    })),
  );
  const commit = await bench.harness.inner.writeCommit({
    auth,
    repo: s.ref,
    branch,
    author: { name: "Koklo", email: "koklo-bot@users.noreply.invalid" },
    message: "test: état de la spec",
    files,
  });
  bench.harness.calls = [];
  return commit.sha;
}

async function insertEntities(
  db: TestDatabase,
  s: SpecReadScene,
  snapshotId: string,
  features: FeatureSeed[],
  options: SeedOptions,
): Promise<void> {
  const org = s.organizationId;
  for (const seed of features) {
    const featureId = randomUUID();
    await db.query(
      `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status, priority, file_path, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
      [
        featureId,
        org,
        snapshotId,
        seed.id,
        seed.titre ?? `Feature ${seed.id}`,
        seed.statut ?? "brouillon",
        seed.priorite ?? "should",
        featurePath(seed),
      ],
    );
    for (const [index, criterion] of (seed.criteres ?? []).entries()) {
      await db.query(
        `INSERT INTO spec_criteria (id, organization_id, feature_id, spec_id, position, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
        [randomUUID(), org, featureId, `AC-${index + 1}`, index + 1, criterion.titre],
      );
    }
  }
  for (const id of options.tables ?? []) {
    await db.query(
      `INSERT INTO spec_tables (id, organization_id, snapshot_id, spec_id, file_path, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())`,
      [randomUUID(), org, snapshotId, id, `data/tables/${id}.json`],
    );
  }
  for (const endpoint of options.endpoints ?? []) {
    await db.query(
      `INSERT INTO spec_endpoints (id, organization_id, snapshot_id, spec_id, method, path, file_path, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::endpoint_method, $6, $7, now(), now())`,
      [
        randomUUID(),
        org,
        snapshotId,
        endpoint.id,
        endpoint.method,
        endpoint.path,
        `api/${endpoint.id}.json`,
      ],
    );
  }
}

/** Indexe `features` comme le ferait le worker : instantané, entités, tête de branche. */
export async function seedIndex(
  bench: RepoBench,
  s: SpecReadScene,
  features: FeatureSeed[],
  options: SeedOptions = {},
): Promise<{ sha: string; snapshotId: string }> {
  const branch = options.branch ?? SPEC_BRANCH;
  const sha = options.commit
    ? await commitFeatures(
        bench,
        s,
        branch,
        features,
        options.specPath ? `${options.specPath}/` : "",
      )
    : randomSha();
  const snapshotId = randomUUID();
  await bench.database.query(
    `INSERT INTO spec_snapshots (id, organization_id, repo_id, commit_sha, status, error_code, indexed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::spec_index_status, $6, $7, now(), now())`,
    [
      snapshotId,
      s.organizationId,
      s.repoId,
      sha,
      options.status ?? "ready",
      options.errorCode ?? null,
      options.indexedAt ?? "2026-10-31T10:00:00.000Z",
    ],
  );
  await insertEntities(bench.database, s, snapshotId, features, options);
  if (!options.noHead) await moveHead(bench.database, s, branch, snapshotId);
  return { sha, snapshotId };
}

/** Pointe `branch` sur `snapshotId` (création ou déplacement de la tête). */
export async function moveHead(
  database: TestDatabase,
  s: Pick<SpecReadScene, "organizationId" | "repoId">,
  branch: string,
  snapshotId: string,
): Promise<void> {
  await database.query(
    `INSERT INTO spec_heads (organization_id, repo_id, branch, snapshot_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (repo_id, branch) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id, updated_at = now()`,
    [s.organizationId, s.repoId, branch, snapshotId],
  );
}

/** Nombre de lignes du journal d'audit de l'organisation (une lecture n'y écrit jamais). */
export async function auditTotal(database: TestDatabase, organizationId: string): Promise<number> {
  const rows = await database.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
    [organizationId],
  );
  return rows[0]?.n ?? 0;
}

/** Change le `spec_path` du dépôt de spec (monorepo : la spec vit dans un sous-dossier, le rôle n'est alors plus `spec`). */
export async function setSpecPath(
  database: TestDatabase,
  s: SpecReadScene,
  specPath: string,
): Promise<void> {
  await database.query("UPDATE project_repos SET role = 'front', spec_path = $2 WHERE id = $1", [
    s.repoId,
    specPath,
  ]);
}
