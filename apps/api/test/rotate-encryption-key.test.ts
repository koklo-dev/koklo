import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KeyRingConfigError } from "../src/crypto/key-ring.ts";
import {
  RotationConfigError,
  type RotationReport,
  rotateEncryptionKey,
} from "../src/crypto/rotate-encryption-key.ts";
import { TokenDecryptionError } from "../src/crypto/token-cipher.ts";
import { LlmCredentialStoreError } from "../src/llm-credential/llm-credential-errors.ts";
import {
  createRotationHarness,
  decryptAll,
  K1,
  K2,
  type RotationHarness,
  ring,
  SETTINGS,
  type Seeded,
  snapshot,
} from "./helpers/rotation-world.ts";

/**
 * TK-52c, sur base réelle : CRITÈRE 2 du sprint, « rotation de la clé maître testée ». La commande
 * rechiffre `llm_provider_credentials` ET `provider_user_credentials` (v1 -> v2), idempotente,
 * atomique par ligne, sans jamais citer une valeur. Décisions : .workflow/TK-52/03-red-52c.md.
 */
let h: RotationHarness;
let seeded: Seeded;
const lines: string[] = [];
const run = (over: Parameters<typeof rotateEncryptionKey>[2] = {}) =>
  rotateEncryptionKey(h.service, SETTINGS, { log: (line) => lines.push(line), ...over });
const total = (r: RotationReport, key: "rotated" | "failed" | "alreadyCurrent" | "conflicts") =>
  r.llm[key] + r.userTokens[key];
const versions = async (table: string) =>
  (
    await h.database.query<{ key_version: number }>(`SELECT key_version FROM ${table} ORDER BY id`)
  ).map((row) => row.key_version);
const v2 = ring([2, K2]);

beforeAll(async () => {
  h = await createRotationHarness();
}, 180_000);
afterAll(() => h?.dispose(), 60_000);
beforeEach(async () => {
  lines.length = 0;
  seeded = await h.seed();
});

describe("CRITÈRE 2 : la rotation de la clé maître", () => {
  it("rechiffre les lignes v1 des DEUX tables en v2 ; tout se lit avant et après", async () => {
    const before = await decryptAll(h, ring([2, K2], [[1, K1]]), seeded);
    const old = await snapshot(h.database);
    const report = await run();

    expect(report.llm).toMatchObject({ scanned: 3, rotated: 3, failed: 0, alreadyCurrent: 0 });
    expect(report.userTokens).toMatchObject({ scanned: 2, rotated: 2, failed: 0 });
    expect(await versions("llm_provider_credentials")).toEqual([2, 2, 2]);
    expect(await versions("provider_user_credentials")).toEqual([2, 2]);
    const after = await snapshot(h.database);
    for (const [index, row] of after.llm.entries()) {
      expect(Buffer.compare(row.nonce as Buffer, old.llm[index]?.nonce as Buffer)).not.toBe(0);
      expect(
        Buffer.compare(row.ciphertext as Buffer, old.llm[index]?.ciphertext as Buffer),
      ).not.toBe(0);
    }
    expect(await decryptAll(h, ring([2, K2], [[1, K1]]), seeded)).toEqual(before);
    expect(before.llm.sort()).toEqual(seeded.llm.map((row) => row.plaintext).sort());
  });

  it("clé v1 retirée après la rotation : tout se déchiffre encore avec la seule v2 (AAD correctes)", async () => {
    await run();
    const only = await decryptAll(h, v2, seeded);
    expect(only.llm).toEqual(seeded.llm.map((row) => row.plaintext));
    expect(only.tokens).toEqual(seeded.tokens.map((row) => row.token));
  });

  it("sans rotation, retirer la clé v1 rend les lignes illisibles (la rotation est bien nécessaire)", async () => {
    await expect(decryptAll(h, v2, seeded)).rejects.toBeInstanceOf(TokenDecryptionError);
  });

  it("couvre toutes les organisations", async () => {
    await run();
    const orgs = await h.database.query<{ organization_id: string }>(
      "SELECT DISTINCT organization_id FROM llm_provider_credentials",
    );
    expect(orgs).toHaveLength(2);
    expect(await versions("llm_provider_credentials")).not.toContain(1);
  });
});

