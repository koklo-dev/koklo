import { randomUUID } from "node:crypto";
import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type {
  GitAuth,
  GitOwner,
  GitProvider,
  GitUserCredentials,
  Repo,
  RepoRef,
} from "@koklo/domain";
import type { InMemoryGitProvider } from "@koklo/github/testing";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module.ts";
import type { AppConfig } from "../../src/config.ts";
import { configFor } from "./app.ts";
import { ManualClock } from "./leases.ts";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/**
 * Contrat attendu de la production (TK-43) :
 *  - `src/repo/tokens.ts` exporte les jetons Nest `GIT_PROVIDER` (valeur `GitProvider | null`,
 *    `null` = App non configurée) et `USER_CREDENTIALS` (port `UserCredentialsStore`) ;
 *  - `AppConfig.githubApp?: { appId, privateKey, clientId?, clientSecret? }` (ID + clé tout ou rien ; client optionnel).
 * Les imports de production sont différés : un module absent fait échouer le test qui en a besoin,
 * pas tous les fichiers qui importent ce helper.
 */

export interface RecordedCall {
  method: string;
  request: Record<string, unknown>;
  /** Résultat (absent si l'appel a échoué). */
  result?: unknown;
  failed: boolean;
  /** Transactions SQL de l'API ouvertes au moment de l'appel (doit être 0 : aucun réseau en transaction). */
  openTransactions: number;
}

/** Fournisseur de test : le faux en mémoire (état réel), enveloppé d'un espion qui sait échouer. */
export class ProviderHarness {
  calls: RecordedCall[] = [];
  /** Échec programmé par méthode : levé à la place de l'appel (`once` : une seule fois). */
  private failures = new Map<string, { error: unknown; once: boolean }>();
  private ids = 0;
  inner!: InMemoryGitProvider;
  /** Compteur de transactions ouvertes (branché sur la base de test par `watchTransactions`). */
  private countOpenTransactions: () => Promise<number> = async () => 0;
  private readonly Impl: typeof InMemoryGitProvider;
  private readonly clock: ManualClock;
  readonly provider: GitProvider;

  private constructor(Impl: typeof InMemoryGitProvider, clock: ManualClock) {
    this.Impl = Impl;
    this.clock = clock;
    this.reset();
    this.provider = new Proxy({} as GitProvider, {
      get: (_target, name) =>
        typeof name === "string" && typeof Reflect.get(this.inner, name) === "function"
          ? this.wrap(name)
          : undefined,
    });
  }

  static async create(clock: ManualClock): Promise<ProviderHarness> {
    const { InMemoryGitProvider: Impl } = await import("@koklo/github/testing");
    return new ProviderHarness(Impl, clock);
  }

  /** Nouveau faux vide, aucun appel enregistré, aucun échec programmé. */
  reset(): void {
    this.calls = [];
    this.failures.clear();
    this.inner = new this.Impl({
      now: () => new Date(this.clock.now()),
      nextId: () => `id${String(++this.ids).padStart(6, "0")}`,
    });
  }

  watchTransactions(database: TestDatabase): void {
    this.countOpenTransactions = () => openTransactions(database);
  }

  failWith(method: string, error: unknown, options: { once?: boolean } = {}): void {
    this.failures.set(method, { error, once: options.once ?? false });
  }

  names(): string[] {
    return this.calls.map((call) => call.method);
  }

  callsOf(method: string): RecordedCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /** Crée directement un dépôt dans le faux (sans passer par l'API). */
  async seedRepo(owner: GitOwner, name: string): Promise<Repo> {
    const auth = await this.inner.authenticate({ installation: { id: "seed", owner } });
    return this.inner.createRepo({ auth, owner, name, visibility: "private" });
  }

  async authFor(owner: GitOwner): Promise<GitAuth> {
    return this.inner.authenticate({ installation: { id: "inspect", owner } });
  }

