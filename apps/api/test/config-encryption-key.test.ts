import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-48a1 AC-48-03 : `KOKLO_ENCRYPTION_KEY` (32 octets, base64) chiffre les jetons utilisateur.
 * Décision du Red (écart à l'analyse D5, qui dit « un seul présent = échec » pour le triplet
 * client ID / client secret / clé) : l'infra génère TOUJOURS la clé (manifest `generate`), alors
 * que les identifiants client sont facultatifs. Une clé seule est donc valide (aucun jeton
 * utilisateur ne peut être obtenu sans client) ; seuls échouent la clé invalide et les
 * identifiants client sans clé.
 */
const KEY = randomBytes(32).toString("base64");
const ENV = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
};
const APP = {
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABCDEF\\n-----END PRIVATE KEY-----",
};
const CLIENT = { GITHUB_APP_CLIENT_ID: "Iv1.x", GITHUB_APP_CLIENT_SECRET: "client-secret-VALUE" };

const messageOf = (env: Record<string, string | undefined>): string => {
  try {
    loadConfig({ ...ENV, ...env });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
};

describe("KOKLO_ENCRYPTION_KEY", () => {
  it("absente ou vide (dev, test) : la configuration se charge sans clé", () => {
    expect(loadConfig(ENV).encryptionKey).toBeUndefined();
    expect(loadConfig({ ...ENV, KOKLO_ENCRYPTION_KEY: "" }).encryptionKey).toBeUndefined();
  });

  it("valide : exposée décodée, en 32 octets", () => {
    const key = loadConfig({ ...ENV, KOKLO_ENCRYPTION_KEY: KEY }).encryptionKey;
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key).toHaveLength(32);
    expect(key?.toString("base64")).toBe(KEY);
  });

  it("clé seule, sans App ni identifiants client : valide (l'infra la génère toujours)", () => {
    const config = loadConfig({ ...ENV, KOKLO_ENCRYPTION_KEY: KEY });
    expect(config.githubApp).toBeUndefined();
  });

  it("clé + App sans identifiants client : valide", () => {
    const config = loadConfig({ ...ENV, ...APP, KOKLO_ENCRYPTION_KEY: KEY });
    expect(config.githubApp?.clientId).toBeUndefined();
    expect(config.encryptionKey).toHaveLength(32);
  });

  it("tout : App, identifiants client et clé", () => {
    const config = loadConfig({ ...ENV, ...APP, ...CLIENT, KOKLO_ENCRYPTION_KEY: KEY });
    expect(config.githubApp).toMatchObject({
      clientId: "Iv1.x",
      clientSecret: "client-secret-VALUE",
    });
    expect(config.encryptionKey).toHaveLength(32);
  });
});

describe("KOKLO_ENCRYPTION_KEY invalide ou manquante", () => {
  it.each([
    ["16 octets", Buffer.alloc(16, 1).toString("base64")],
    ["33 octets", Buffer.alloc(33, 1).toString("base64")],
    ["non base64", "!!!pas-du-base64!!!"],
    ["hexadécimale", "ab".repeat(32)],
  ])(
    "clé invalide (%s) : échec au démarrage qui nomme la variable, sans la valeur",
    (_label, value) => {
      const message = messageOf({ KOKLO_ENCRYPTION_KEY: value });
      expect(message).toContain("KOKLO_ENCRYPTION_KEY");
      expect(message).not.toContain(value);
    },
  );

  it("identifiants client sans clé : échec qui nomme KOKLO_ENCRYPTION_KEY, sans les valeurs", () => {
    const message = messageOf({ ...APP, ...CLIENT });
    expect(message).toContain("KOKLO_ENCRYPTION_KEY");
    expect(message).not.toContain("client-secret-VALUE");
    expect(message).not.toContain("Iv1.x");
  });

  it("identifiants client + clé vide : même échec", () => {
    expect(messageOf({ ...APP, ...CLIENT, KOKLO_ENCRYPTION_KEY: "" })).toContain(
      "KOKLO_ENCRYPTION_KEY",
    );
  });

  it("une autre erreur de configuration ne cite jamais la clé", () => {
    const message = messageOf({ KOKLO_ENCRYPTION_KEY: KEY, DATABASE_URL: "" });
    expect(message).not.toBe("");
    expect(message).not.toContain(KEY);
  });

  it("l'OAuth de connexion (GITHUB_CLIENT_*) n'exige pas la clé", () => {
    expect(() => loadConfig(ENV)).not.toThrow();
  });
});

describe(".env.example", () => {
  it("documente KOKLO_ENCRYPTION_KEY, sans valeur", () => {
    const example = readFileSync(resolve(import.meta.dirname, "..", ".env.example"), "utf8");
    expect(example).toMatch(/^KOKLO_ENCRYPTION_KEY=$/m);
    expect(example).toMatch(/openssl rand -base64 32/);
  });
});
