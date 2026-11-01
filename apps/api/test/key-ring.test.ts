import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createKeyRing, KeyRingConfigError } from "../src/crypto/key-ring.ts";
import {
  createTokenCipher,
  InvalidEncryptionKeyError,
  TokenDecryptionError,
} from "../src/crypto/token-cipher.ts";

/**
 * TK-52a : porte-clés versionné derrière l'interface `TokenCipher`. `keyVersion` = version
 * courante ; `decrypt` choisit la clé par `secret.keyVersion` ; version inconnue : jamais de repli
 * sur une autre clé. Aucune erreur ne cite une clé ni un clair.
 */
const k1 = randomBytes(32);
const k2 = randomBytes(32);
const k3 = randomBytes(32);
const AAD = "llm:v1:org:anthropic";
const PLAIN = "texte-factice-a-chiffrer-0123456789";

const ring = (current: number, key: Buffer, previous: Array<[number, Buffer]> = []) =>
  createKeyRing({
    current: { version: current, key },
    previous: previous.map(([version, previousKey]) => ({ version, key: previousKey })),
  });

describe("porte-clés : chiffrement", () => {
  it("expose la version courante et chiffre avec elle", () => {
    const cipher = ring(2, k2, [[1, k1]]);
    expect(cipher.keyVersion).toBe(2);
    expect(cipher.encrypt(PLAIN, AAD).keyVersion).toBe(2);
  });

  it("aller-retour avec la clé courante ; nonce de 12 octets, tag de 16, neuf à chaque appel", () => {
    const cipher = ring(1, k1);
    const a = cipher.encrypt(PLAIN, AAD);
    const b = cipher.encrypt(PLAIN, AAD);
    expect(a.nonce).toHaveLength(12);
    expect(a.ciphertext).toHaveLength(Buffer.byteLength(PLAIN) + 16);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(cipher.decrypt(a, AAD)).toBe(PLAIN);
  });

  it("un porte-clés à une clé lit ce que createTokenCipher écrit, et inversement", () => {
    const single = createTokenCipher(k1, { keyVersion: 1 });
    expect(ring(1, k1).decrypt(single.encrypt(PLAIN, AAD), AAD)).toBe(PLAIN);
    expect(single.decrypt(ring(1, k1).encrypt(PLAIN, AAD), AAD)).toBe(PLAIN);
  });

  it("lit une ancienne version par sa clé (rotation)", () => {
    const old = createTokenCipher(k1, { keyVersion: 1 }).encrypt(PLAIN, AAD);
    const middle = createTokenCipher(k2, { keyVersion: 2 }).encrypt(PLAIN, AAD);
    const cipher = ring(3, k3, [
      [1, k1],
      [2, k2],
    ]);
    expect(cipher.decrypt(old, AAD)).toBe(PLAIN);
    expect(cipher.decrypt(middle, AAD)).toBe(PLAIN);
    expect(cipher.decrypt(cipher.encrypt(PLAIN, AAD), AAD)).toBe(PLAIN);
  });

  it("retirer l'ancienne clé : ce qui reste chiffré avec elle devient illisible", () => {
    const old = createTokenCipher(k1, { keyVersion: 1 }).encrypt(PLAIN, AAD);
    expect(() => ring(2, k2).decrypt(old, AAD)).toThrow(TokenDecryptionError);
  });
});

describe("porte-clés : refus", () => {
  it("version inconnue : TokenDecryptionError, sans repli sur la courante", () => {
    const stranger = createTokenCipher(k3, { keyVersion: 9 }).encrypt(PLAIN, AAD);
    expect(() => ring(3, k3, [[2, k2]]).decrypt(stranger, AAD)).toThrow(TokenDecryptionError);
  });

  it("version connue mais autre clé : TokenDecryptionError", () => {
    const forged = createTokenCipher(k3, { keyVersion: 1 }).encrypt(PLAIN, AAD);
    expect(() => ring(2, k2, [[1, k1]]).decrypt(forged, AAD)).toThrow(TokenDecryptionError);
  });

  it("autre AAD ou chiffré altéré : TokenDecryptionError, message sans clair", () => {
    const cipher = ring(1, k1);
    const secret = cipher.encrypt(PLAIN, AAD);
    const tampered = { ...secret, ciphertext: Buffer.from(secret.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff;
    for (const attempt of [
      () => cipher.decrypt(secret, "llm:v1:org:openai"),
      () => cipher.decrypt(tampered, AAD),
    ]) {
      try {
        attempt();
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(TokenDecryptionError);
        expect(String((error as Error).message)).not.toContain(PLAIN);
      }
    }
  });

  it.each([
    [
      "versions précédentes dupliquées",
      3,
      [
        [1, k1],
        [1, k2],
      ],
    ],
    ["courante déjà utilisée par une précédente", 2, [[2, k1]]],
    ["courante inférieure à une précédente", 2, [[3, k1]]],
    ["courante égale à une précédente", 1, [[1, k1]]],
    ["version zéro", 0, []],
    ["version négative", -1, []],
    ["version non entière", 1.5, []],
  ] as Array<[string, number, Array<[number, Buffer]>]>)(
    "%s : KeyRingConfigError",
    (_l, current, previous) => {
      expect(() => ring(current, k3, previous)).toThrow(KeyRingConfigError);
    },
  );
});

describe("porte-clés : refus de construction", () => {
  it("clé de 31 octets (courante ou précédente) : InvalidEncryptionKeyError", () => {
    const short = randomBytes(31);
    expect(() => ring(2, short, [[1, k1]])).toThrow(InvalidEncryptionKeyError);
    expect(() => ring(2, k2, [[1, short]])).toThrow(InvalidEncryptionKeyError);
  });

  it("aucune erreur de construction ne contient une clé", () => {
    const attempts = [
      () => ring(1, k1, [[1, k2]]),
      () => ring(2, randomBytes(31), []),
      () =>
        ring(1, k1, [
          [3, k2],
          [3, k3],
        ]),
    ];
    for (const attempt of attempts) {
      try {
        attempt();
        expect.unreachable();
      } catch (error) {
        const text = `${(error as Error).message} ${(error as Error).stack}`;
        for (const key of [k1, k2, k3]) {
          expect(text).not.toContain(key.toString("base64"));
          expect(text).not.toContain(key.toString("hex"));
        }
      }
    }
  });
});
