import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-52a : `KOKLO_ENCRYPTION_KEY` reste la clé courante (mêmes formats) ; s'ajoutent
 * `KOKLO_ENCRYPTION_KEY_VERSION` (entier >= 1, défaut 1) et `KOKLO_ENCRYPTION_KEYS_PREVIOUS`
 * (`version:clé` séparés par des virgules). `Config.encryptionKeyring` = `{ current, previous }`.
 * Le message d'erreur cite le NOM de la variable, jamais la valeur.
 */
const b64 = () => randomBytes(32).toString("base64");
const K1 = b64();
const K2 = b64();
const K3 = b64();
const ENV = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
};

const messageOf = (env: Record<string, string | undefined>): string => {
  try {
    loadConfig({ ...ENV, ...env });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
};

describe("porte-clés : configuration", () => {
  it("sans clé : pas de porte-clés", () => {
    expect(loadConfig(ENV).encryptionKeyring).toBeUndefined();
  });

  it("la clé seule (compatibilité) : version 1, aucune précédente, encryptionKey inchangée", () => {
    const config = loadConfig({ ...ENV, KOKLO_ENCRYPTION_KEY: K1 });
    expect(config.encryptionKeyring?.current.version).toBe(1);
    expect(config.encryptionKeyring?.current.key.toString("base64")).toBe(K1);
    expect(config.encryptionKeyring?.previous).toEqual([]);
    expect(config.encryptionKey?.toString("base64")).toBe(K1);
  });

  it("clé alphanumérique de l'infra : acceptée comme avant", () => {
    const infra = "abcdefghijklmnopqrstuvwxyz012345";
    const config = loadConfig({ ...ENV, KOKLO_ENCRYPTION_KEY: infra });
    expect(config.encryptionKeyring?.current.key.toString("utf8")).toBe(infra);
  });

  it("version courante et précédentes", () => {
    const config = loadConfig({
      ...ENV,
      KOKLO_ENCRYPTION_KEY: K3,
      KOKLO_ENCRYPTION_KEY_VERSION: "3",
      KOKLO_ENCRYPTION_KEYS_PREVIOUS: `1:${K1}, 2:${K2}`,
    });
    const ring = config.encryptionKeyring;
    expect(ring?.current.version).toBe(3);
    expect(ring?.previous.map((entry) => entry.version).sort()).toEqual([1, 2]);
    expect(ring?.previous.find((entry) => entry.version === 1)?.key.toString("base64")).toBe(K1);
    expect(config.encryptionKey?.toString("base64")).toBe(K3);
  });

  it("variables vides : comme absentes", () => {
    const config = loadConfig({
      ...ENV,
      KOKLO_ENCRYPTION_KEY: K1,
      KOKLO_ENCRYPTION_KEY_VERSION: "",
      KOKLO_ENCRYPTION_KEYS_PREVIOUS: "",
    });
    expect(config.encryptionKeyring?.current.version).toBe(1);
    expect(config.encryptionKeyring?.previous).toEqual([]);
  });
});

const cases: Array<[string, Record<string, string>, string]> = [
  ["version zéro", { KOKLO_ENCRYPTION_KEY_VERSION: "0" }, "KOKLO_ENCRYPTION_KEY_VERSION"],
  ["version non entière", { KOKLO_ENCRYPTION_KEY_VERSION: "1.5" }, "KOKLO_ENCRYPTION_KEY_VERSION"],
  ["version texte", { KOKLO_ENCRYPTION_KEY_VERSION: "deux" }, "KOKLO_ENCRYPTION_KEY_VERSION"],
  [
    "précédente sans version",
    { KOKLO_ENCRYPTION_KEYS_PREVIOUS: K1 },
    "KOKLO_ENCRYPTION_KEYS_PREVIOUS",
  ],
  [
    "précédente de clé invalide",
    { KOKLO_ENCRYPTION_KEYS_PREVIOUS: "1:pas-une-cle" },
    "KOKLO_ENCRYPTION_KEYS_PREVIOUS",
  ],
  [
    "précédente de version invalide",
    { KOKLO_ENCRYPTION_KEYS_PREVIOUS: `x:${K1}` },
    "KOKLO_ENCRYPTION_KEYS_PREVIOUS",
  ],
  [
    "versions précédentes dupliquées",
    { KOKLO_ENCRYPTION_KEY_VERSION: "3", KOKLO_ENCRYPTION_KEYS_PREVIOUS: `1:${K1},1:${K2}` },
    "KOKLO_ENCRYPTION_KEYS_PREVIOUS",
  ],
  [
    "précédente = courante",
    { KOKLO_ENCRYPTION_KEY_VERSION: "2", KOKLO_ENCRYPTION_KEYS_PREVIOUS: `2:${K1}` },
    "KOKLO_ENCRYPTION_KEYS_PREVIOUS",
  ],
  [
    "précédente > courante",
    { KOKLO_ENCRYPTION_KEY_VERSION: "2", KOKLO_ENCRYPTION_KEYS_PREVIOUS: `5:${K1}` },
    "KOKLO_ENCRYPTION_KEYS_PREVIOUS",
  ],
  [
    "courante par défaut (1) avec une précédente 1",
    { KOKLO_ENCRYPTION_KEYS_PREVIOUS: `1:${K1}` },
    "KOKLO_ENCRYPTION_KEYS_PREVIOUS",
  ],
];

describe("porte-clés : configuration invalide", () => {
  it.each(cases)("%s : échec nommant la variable, sans aucune clé", (_label, extra, variable) => {
    const message = messageOf({ KOKLO_ENCRYPTION_KEY: K3, ...extra });
    expect(message).toContain(variable);
    for (const secret of [K1, K2, K3]) expect(message).not.toContain(secret);
  });

  it("version ou précédentes sans clé courante : échec nommant KOKLO_ENCRYPTION_KEY", () => {
    expect(messageOf({ KOKLO_ENCRYPTION_KEY_VERSION: "2" })).toContain("KOKLO_ENCRYPTION_KEY");
    const withPrevious = messageOf({ KOKLO_ENCRYPTION_KEYS_PREVIOUS: `1:${K1}` });
    expect(withPrevious).toContain("KOKLO_ENCRYPTION_KEY");
    expect(withPrevious).not.toContain(K1);
  });

  it("clé courante invalide : le message ne cite pas la valeur", () => {
    const bad = "valeur-invalide-DISTINCTIVE";
    const message = messageOf({ KOKLO_ENCRYPTION_KEY: bad });
    expect(message).toContain("KOKLO_ENCRYPTION_KEY");
    expect(message).not.toContain(bad);
  });
});
