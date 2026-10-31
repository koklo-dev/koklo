import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TK-45a : `verifyWebhookSignature` (packages/github/src/webhook-signature.ts, exportée par index.ts).
 *   verifyWebhookSignature(input: {
 *     secret: string | null | undefined; rawBody: Uint8Array; header: string | null | undefined;
 *   }): boolean
 * `true` seulement si `header` == `sha256=` + HMAC-SHA256 hex (casse indifférente) des octets BRUTS ;
 * sinon `false` (sans exception, sans distinguer les causes). Secret absent ou vide :
 * `WebhookSecretMissingError` levée AVANT tout calcul. Comparaison par `timingSafeEqual` sur deux
 * tampons de même longueur, jamais appelée avec des longueurs différentes.
 */
const crypto = vi.hoisted(() => ({
  createHmac: vi.fn(),
  timingSafeEqual: vi.fn(),
}));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  crypto.createHmac.mockImplementation(actual.createHmac);
  crypto.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, createHmac: crypto.createHmac, timingSafeEqual: crypto.timingSafeEqual };
});

import { verifyWebhookSignature, WebhookSecretMissingError } from "../src/index.ts";

// L'aide `sign` doit utiliser le vrai HMAC : l'importer depuis "node:crypto" donnerait l'espion
// ci-dessus et fausserait le décompte des appels de l'implémentation.
const { createHmac: realCreateHmac } =
  await vi.importActual<typeof import("node:crypto")>("node:crypto");

const SECRET = "whsec-fixture-secret-0123456789";
const utf8 = (text: string) => new TextEncoder().encode(text);
const sign = (secret: string, body: Uint8Array, algo = "sha256") =>
  `${algo}=${realCreateHmac(algo, secret).update(body).digest("hex")}`;
const verify = (header: string | null | undefined, body: Uint8Array, secret = SECRET) =>
  verifyWebhookSignature({ secret, rawBody: body, header });

const BODY = utf8('{"zen":"Keep it logically awesome.","n":1}');

beforeEach(() => {
  crypto.createHmac.mockClear();
  crypto.timingSafeEqual.mockClear();
});

describe("TK-45a signature valide", () => {
  it("accepte sha256=<hex minuscule> du corps brut", () => {
    expect(verify(sign(SECRET, BODY), BODY)).toBe(true);
  });

  it("accepte l'hexadécimal en majuscules", () => {
    const header = `sha256=${sign(SECRET, BODY).slice(7).toUpperCase()}`;
    expect(verify(header, BODY)).toBe(true);
  });

  it("accepte un Buffer et un Uint8Array pour le corps", () => {
    expect(verify(sign(SECRET, BODY), Buffer.from(BODY))).toBe(true);
    expect(verify(sign(SECRET, BODY), new Uint8Array(BODY))).toBe(true);
  });

  it("accepte un corps vide si la signature correspond", () => {
    const empty = new Uint8Array(0);
    expect(verify(sign(SECRET, empty), empty)).toBe(true);
  });

  it("signe les octets exacts : JSON non canonique (espaces, retours, clés non triées, non ASCII)", () => {
    const raw = utf8('{\n  "z": 1,\r\n  "a": "é — 日本語 \\u00e9",   "m": [1,\t2]\n}\n');
    expect(verify(sign(SECRET, raw), raw)).toBe(true);
    const reserialized = utf8(JSON.stringify(JSON.parse(new TextDecoder().decode(raw))));
    expect(verify(sign(SECRET, raw), reserialized)).toBe(false);
  });

  it("accepte un corps de 4 Mio", () => {
    const big = new Uint8Array(4 * 1024 * 1024).fill(97);
    expect(verify(sign(SECRET, big), big)).toBe(true);
  });
});