describe("idempotence", () => {
  it("relancée : 0 ligne modifiée, octets et updated_at identiques", async () => {
    await run();
    const first = await snapshot(h.database);
    const again = await run();
    expect(total(again, "rotated")).toBe(0);
    expect(total(again, "failed")).toBe(0);
    expect(again.llm.alreadyCurrent).toBe(3);
    expect(again.userTokens.alreadyCurrent).toBe(2);
    expect(await snapshot(h.database)).toEqual(first);
  });

  it("ne touche que les lignes encore anciennes (mélange v1/v2)", async () => {
    const target = seeded.llm[0];
    const fresh = v2.encrypt(
      target?.plaintext ?? "",
      `llm:v1:${target?.organizationId}:${target?.provider}`,
    );
    await h.database.query(
      "UPDATE llm_provider_credentials SET ciphertext = $1, nonce = $2, key_version = 2 WHERE organization_id = $3 AND provider = $4::llm_provider",
      [fresh.ciphertext, fresh.nonce, target?.organizationId, target?.provider],
    );
    const report = await run();
    expect(report.llm).toMatchObject({ rotated: 2, alreadyCurrent: 1 });
    expect(report.userTokens.rotated).toBe(2);
  });
});

describe("métadonnées conservées", () => {
  it("updated_at avance ; last_used_at, invalidated_at, defaultModel, created_at restent", async () => {
    await h.database.query(
      "UPDATE llm_provider_credentials SET last_used_at = '2026-02-02T00:00:00Z', invalidated_at = '2026-03-03T00:00:00Z', default_model = 'modele-x' WHERE provider = 'anthropic'",
    );
    const before = await snapshot(h.database);
    await run();
    const after = await snapshot(h.database);
    for (const [index, row] of after.llm.entries()) {
      const old = before.llm[index] as Record<string, unknown>;
      for (const column of [
        "last_used_at",
        "invalidated_at",
        "default_model",
        "created_at",
        "id",
      ]) {
        expect(row[column]).toEqual(old[column]);
      }
      expect((row.updated_at as Date).getTime()).toBeGreaterThan(
        (old.updated_at as Date).getTime(),
      );
    }
    for (const [index, row] of after.tokens.entries()) {
      const old = before.tokens[index] as Record<string, unknown>;
      expect(row.expires_at).toEqual(old.expires_at);
      expect(row.refresh_expires_at).toEqual(old.refresh_expires_at);
      expect((row.updated_at as Date).getTime()).toBeGreaterThan(
        (old.updated_at as Date).getTime(),
      );
    }
  });

  it("n'écrit aucune ligne d'audit et ne touche pas aux états OAuth en cours", async () => {
    const authBefore = await h.database.query("SELECT * FROM provider_auth_states ORDER BY id");
    const auditBefore = await h.database.query("SELECT count(*)::int AS n FROM audit_log");
    await run();
    expect(await h.database.query("SELECT * FROM provider_auth_states ORDER BY id")).toEqual(
      authBefore,
    );
    expect(await h.database.query("SELECT count(*)::int AS n FROM audit_log")).toEqual(auditBefore);
  });
});

