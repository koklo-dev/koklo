import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ROTATE_EXIT, runRotateEncryptionKey } from "../src/cli/rotate-encryption-key.ts";
import {
  createRotationHarness,
  K1,
  K2,
  type RotationHarness,
  type Seeded,
  snapshot,
} from "./helpers/rotation-world.ts";

/**
 * TK-52c : la commande `rotate-encryption-key` (CLI). Codes de sortie : 0 tout est à jour, 1 au
 * moins une ligne en échec, 2 refus (usage, configuration). Sortie : comptes uniquement.
 */
let h: RotationHarness;
let seeded: Seeded;
beforeAll(async () => {
  h = await createRotationHarness();
}, 180_000);
afterAll(() => h?.dispose(), 60_000);
beforeEach(async () => {
  seeded = await h.seed();
});

const b64 = (key: Buffer) => key.toString("base64");
const envFor = (over: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: h.database.url,
  KOKLO_ENCRYPTION_KEY: b64(K2),
  KOKLO_ENCRYPTION_KEY_VERSION: "2",
  KOKLO_ENCRYPTION_KEYS_PREVIOUS: `1:${b64(K1)}`,
  ...over,
});
async function cli(argv: string[], env = envFor()) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runRotateEncryptionKey(argv, {
    env,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  });
  return { code, out: out.join(""), err: err.join("") };
}
const noValues = (text: string) => {
  const forbidden = [
    b64(K1),
    b64(K2),
    K1.toString("hex"),
    K2.toString("hex"),
    h.database.url,
    ...seeded.llm.flatMap((row) => [row.plaintext, row.organizationId]),
    ...seeded.tokens.flatMap((row) => [row.token, row.userId, row.installationId]),
    "llm:v1:",
  ];
  for (const value of forbidden) expect(text).not.toContain(value);
};

describe("rotate-encryption-key (CLI)", () => {
  it("rotation réussie : code 0, comptes seulement, base en v2", async () => {
    const { code, out, err } = await cli([]);
    expect(code).toBe(ROTATE_EXIT.ok);
    expect(out).toMatch(/\b3\b/);
    expect(out).toMatch(/\b2\b/);
    noValues(out + err);
    const rows = await h.database.query<{ key_version: number }>(
      "SELECT key_version FROM llm_provider_credentials UNION ALL SELECT key_version FROM provider_user_credentials",
    );
    expect(rows.map((row) => row.key_version)).toEqual([2, 2, 2, 2, 2]);
  });

  it("--json : un seul objet de comptes (dryRun, llm, userTokens), sans valeur", async () => {
    const { code, out } = await cli(["--json"]);
    expect(code).toBe(0);
    const report = JSON.parse(out) as Record<string, Record<string, number> | boolean>;
    expect(report.dryRun).toBe(false);
    expect(report.llm).toMatchObject({ scanned: 3, rotated: 3, failed: 0 });
    expect(report.userTokens).toMatchObject({ scanned: 2, rotated: 2, failed: 0 });
    noValues(out);
  });

  it("--dry-run : annonce l'essai, code 0, aucune écriture", async () => {
    const before = await snapshot(h.database);
    const { code, out } = await cli(["--dry-run"]);
    expect(code).toBe(0);
    expect(out.toLowerCase()).toMatch(/essai|dry-run/);
    expect(await snapshot(h.database)).toEqual(before);
  });

  it("relancée : code 0 et 0 ligne modifiée", async () => {
    await cli([]);
    const first = await snapshot(h.database);
    const { code, out } = await cli(["--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ llm: { rotated: 0 }, userTokens: { rotated: 0 } });
    expect(await snapshot(h.database)).toEqual(first);
  });

  it("une ligne illisible : code 1, les autres traitées, rien de cité", async () => {
    await h.database.query(
      "UPDATE llm_provider_credentials SET ciphertext = decode(repeat('ab', 40), 'hex') WHERE id = (SELECT id FROM llm_provider_credentials ORDER BY id LIMIT 1)",
    );
    const { code, out, err } = await cli(["--json"]);
    expect(code).toBe(ROTATE_EXIT.failed);
    expect(JSON.parse(out)).toMatchObject({
      llm: { failed: 1, rotated: 2 },
      userTokens: { rotated: 2 },
    });
    noValues(out + err);
  });
});

describe("clé changée sans incrémenter la version", () => {
  it("code 1 (jamais « tout à jour »), comptes en échec, rien d'écrit, aucune valeur citée", async () => {
    const before = await snapshot(h.database);
    const env = envFor({
      KOKLO_ENCRYPTION_KEY_VERSION: "1",
      KOKLO_ENCRYPTION_KEYS_PREVIOUS: undefined,
    });
    for (const argv of [[], ["--dry-run"]]) {
      const { code, out, err } = await cli([...argv, "--json"], env);
      expect(code).toBe(ROTATE_EXIT.failed);
      expect(JSON.parse(out)).toMatchObject({
        llm: { failed: 3, alreadyCurrent: 0, rotated: 0 },
        userTokens: { failed: 2, alreadyCurrent: 0, rotated: 0 },
      });
      noValues(out + err);
    }
    expect(await snapshot(h.database)).toEqual(before);
  });
});

describe("refus (code 2, rien d'écrit, aucune valeur citée)", () => {
  const refused = async (argv: string[], env: Record<string, string | undefined>) => {
    const before = await snapshot(h.database);
    const { code, out, err } = await cli(argv, env as ReturnType<typeof envFor>);
    expect(code).toBe(ROTATE_EXIT.refused);
    expect(err.length).toBeGreaterThan(0);
    noValues(out + err);
    expect(await snapshot(h.database)).toEqual(before);
  };

  it("option inconnue ou argument superflu", async () => {
    await refused(["--force"], envFor());
    await refused(["extra"], envFor());
  });
  it("DATABASE_URL absente", () => refused([], envFor({ DATABASE_URL: undefined })));
  it("KOKLO_ENCRYPTION_KEY absente", () =>
    refused([], envFor({ KOKLO_ENCRYPTION_KEY: undefined })));
  it("clé courante invalide", () => refused([], envFor({ KOKLO_ENCRYPTION_KEY: "pas-une-cle" })));
  it("version courante non supérieure aux précédentes", () =>
    refused([], envFor({ KOKLO_ENCRYPTION_KEY_VERSION: "1" })));
  it("lignes anciennes mais aucune clé précédente configurée", () =>
    refused([], envFor({ KOKLO_ENCRYPTION_KEYS_PREVIOUS: undefined })));
});