describe("TK-45a signature refusée (false, jamais d'exception)", () => {
  const goodHex = () => sign(SECRET, BODY).slice(7);
  const rejected: ReadonlyArray<readonly [string, string | null | undefined]> = [
    ["en-tête absent (undefined)", undefined],
    ["en-tête absent (null)", null],
    ["en-tête vide", ""],
    ["sans préfixe", goodHex()],
    ["préfixe sha256 sans =", `sha256${goodHex()}`],
    ["préfixe en majuscules", `SHA256=${goodHex()}`],
    ["préfixe sha256= seul", "sha256="],
    ["SHA-1 valide (X-Hub-Signature)", sign(SECRET, BODY, "sha1")],
    ["sha1= avec un HMAC SHA-256", `sha1=${goodHex()}`],
    ["hex trop court", `sha256=${goodHex().slice(0, 62)}`],
    ["hex trop long", `sha256=${goodHex()}00`],
    ["hex de 63 caractères", `sha256=${goodHex().slice(1)}`],
    ["caractères non hexadécimaux", `sha256=${"g".repeat(64)}`],
    ["un seul caractère non hexadécimal", `sha256=${goodHex().slice(0, 63)}z`],
    ["espace en tête", ` sha256=${goodHex()}`],
    ["espace en fin", `sha256=${goodHex()} `],
    ["saut de ligne en fin", `sha256=${goodHex()}\n`],
    ["deux signatures concaténées", `sha256=${goodHex()}, sha256=${goodHex()}`],
    ["octet NUL", `sha256=${goodHex().slice(0, 63)}\0`],
    ["signature d'un autre secret", sign("another-secret", BODY)],
    ["signature de zéros", `sha256=${"0".repeat(64)}`],
    ["hex multi-octets de même longueur", `sha256=${"é".repeat(64)}`],
  ];

  it.each(rejected)("%s", (_label, header) => {
    expect(verify(header, BODY)).toBe(false);
  });

  it("corps modifié d'un seul octet après signature", () => {
    const header = sign(SECRET, BODY);
    for (const index of [0, 10, BODY.length - 1]) {
      const tampered = new Uint8Array(BODY);
      tampered[index] = (tampered[index] as number) ^ 0x01;
      expect(verify(header, tampered), `octet ${index}`).toBe(false);
    }
    expect(verify(header, new Uint8Array([...BODY, 0x0a]))).toBe(false);
    expect(verify(header, BODY.subarray(0, BODY.length - 1))).toBe(false);
  });

  it("secret différent d'un seul caractère", () => {
    expect(verify(sign(SECRET, BODY), BODY, `${SECRET}x`)).toBe(false);
    expect(verify(sign(SECRET, BODY), BODY, SECRET.slice(0, -1))).toBe(false);
  });

  it("le corps d'une autre livraison avec la signature d'origine", () => {
    expect(verify(sign(SECRET, BODY), utf8('{"zen":"other"}'))).toBe(false);
  });
});

describe("TK-45a secret absent ou vide : erreur typée, aucun calcul", () => {
  it.each([
    ["chaîne vide", ""],
    ["undefined", undefined],
    ["null", null],
  ] as const)("%s", (_label, secret) => {
    // Une « signature valide » calculée avec une clé vide ne doit JAMAIS être acceptée.
    const forged = sign("", BODY);
    crypto.createHmac.mockClear();
    expect(typeof WebhookSecretMissingError).toBe("function");
    expect(() => verifyWebhookSignature({ secret, rawBody: BODY, header: forged })).toThrow(
      WebhookSecretMissingError,
    );
    expect(crypto.createHmac).not.toHaveBeenCalled();
    expect(crypto.timingSafeEqual).not.toHaveBeenCalled();
  });

  it("l'erreur est typée, nomme la variable et ne contient ni signature ni corps", () => {
    const forged = sign("", BODY);
    let thrown: unknown;
    try {
      verifyWebhookSignature({ secret: "", rawBody: BODY, header: forged });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WebhookSecretMissingError);
    const error = thrown as Error;
    expect(error.name).toBe("WebhookSecretMissingError");
    expect(error.message).toContain("GITHUB_WEBHOOK_SECRET");
    expect(error.message).not.toContain(forged);
    expect(error.message).not.toContain(forged.slice(7));
    expect(error.message).not.toContain("zen");
  });

  it("le secret est contrôlé avant l'en-tête : en-tête absent + secret vide lève aussi", () => {
    expect(typeof WebhookSecretMissingError).toBe("function");
    expect(() => verifyWebhookSignature({ secret: "", rawBody: BODY, header: undefined })).toThrow(
      WebhookSecretMissingError,
    );
  });
});

describe("TK-45a comparaison en temps constant", () => {
  it("passe par timingSafeEqual sur deux tampons de 32 octets (signature valide et fausse)", () => {
    verify(sign(SECRET, BODY), BODY);
    verify(sign("autre", BODY), BODY);

    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(2);
    for (const [a, b] of crypto.timingSafeEqual.mock.calls as Array<[Uint8Array, Uint8Array]>) {
      expect(a.byteLength).toBe(32);
      expect(b.byteLength).toBe(32);
    }
  });

  it("n'appelle jamais timingSafeEqual avec des longueurs différentes (et ne lève pas)", () => {
    const headers = [
      "sha256=",
      "sha256=abcd",
      `sha256=${"a".repeat(65)}`,
      "sha1=abcdef",
      "",
      undefined,
    ];
    for (const header of headers) expect(verify(header, BODY)).toBe(false);

    for (const [a, b] of crypto.timingSafeEqual.mock.calls as Array<[Uint8Array, Uint8Array]>) {
      expect(a.byteLength).toBe(b.byteLength);
    }
  });

  it("ne repose pas sur une égalité de chaînes pour une signature de bonne forme mais fausse", () => {
    expect(verify(`sha256=${"0".repeat(64)}`, BODY)).toBe(false);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it("calcule un HMAC-SHA256 avec le secret et les octets bruts reçus", () => {
    verify(sign(SECRET, BODY), BODY);
    const algos = crypto.createHmac.mock.calls.map((call) => call[0]);
    expect(algos).toEqual(["sha256"]);
  });

  it("n'accepte pas le SHA-1 : aucun HMAC sha1 n'est calculé", () => {
    crypto.createHmac.mockClear();
    verify(sign(SECRET, BODY, "sha1"), BODY);
    expect(
      crypto.createHmac.mock.calls.map((call) => call[0]).filter((a) => a !== "sha256"),
    ).toEqual([]);
  });
});