describe("--dry-run", () => {
  it("compte ce qui serait réécrit et n'écrit rien", async () => {
    const before = await snapshot(h.database);
    const report = await run({ dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.llm.rotated).toBe(3);
    expect(report.userTokens.rotated).toBe(2);
    expect(await snapshot(h.database)).toEqual(before);
  });
});

describe("atomicité par ligne", () => {
  it.each([
    ["llm_provider_credentials", "llm" as const],
    ["provider_user_credentials", "userTokens" as const],
  ])(
    "une ligne illisible de %s est comptée, intacte, et n'arrête pas les autres",
    async (table, key) => {
      await h.database.query(
        `UPDATE ${table} SET ciphertext = $1 WHERE id = (SELECT id FROM ${table} ORDER BY id LIMIT 1)`,
        [randomBytes(60)],
      );
      const [bad] = await h.database.query<Record<string, unknown>>(
        `SELECT * FROM ${table} ORDER BY id LIMIT 1`,
      );
      const report = await run();
      expect(report[key].failed).toBe(1);
      expect(total(report, "rotated")).toBe(4);
      const [after] = await h.database.query<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE id = $1`,
        [bad?.id],
      );
      expect(after).toEqual(bad);
    },
  );

  it("une panne d'écriture sur une ligne laisse chaque ligne entière : ancienne ou nouvelle, jamais mixte", async () => {
    let calls = 0;
    const report = await run({
      beforeWrite: async () => {
        calls += 1;
        if (calls === 2) throw new Error("panne simulée");
      },
    });
    expect(total(report, "failed")).toBe(1);
    expect(total(report, "rotated")).toBe(4);
    const partial = ring([2, K2], [[1, K1]]);
    const clear = await decryptAll(h, partial, seeded);
    expect(clear.llm.sort()).toEqual(seeded.llm.map((row) => row.plaintext).sort());
    expect(clear.tokens).toEqual(seeded.tokens.map((row) => row.token));
  });
});

describe("erreurs de base assainies", () => {
  it("une erreur de base (message contenant une valeur) ne fuit pas : ligne comptée en échec", async () => {
    const marker = `LEAK-${randomBytes(8).toString("hex")}`;
    await h.database.query(
      `CREATE FUNCTION rotation_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${marker}'; END $$`,
    );
    await h.database.query(
      "CREATE TRIGGER rotation_boom BEFORE UPDATE ON llm_provider_credentials FOR EACH ROW EXECUTE FUNCTION rotation_boom()",
    );
    try {
      const errors: Error[] = [];
      const report = await run({ onFailure: (_table, error) => errors.push(error) });
      expect(report.llm.failed).toBe(3);
      expect(errors).toHaveLength(3);
      for (const error of errors) {
        expect(error).toBeInstanceOf(LlmCredentialStoreError);
        expect(error.message).not.toContain(marker);
        expect(error.cause).toBeUndefined();
      }
      expect(report.userTokens.rotated).toBe(2);
      expect(JSON.stringify(report)).not.toContain(marker);
      expect(lines.join("\n")).not.toContain(marker);
    } finally {
      await h.database.query("DROP TRIGGER rotation_boom ON llm_provider_credentials");
      await h.database.query("DROP FUNCTION rotation_boom()");
    }
  });
});

describe("concurrence", () => {
  it("une écriture normale pendant la rotation n'est pas perdue (compare-and-swap)", async () => {
    const target = seeded.llm[0];
    const fresh = ring([2, K2]).encrypt(
      "valeur-recente-factice",
      `llm:v1:${target?.organizationId}:${target?.provider}`,
    );
    let injected = false;
    const report = await run({
      beforeWrite: async (table) => {
        if (table !== "llm" || injected) return;
        injected = true;
        await h.database.query(
          "UPDATE llm_provider_credentials SET ciphertext = $1, nonce = $2, key_version = 2 WHERE organization_id = $3 AND provider = $4::llm_provider",
          [fresh.ciphertext, fresh.nonce, target?.organizationId, target?.provider],
        );
      },
    });
    expect(injected).toBe(true);
    expect(total(report, "conflicts")).toBe(1);
    expect(total(report, "failed")).toBe(0);
    const [row] = await h.database.query<Record<string, unknown>>(
      "SELECT ciphertext, nonce FROM llm_provider_credentials WHERE organization_id = $1 AND provider = $2::llm_provider",
      [target?.organizationId, target?.provider],
    );
    expect(Buffer.compare(row?.ciphertext as Buffer, fresh.ciphertext)).toBe(0);
    expect(Buffer.compare(row?.nonce as Buffer, fresh.nonce)).toBe(0);
  });
});

