import { randomUUID } from "node:crypto";
import { migrateDeploy } from "@koklo/db/testing";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { startTestPostgres } from "./postgres.ts";

/** Une organisation, un projet et un destinataire membre (adresse unique par scène). */
export interface NotificationScene {
  organizationId: string;
  organizationName: string;
  projectId: string;
  userId: string;
  email: string;
}

export interface SeedNotification {
  id?: string;
  type?: string;
  subjectKind?: string;
  subjectRef?: string;
  projectId?: string | null;
  recipientUserId?: string;
  /** Âge de la notification en heures (défaut 0). */
  ageHours?: number;
  emailState?: "pending" | "sent" | "skipped" | "failed";
  readAt?: Date | null;
}

/**
 * Banc des tests du store d'e-mails de notification (TK-58b) : Postgres éphémère migré par
 * `migrateDeploy`, lignes insérées en SQL (les colonnes `email_state`/`emailed_at` viennent de la
 * migration TK-58a). Aucun réseau.
 */
export class NotificationBench {
  readonly container: StartedPostgreSqlContainer;
  private readonly pool: pg.Pool;

  private constructor(container: StartedPostgreSqlContainer) {
    this.container = container;
    this.pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  }

  static async create(): Promise<NotificationBench> {
    const container = await startTestPostgres();
    migrateDeploy(container.getConnectionUri());
    return new NotificationBench(container);
  }

  get url(): string {
    return this.container.getConnectionUri();
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return (await this.pool.query<T>(sql, params)).rows;
  }

  async scene(label: string, opts: { verified?: boolean } = {}): Promise<NotificationScene> {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const userId = randomUUID();
    const organizationName = `Org ${label} ${organizationId.slice(0, 6)}`;
    const email = `${label}-${userId.slice(0, 8)}@koklo.test`;
    await this.query(
      "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
      [organizationId, organizationName, `slug-${organizationId}`],
    );
    await this.query(
      "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
      [projectId, organizationId, `project-${label}`],
    );
    await this.query(
      "INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())",
      [userId, `User ${label}`, email, opts.verified ?? true],
    );
    await this.addMember(organizationId, userId);
    return { organizationId, organizationName, projectId, userId, email };
  }

  async addMember(organizationId: string, userId: string): Promise<void> {
    await this.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'member', now(), now())`,
      [randomUUID(), organizationId, userId],
    );
  }

  async notify(scene: NotificationScene, o: SeedNotification = {}): Promise<string> {
    const id = o.id ?? randomUUID();
    const state = o.emailState ?? "pending";
    await this.query(
      `INSERT INTO notifications (id, organization_id, recipient_user_id, project_id, type, subject_kind,
         subject_ref, dedupe_key, read_at, email_state, emailed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 = 'sent' THEN now() END,
         now() - make_interval(hours => $11::int), now())`,
      [
        id,
        scene.organizationId,
        o.recipientUserId ?? scene.userId,
        o.projectId === undefined ? scene.projectId : o.projectId,
        o.type ?? "baseline.proposed",
        o.subjectKind ?? "baseline",
        o.subjectRef ?? "baseline-0",
        `dedupe:${id}`,
        o.readAt ?? null,
        state,
        o.ageHours ?? 0,
      ],
    );
    return id;
  }

  async stateOf(id: string): Promise<{ email_state: string; emailed_at: Date | null } | undefined> {
    return (
      await this.query<{ email_state: string; emailed_at: Date | null }>(
        "SELECT email_state, emailed_at FROM notifications WHERE id = $1",
        [id],
      )
    )[0];
  }

  async dispose(): Promise<void> {
    await this.pool.end().catch(() => undefined);
    await this.container.stop();
  }
}