  async inspect(ref: RepoRef) {
    const auth = await this.authFor(ref.owner);
    return {
      repo: await this.inner.getRepo({ auth, repo: ref }),
      read: (path: string, branch: string) =>
        this.inner.readFile({ auth, repo: ref, ref: branch, path }),
    };
  }

  private wrap(method: string) {
    return async (request: Record<string, unknown>) => {
      const call: RecordedCall = {
        method,
        request,
        failed: false,
        openTransactions: await this.countOpenTransactions(),
      };
      this.calls.push(call);
      const failure = this.failures.get(method);
      if (failure) {
        if (failure.once) this.failures.delete(method);
        call.failed = true;
        throw failure.error;
      }
      const target = this.inner as unknown as Record<string, (r: unknown) => Promise<unknown>>;
      try {
        call.result = await target[method]?.call(this.inner, request);
      } catch (error) {
        call.failed = true;
        throw error;
      }
      return call.result;
    };
  }
}

/** Transactions applicatives restées ouvertes (connexions « idle in transaction ») : exclut tout appel réseau transactionnel. */
export async function openTransactions(database: TestDatabase): Promise<number> {
  const rows = await database.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
        AND xact_start IS NOT NULL AND state = 'idle in transaction'
        AND query NOT ILIKE '%pg_stat_activity%'`,
  );
  return rows[0]?.n ?? 0;
}

/** Magasin de jetons utilisateur de test (port `UserCredentialsStore` de la production). */
export class TestCredentialsStore {
  readonly credentials = new Map<string, GitUserCredentials>();
  readonly saved: { userId: string; installationId: string; credentials: GitUserCredentials }[] =
    [];

  set(userId: string, installationId: string, credentials: GitUserCredentials): void {
    this.credentials.set(`${userId}:${installationId}`, credentials);
  }

  async find(userId: string, installationId: string): Promise<GitUserCredentials | undefined> {
    return this.credentials.get(`${userId}:${installationId}`);
  }

  async save(
    userId: string,
    installationId: string,
    credentials: GitUserCredentials,
  ): Promise<void> {
    this.saved.push({ userId, installationId, credentials });
    this.credentials.set(`${userId}:${installationId}`, credentials);
  }
}

export interface RepoAppOptions {
  clock?: ManualClock;
  /** Absent : le fournisseur résolu par la configuration (null sans `githubApp`). */
  provider?: GitProvider | null;
  credentials?: TestCredentialsStore;
  githubApp?: { appId: string; privateKey: string; clientId?: string; clientSecret?: string };
  logStream?: { write: (line: string) => void };
  appEnv?: AppConfig["appEnv"];
}

/** Application réelle (base réelle) dont seuls l'horloge, le fournisseur git et le magasin de jetons sont remplacés. */
export async function createRepoApp(
  databaseUrl: string,
  options: RepoAppOptions = {},
): Promise<INestApplication> {
  const { CLOCK } = await import("../../src/clock.ts");
  const { GIT_PROVIDER, USER_CREDENTIALS } = await import("../../src/repo/tokens.ts");
  const config = {
    ...configFor({ databaseUrl, appEnv: options.appEnv }),
    // Les journaux ne sont émis (niveau info) que si le test les capture.
    logLevel: options.logStream ? "info" : "silent",
    githubApp: options.githubApp,
  } as AppConfig;
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logStream: options.logStream })],
  })
    .overrideProvider(CLOCK)
    .useValue(options.clock ?? new ManualClock());
  if (options.provider !== undefined) {
    builder = builder.overrideProvider(GIT_PROVIDER).useValue(options.provider);
  }
  if (options.credentials) {
    builder = builder.overrideProvider(USER_CREDENTIALS).useValue(options.credentials);
  }
  const app = (await builder.compile()).createNestApplication();
  await app.init();
  return app;
}

/** Client des procédures repo.* du contrat 0.5.0 (HTTP réel). */
export function repoApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    createSpec: (projectId: string, installationId: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", `/projects/${projectId}/spec-repo`, {
        projectId,
        installationId,
        ...over,
      }),
    link: (projectId: string, installationId: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", `/projects/${projectId}/repos`, {
        projectId,
        installationId,
        role: "front",
        ownerLogin: "acme",
        name: "demo",
        ...over,
      }),
    list: (projectId: string) => send(app, cookie, "get", `/projects/${projectId}/repos`),
  };
}

export interface InstallationRow {
  id: string;
  externalId: string;
  ownerKind: "organization" | "user";
  ownerLogin: string;
}

let installations = 0;

/** Installation insérée par le client brut (le flux d'installation n'est pas livré par TK-43). */
export async function insertInstallation(
  database: TestDatabase,
  organizationId: string,
  over: Partial<InstallationRow> & { status?: "active" | "suspended" | "deleted" } = {},
): Promise<InstallationRow> {
  const row: InstallationRow = {
    id: randomUUID(),
    externalId: over.externalId ?? `${9_000_000 + ++installations}`,
    ownerKind: over.ownerKind ?? "organization",
    ownerLogin: over.ownerLogin ?? `acme-${installations}`,
  };
  await database.query(
    `INSERT INTO provider_installations (id, organization_id, provider, external_id, owner_kind, owner_login, status, created_at, updated_at)
     VALUES ($1, $2, 'github', $3, $4, $5, $6, now(), now())`,
    [
      row.id,
      organizationId,
      row.externalId,
      row.ownerKind,
      row.ownerLogin,
      over.status ?? "active",
    ],
  );
  return row;
}

export interface ProjectRepoRow {
  id: string;
  project_id: string;
  installation_id: string;
  role: string;
  mode: string;
  external_id: string;
  owner_login: string;
  name: string;
  default_branch: string;
  spec_path: string | null;
}

export function projectRepoRows(
  database: TestDatabase,
  organizationId: string,
  projectId?: string,
): Promise<ProjectRepoRow[]> {
  return database.query<ProjectRepoRow>(
    `SELECT id, project_id, installation_id, role, mode, external_id, owner_login, name, default_branch, spec_path
       FROM project_repos
      WHERE organization_id = $1 AND ($2::uuid IS NULL OR project_id = $2::uuid)
      ORDER BY created_at, id`,
    [organizationId, projectId ?? null],
  );
}

/** Insère un repo lié directement (fixture de `repo.list`). */
export async function insertProjectRepo(
  database: TestDatabase,
  organizationId: string,
  projectId: string,
  installationId: string,
  over: Partial<Omit<ProjectRepoRow, "id">> & { createdAt?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `INSERT INTO project_repos (id, organization_id, project_id, installation_id, role, mode, external_id, owner_login, name, default_branch, spec_path, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
    [
      id,
      organizationId,
      projectId,
      installationId,
      over.role ?? "front",
      over.mode ?? "adopted",
      over.external_id ?? `ext-${id}`,
      over.owner_login ?? "acme",
      over.name ?? `repo-${id.slice(0, 8)}`,
      over.default_branch ?? "main",
      over.spec_path ?? null,
      over.createdAt ?? "2026-01-01T00:00:00.000Z",
    ],
  );
  return id;
}

/** Table pilotant l'échec d'un audit (même mécanisme que TK-30 à TK-32) : l'écriture auditée doit être annulée. */
export async function installAuditFailTrigger(database: TestDatabase): Promise<void> {
  await database.query("CREATE TABLE IF NOT EXISTS audit_fail (action text PRIMARY KEY)");
  await database.query(`
    CREATE OR REPLACE FUNCTION audit_fail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM audit_fail WHERE action = NEW.action) THEN
        RAISE EXCEPTION 'audit refusé pour le test: %', NEW.action;
      END IF;
      RETURN NEW;
    END $$`);
  await database.query("DROP TRIGGER IF EXISTS audit_fail_trigger ON audit_log");
  await database.query(
    "CREATE TRIGGER audit_fail_trigger BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_fail_guard()",
  );
}

export const ROLES_DENIED_MANAGE: Role[] = ["dev", "designer", "client", "business"];

export const DEFAULT_REPO_NAME = "projet-spec";