describe("refus de démarrer", () => {
  it("version courante non supérieure aux précédentes : KeyRingConfigError, rien d'écrit", async () => {
    const before = await snapshot(h.database);
    const bad = { current: { version: 1, key: K2 }, previous: [{ version: 2, key: K1 }] };
    await expect(rotateEncryptionKey(h.service, bad)).rejects.toBeInstanceOf(KeyRingConfigError);
    expect(await snapshot(h.database)).toEqual(before);
  });

  it("lignes anciennes sans aucune clé précédente configurée : RotationConfigError, rien d'écrit", async () => {
    const before = await snapshot(h.database);
    const alone = { current: { version: 2, key: K2 }, previous: [] };
    await expect(rotateEncryptionKey(h.service, alone)).rejects.toBeInstanceOf(RotationConfigError);
    expect(await snapshot(h.database)).toEqual(before);
  });

  it("base déjà entièrement en version courante et sans clé précédente : rien à faire, pas de refus", async () => {
    await run();
    const alone = { current: { version: 2, key: K2 }, previous: [] };
    const report = await rotateEncryptionKey(h.service, alone);
    expect(total(report, "rotated")).toBe(0);
  });
});

describe("lignes déjà en version courante : déchiffrement de contrôle", () => {
  // L'opérateur garde KOKLO_ENCRYPTION_KEY_VERSION=1 avec une NOUVELLE clé : tout est illisible.
  const wrongKeySameVersion = { current: { version: 1, key: K2 }, previous: [] };

  it.each([
    ["réel", false],
    ["--dry-run", true],
  ])(
    "clé changée sans changer la version (%s) : toutes les lignes comptées en échec, rien d'écrit",
    async (_label, dryRun) => {
      const before = await snapshot(h.database);
      const errors: Error[] = [];
      const report = await rotateEncryptionKey(h.service, wrongKeySameVersion, {
        dryRun,
        log: (line) => lines.push(line),
        onFailure: (_table, error) => errors.push(error),
      });
      expect(report.llm).toMatchObject({ scanned: 3, rotated: 0, alreadyCurrent: 0, failed: 3 });
      expect(report.userTokens).toMatchObject({
        scanned: 2,
        rotated: 0,
        alreadyCurrent: 0,
        failed: 2,
      });
      expect(errors).toHaveLength(5);
      for (const error of errors) expect(error).toBeInstanceOf(TokenDecryptionError);
      expect(await snapshot(h.database)).toEqual(before);
      const haystack = `${JSON.stringify(report)}\n${lines.join("\n")}`;
      for (const row of seeded.llm) expect(haystack).not.toContain(row.plaintext);
    },
  );

  it("une seule ligne courante illisible : comptée en échec, les autres restent à jour", async () => {
    await run();
    await h.database.query(
      "UPDATE llm_provider_credentials SET ciphertext = $1 WHERE id = (SELECT id FROM llm_provider_credentials ORDER BY id LIMIT 1)",
      [randomBytes(60)],
    );
    const before = await snapshot(h.database);
    const report = await run();
    expect(report.llm).toMatchObject({ rotated: 0, failed: 1, alreadyCurrent: 2 });
    expect(report.userTokens).toMatchObject({ failed: 0, alreadyCurrent: 2 });
    expect(await snapshot(h.database)).toEqual(before);
  });
});

describe("sortie sans valeur", () => {
  it("le rapport et les journaux ne portent ni clé, ni chiffré, ni nonce, ni AAD, ni identifiant", async () => {
    const before = await snapshot(h.database);
    const report = await run();
    const haystack = `${JSON.stringify(report)}\n${lines.join("\n")}`;
    const forbidden = [
      ...seeded.llm.map((row) => row.plaintext),
      ...seeded.tokens.flatMap((row) => [row.token, row.userId, row.installationId]),
      ...seeded.llm.map((row) => row.organizationId),
      ...[K1, K2].flatMap((key) => [key.toString("base64"), key.toString("hex")]),
      ...before.llm.flatMap((row) => [
        (row.ciphertext as Buffer).toString("hex"),
        (row.ciphertext as Buffer).toString("base64"),
        (row.nonce as Buffer).toString("hex"),
        (row.nonce as Buffer).toString("base64"),
        String(row.id),
      ]),
      "llm:v1:",
    ];
    for (const value of forbidden) expect(haystack).not.toContain(value);
    expect(lines.length).toBeGreaterThan(0);
  });
});
