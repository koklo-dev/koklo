import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { createSeededDatabase } from "./app.ts";
import { ManualClock } from "./leases.ts";
import {
  createRepoApp,
  insertInstallation,
  installAuditFailTrigger,
  ProviderHarness,
  type RepoAppOptions,
  repoApi,
  TestCredentialsStore,
} from "./repos.ts";
import { createWorld, type World } from "./tickets.ts";

/**
 * Banc des tests d'intégration `repo.*` : base réelle migrée et peuplée, application réelle dont
 * l'horloge, le fournisseur git (faux en mémoire espionné) et le magasin de jetons sont remplacés.
 * `install()` doit être appelé au niveau du fichier (beforeAll/afterAll/beforeEach enregistrés).
 */
export interface RepoBench {
  database: TestDatabase;
  app: INestApplication;
  clock: ManualClock;
  harness: ProviderHarness;
  credentials: TestCredentialsStore;
}

export type Bench = () => RepoBench;

export function installBench(
  hooks: {
    beforeAll: (fn: () => Promise<void>) => void;
    afterAll: (fn: () => Promise<void>) => void;
    beforeEach: (fn: () => Promise<void>) => void;
  },
  options: Pick<RepoAppOptions, "logStream"> = {},
): Bench {
  let bench: RepoBench | undefined;
  hooks.beforeAll(async () => {
    const database = await createSeededDatabase();
    const clock = new ManualClock();
    const harness = await ProviderHarness.create(clock);
    harness.watchTransactions(database);
    await installAuditFailTrigger(database);
    const credentials = new TestCredentialsStore();
    const app = await createRepoApp(database.url, {
      clock,
      provider: harness.provider,
      credentials,
      ...options,
    });
    bench = { database, app, clock, harness, credentials };
  });
  hooks.afterAll(async () => {
    await bench?.app.close();
    await bench?.database.dispose();
  });
  hooks.beforeEach(async () => {
    if (!bench) return;
    bench.harness.reset();
    bench.credentials.credentials.clear();
    bench.credentials.saved.length = 0;
    await bench.database.query("DELETE FROM audit_fail");
  });
  return () => {
    if (!bench) throw new Error("banc de test non initialisé (beforeAll a échoué)");
    return bench;
  };
}

/** Monde (organisation, projet « Projet », un utilisateur par rôle) + installation active d'organisation. */
export async function scene(bench: RepoBench) {
  const world: World = await createWorld(bench.database);
  const installation = await insertInstallation(bench.database, world.organizationId);
  return {
    world,
    installation,
    api: repoApi(bench.app, world.actors.owner),
    owner: { kind: "organization", login: installation.ownerLogin } as const,
  };
}
