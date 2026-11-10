import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

/**
 * TK-93 lot A (B302) : le worker lit `KOKLO_ENCRYPTION_KEY*` pour déchiffrer le jeton utilisateur
 * d'un compte personnel. Absente : aucun porte-clés (la création sur un compte d'organisation reste
 * possible). Invalide : échec au démarrage, qui ne cite que la variable.
 */
const BASE = { DATABASE_URL: "postgresql://u:p@h:5432/d" };
const KEY = Buffer.alloc(32, 9).toString("base64");

describe("TK-93 worker : clé de chiffrement", () => {
  it("sans clé : pas de porte-clés", () => {
    expect(loadConfig(BASE).encryptionKeyring).toBeUndefined();
  });

  it("avec clé : porte-clés de version 1 par défaut", () => {
    const keyring = loadConfig({ ...BASE, KOKLO_ENCRYPTION_KEY: KEY }).encryptionKeyring;
    expect(keyring?.current.version).toBe(1);
    expect(keyring?.previous).toEqual([]);
  });

  it("version et clés précédentes sont lues", () => {
    const previous = `1:${Buffer.alloc(32, 1).toString("base64")}`;
    const keyring = loadConfig({
      ...BASE,
      KOKLO_ENCRYPTION_KEY: KEY,
      KOKLO_ENCRYPTION_KEY_VERSION: "2",
      KOKLO_ENCRYPTION_KEYS_PREVIOUS: previous,
    }).encryptionKeyring;
    expect(keyring?.current.version).toBe(2);
    expect(keyring?.previous.map((k) => k.version)).toEqual([1]);
  });

  it("clé invalide : le message nomme la variable et ne cite jamais la valeur", () => {
    const bad = "pas-une-cle-valide-du-tout";
    let message = "";
    try {
      loadConfig({ ...BASE, KOKLO_ENCRYPTION_KEY: bad });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("KOKLO_ENCRYPTION_KEY");
    expect(message).not.toContain(bad);
  });
});
