import { randomInt, randomUUID } from "node:crypto";
import type pg from "pg";

/**
 * Support e2e (pas du code de production) : graine d'une installation GitHub active (S1 de l'analyse).
 * Le faux fournisseur accepte n'importe quelle installation ; `external_id` est un entier unique
 * (contrainte `UNIQUE(provider, external_id)`), car il devient `installation.id` des webhooks.
 */
export interface SeededInstallation {
  id: string;
  externalId: number;
  ownerLogin: string;
}

export async function seedProviderInstallation(
  client: pg.Client,
  { organizationId, ownerLogin }: { organizationId: string; ownerLogin: string },
): Promise<SeededInstallation> {
  const id = randomUUID();
  const externalId = randomInt(1_000_000, 2_000_000_000);
  await client.query(
    `INSERT INTO provider_installations
       (id, organization_id, provider, external_id, owner_kind, owner_login, status, created_at, updated_at)
     VALUES ($1, $2, 'github', $3, 'organization', $4, 'active', now(), now())`,
    [id, organizationId, String(externalId), ownerLogin],
  );
  return { id, externalId, ownerLogin };
}
