import pg from "pg";

/** Identifiants fixes du jeu de démo : stables d'une exécution à l'autre et d'un poste à l'autre. */
export const SEED_IDS = {
  organization: "01900000-0000-7000-8000-000000000001",
  adminUser: "01900000-0000-7000-8000-000000000002",
  clientUser: "01900000-0000-7000-8000-000000000003",
  adminMember: "01900000-0000-7000-8000-000000000004",
  clientMember: "01900000-0000-7000-8000-000000000005",
  project: "01900000-0000-7000-8000-000000000006",
} as const;

/** Horodatage fixe : le seed n'utilise jamais l'horloge, sinon deux exécutions diffèrent. */
const SEED_DATE = "2026-01-01T00:00:00.000Z";

const STATEMENTS: { sql: string; params: unknown[] }[] = [
  {
    sql: `INSERT INTO organizations (id, name, slug, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug,
            created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    params: [SEED_IDS.organization, "Organisation de démo", "demo", SEED_DATE],
  },
  ...(
    [
      [SEED_IDS.adminUser, "Alice Admin", "admin@demo.koklo.test"],
      [SEED_IDS.clientUser, "Claire Cliente", "client@demo.koklo.test"],
    ] as const
  ).map(([id, name, email]) => ({
    sql: `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
          VALUES ($1, $2, $3, true, $4, $4)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
            email_verified = EXCLUDED.email_verified, created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at`,
    params: [id, name, email, SEED_DATE],
  })),
  ...(
    [
      [SEED_IDS.adminMember, SEED_IDS.adminUser, "admin"],
      [SEED_IDS.clientMember, SEED_IDS.clientUser, "client"],
    ] as const
  ).map(([id, userId, role]) => ({
    sql: `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $5)
          ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id,
            user_id = EXCLUDED.user_id, role = EXCLUDED.role,
            created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    params: [id, SEED_IDS.organization, userId, role, SEED_DATE],
  })),
  {
    sql: `INSERT INTO projects (id, organization_id, name, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
          ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id,
            name = EXCLUDED.name, created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at`,
    params: [SEED_IDS.project, SEED_IDS.organization, "Projet de démo", SEED_DATE],
  },
];

/**
 * Charge le jeu de démo (une organisation, un admin, un client, un projet).
 * Idempotent : upserts sur identifiants fixes, en une seule transaction.
 * Aucun secret : pas de ligne `accounts`, donc aucun mot de passe seedé.
 */
export async function seed(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const { sql, params } of STATEMENTS) {
      await client.query(sql, params);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
