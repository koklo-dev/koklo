import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  createTokenCipher,
  type EncryptedSecret,
  InvalidEncryptionKeyError,
  parseEncryptionKey,
  TokenDecryptionError,
} from "../src/crypto/token-cipher.ts";

/**
 * TK-48a1 AC-48-02 : AES-256-GCM, nonce aléatoire de 12 octets par message, données associées
 * (AAD) liées à l'utilisateur et à l'installation, format versionné, échec franc sur tout octet
 * altéré, jamais de jeton ni de clé dans une erreur.
 */
const KEY = Buffer.alloc(32, 7);
const TOKEN = "ghu_Secret0123456789abcdefABCDEF-éà";
const AAD = "11111111-1111-7111-8111-111111111111:22222222-2222-7222-8222-222222222222";
const cipher = () => createTokenCipher(KEY);

const failure = (run: () => unknown): Error => {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error("aucune erreur levée");
};
const tampered = (secret: EncryptedSecret, patch: Partial<EncryptedSecret>): EncryptedSecret => ({
  ...secret,
  ...patch,
});
const flip = (buffer: Buffer, index: number): Buffer => {
  const copy = Buffer.from(buffer);
  copy[index] = (copy[index] ?? 0) ^ 0x01;
  return copy;
};

describe("AES-256-GCM : aller-retour et format", () => {
  it("déchiffre ce qu'il a chiffré (ASCII, accents, longueur variable)", () => {
    const c = cipher();
    for (const value of [TOKEN, "a", "é".repeat(500), `ghu_${"x".repeat(2000)}`]) {
      expect(c.decrypt(c.encrypt(value, AAD), AAD)).toBe(value);
    }
  });

  it("format : nonce de 12 octets, ciphertext = longueur du clair + tag de 16, key_version 1", () => {
    const secret = cipher().encrypt(TOKEN, AAD);
    expect(secret.nonce).toHaveLength(12);
    expect(secret.ciphertext).toHaveLength(Buffer.byteLength(TOKEN) + 16);
    expect(secret.keyVersion).toBe(1);
    expect(cipher().keyVersion).toBe(1);
  });

  it("la version de clé est configurable et reportée dans le secret", () => {
    const c = createTokenCipher(KEY, { keyVersion: 3 });
    expect(c.keyVersion).toBe(3);
    expect(c.encrypt(TOKEN, AAD).keyVersion).toBe(3);
  });

  it("le clair n'apparaît ni dans le chiffré ni dans le nonce", () => {
    const secret = cipher().encrypt(TOKEN, AAD);
    expect(secret.ciphertext.includes(Buffer.from(TOKEN))).toBe(false);
    expect(secret.ciphertext.includes(Buffer.from("ghu_"))).toBe(false);
    expect(secret.ciphertext.toString("base64")).not.toContain("ghu_");
  });

  it("est de l'AES-256-GCM standard : un tiers déchiffre avec node:crypto (tag en queue, AAD)", () => {
    const secret = cipher().encrypt(TOKEN, AAD);
    const tag = secret.ciphertext.subarray(-16);
    const body = secret.ciphertext.subarray(0, -16);
    const decipher = createDecipheriv("aes-256-gcm", KEY, secret.nonce);
    decipher.setAAD(Buffer.from(AAD));
    decipher.setAuthTag(tag);
    expect(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")).toBe(TOKEN);
  });

  it("et déchiffre un message produit par un tiers au même format", () => {
    const nonce = randomBytes(12);
    const encrypter = createCipheriv("aes-256-gcm", KEY, nonce);
    encrypter.setAAD(Buffer.from(AAD));
    const body = Buffer.concat([encrypter.update(TOKEN, "utf8"), encrypter.final()]);
    const ciphertext = Buffer.concat([body, encrypter.getAuthTag()]);
    expect(cipher().decrypt({ ciphertext, nonce, keyVersion: 1 }, AAD)).toBe(TOKEN);
  });
});

describe("nonce aléatoire par message", () => {
  it("deux chiffrements du même clair diffèrent (nonce et chiffré)", () => {
    const c = cipher();
    const [a, b] = [c.encrypt(TOKEN, AAD), c.encrypt(TOKEN, AAD)];
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("2000 chiffrements : aucun nonce répété", () => {
    const c = cipher();
    const nonces = new Set<string>();
    for (let i = 0; i < 2000; i += 1) nonces.add(c.encrypt("t", AAD).nonce.toString("hex"));
    expect(nonces.size).toBe(2000);
  });
});

describe("échec franc sur altération (TokenDecryptionError)", () => {
  const secret = () => cipher().encrypt(TOKEN, AAD);

  it("données associées différentes (autre utilisateur ou autre installation)", () => {
    const other = AAD.replace("11111111", "99999999");
    expect(typeof TokenDecryptionError).toBe("function");
    expect(failure(() => cipher().decrypt(secret(), other))).toBeInstanceOf(TokenDecryptionError);
  });

  it.each([
    [
      "un octet du chiffré",
      (s: EncryptedSecret) => tampered(s, { ciphertext: flip(s.ciphertext, 0) }),
    ],
    [
      "le tag",
      (s: EncryptedSecret) =>
        tampered(s, { ciphertext: flip(s.ciphertext, s.ciphertext.length - 1) }),
    ],
    ["le nonce", (s: EncryptedSecret) => tampered(s, { nonce: flip(s.nonce, 3) })],
    [
      "un chiffré tronqué",
      (s: EncryptedSecret) => tampered(s, { ciphertext: s.ciphertext.subarray(0, -1) }),
    ],
    [
      "un chiffré plus court que le tag",
      (s: EncryptedSecret) => tampered(s, { ciphertext: Buffer.alloc(5) }),
    ],
    ["un chiffré vide", (s: EncryptedSecret) => tampered(s, { ciphertext: Buffer.alloc(0) })],
    [
      "un nonce de mauvaise taille",
      (s: EncryptedSecret) => tampered(s, { nonce: Buffer.alloc(8) }),
    ],
    ["une version de clé inconnue", (s: EncryptedSecret) => tampered(s, { keyVersion: 2 })],
  ])("%s altéré : refusé", (_label, alter) => {
    expect(typeof TokenDecryptionError).toBe("function");
    expect(failure(() => cipher().decrypt(alter(secret()), AAD))).toBeInstanceOf(
      TokenDecryptionError,
    );
  });
});

describe("échec franc : autre clé et absence de clair partiel", () => {
  const secret = () => cipher().encrypt(TOKEN, AAD);

  it("autre clé : refusé", () => {
    const stranger = createTokenCipher(Buffer.alloc(32, 9));
    expect(failure(() => stranger.decrypt(secret(), AAD))).toBeInstanceOf(TokenDecryptionError);
  });

  it("aucun clair partiel n'est rendu : l'appel lève, il ne rend jamais une chaîne", () => {
    const altered = tampered(secret(), { ciphertext: flip(secret().ciphertext, 0) });
    let value: unknown = "inchangé";
    let thrown: unknown;
    try {
      value = cipher().decrypt(altered, AAD);
    } catch (error) {
      thrown = error;
    }
    expect(value).toBe("inchangé");
    expect(typeof TokenDecryptionError).toBe("function");
    expect(thrown).toBeInstanceOf(TokenDecryptionError);
  });
});

describe("jamais de jeton, de clé ni d'AAD dans une erreur", () => {
  it("l'erreur de déchiffrement est générique", () => {
    const error = failure(() => cipher().decrypt(cipher().encrypt(TOKEN, AAD), `${AAD}x`));
    expect(error).toBeInstanceOf(TokenDecryptionError);
    const seen = [
      error.message,
      error.stack ?? "",
      JSON.stringify(error),
      inspect(error, { depth: 6 }),
    ];
    for (const text of seen) {
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(AAD);
      expect(text).not.toContain(KEY.toString("base64"));
      expect(text).not.toContain(KEY.toString("hex"));
    }
    expect(error.cause).toBeUndefined();
  });

  it("l'erreur de clé invalide nomme KOKLO_ENCRYPTION_KEY sans la valeur", () => {
    const value = Buffer.alloc(16, 5).toString("base64");
    const error = failure(() => parseEncryptionKey(value));
    expect(error).toBeInstanceOf(InvalidEncryptionKeyError);
    expect(error.message).toContain("KOKLO_ENCRYPTION_KEY");
    expect(error.message).not.toContain(value);
    expect(inspect(error, { depth: 6 })).not.toContain(value);
  });
});

describe("parseEncryptionKey : 32 octets en base64", () => {
  it("accepte 32 octets en base64 (openssl rand -base64 32)", () => {
    const key = randomBytes(32);
    const parsed = parseEncryptionKey(key.toString("base64"));
    expect(parsed).toHaveLength(32);
    expect(parsed.equals(key)).toBe(true);
  });

  it.each([
    ["vide", ""],
    ["16 octets", Buffer.alloc(16, 1).toString("base64")],
    ["33 octets", Buffer.alloc(33, 1).toString("base64")],
    ["non base64", "!!!pas-du-base64!!!"],
    ["hexadécimal de 64 caractères", "ab".repeat(32)],
  ])("refuse %s : InvalidEncryptionKeyError", (_label, value) => {
    expect(typeof InvalidEncryptionKeyError).toBe("function");
    expect(failure(() => parseEncryptionKey(value))).toBeInstanceOf(InvalidEncryptionKeyError);
  });

  it("createTokenCipher refuse une clé qui n'a pas 32 octets", () => {
    expect(typeof InvalidEncryptionKeyError).toBe("function");
    expect(failure(() => createTokenCipher(Buffer.alloc(16)))).toBeInstanceOf(
      InvalidEncryptionKeyError,
    );
  });
});

describe("module pur et porté", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../src/crypto/token-cipher.ts"),
    "utf8",
  );

  it("ne lit pas l'environnement et ne journalise pas", () => {
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/console\.|requestLogger|pino/);
  });

  it("n'utilise que node:crypto (aucune dépendance de chiffrement ajoutée)", () => {
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toContain("node:crypto");
    expect(imports.every((name) => name === "node:crypto")).toBe(true);
    expect(source).toMatch(/aes-256-gcm/);
  });
});
