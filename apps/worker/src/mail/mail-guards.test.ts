import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html.ts";
import { MailDeliveryError } from "./mail-errors.ts";
import {
  assertMailAddress,
  assertMailHeaderSafe,
  assertMailMessageSafe,
  MAIL_HEADER_ALLOWLIST,
  MAIL_LIMITS,
} from "./mail-guards.ts";
import type { MailMessage } from "./mail-sender.ts";

/**
 * TK-58a : gardes CRLF/NUL/longueur sur `to`, `subject`, `idempotencyKey` et `headers`, appliquées dans
 * le gabarit ET dans chaque adaptateur. Le refus est typé (permanent, `invalid-message`) et son message
 * ne cite jamais la valeur fautive.
 */
const OK: MailMessage = {
  to: "alice@example.test",
  subject: "Sujet",
  text: "texte",
  html: "<p>html</p>",
};

function failureOf(fn: () => void): MailDeliveryError | undefined {
  try {
    fn();
  } catch (error) {
    return error as MailDeliveryError;
  }
  return undefined;
}

const INJECTIONS = [
  "a\r\nBcc: evil@example.test",
  "a\nBcc: evil@example.test",
  "a\rb",
  "a\0b",
  " x",
];

describe("assertMailHeaderSafe", () => {
  it.each(["subject", "idempotencyKey"] as const)("%s : valeur ordinaire acceptée", (field) => {
    expect(() => assertMailHeaderSafe(field, "valeur-ordinaire:1")).not.toThrow();
  });

  it.each(INJECTIONS)("subject : %j refusé sans citer la valeur", (value) => {
    const error = failureOf(() => assertMailHeaderSafe("subject", value));
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error?.kind).toBe("permanent");
    expect(error?.code).toBe("invalid-message");
    expect(error?.message).not.toContain("evil@example.test");
  });

  it.each(INJECTIONS)("idempotencyKey : %j refusé", (value) => {
    expect(failureOf(() => assertMailHeaderSafe("idempotencyKey", value))).toBeInstanceOf(
      MailDeliveryError,
    );
  });

  it("refuse une valeur vide et une valeur trop longue", () => {
    expect(failureOf(() => assertMailHeaderSafe("subject", ""))).toBeInstanceOf(MailDeliveryError);
    expect(
      failureOf(() => assertMailHeaderSafe("subject", "x".repeat(MAIL_LIMITS.subject + 1))),
    ).toBeInstanceOf(MailDeliveryError);
    expect(() => assertMailHeaderSafe("subject", "x".repeat(MAIL_LIMITS.subject))).not.toThrow();
    expect(
      failureOf(() =>
        assertMailHeaderSafe("idempotencyKey", "k".repeat(MAIL_LIMITS.idempotencyKey + 1)),
      ),
    ).toBeInstanceOf(MailDeliveryError);
  });
});

describe("assertMailAddress", () => {
  it.each(["alice@example.test", "a.b+tag@sub.example.test"])("%s accepté", (value) => {
    expect(() => assertMailAddress(value)).not.toThrow();
  });

  it.each([
    "",
    "sans-arobase",
    "a@b",
    "a@@example.test",
    "a b@example.test",
    "a@example.test, b@example.test",
    "a@example.test;b@example.test",
    "Alice <a@example.test>",
    "<a@example.test>",
    ...INJECTIONS.map((value) => `${value}@example.test`),
    `${"a".repeat(MAIL_LIMITS.address)}@example.test`,
  ])("%j refusé", (value) => {
    const error = failureOf(() => assertMailAddress(value));
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error?.kind).toBe("permanent");
    if (value.length > 0) expect(error?.message).not.toContain(value.slice(0, 12));
  });
});

describe("assertMailMessageSafe", () => {
  it("message valide (avec clé et en-tête de la liste blanche) accepté", () => {
    expect(() =>
      assertMailMessageSafe({
        ...OK,
        idempotencyKey: "notification:abc",
        headers: { [MAIL_HEADER_ALLOWLIST[0] as string]: "abc-123" },
      }),
    ).not.toThrow();
    expect(() => assertMailMessageSafe(OK)).not.toThrow();
  });

  it("refuse chaque champ piégé : to, subject, idempotencyKey", () => {
    for (const bad of [
      { to: "a@example.test\r\nBcc: x@example.test" },
      { subject: "ok\r\nBcc: x@example.test" },
      { idempotencyKey: "k\r\nX: y" },
      { to: "a@example.test\0" },
    ]) {
      expect(failureOf(() => assertMailMessageSafe({ ...OK, ...bad }))).toBeInstanceOf(
        MailDeliveryError,
      );
    }
  });

  it("refuse un en-tête hors liste blanche (List-Unsubscribe est reporté) ou à valeur piégée", () => {
    const unsubscribe = { "List-Unsubscribe": "<https://web.test/u>" };
    expect(failureOf(() => assertMailMessageSafe({ ...OK, headers: unsubscribe }))).toBeInstanceOf(
      MailDeliveryError,
    );
    const name = MAIL_HEADER_ALLOWLIST[0] as string;
    expect(
      failureOf(() => assertMailMessageSafe({ ...OK, headers: { [name]: "a\r\nBcc: x" } })),
    ).toBeInstanceOf(MailDeliveryError);
    expect(
      failureOf(() => assertMailMessageSafe({ ...OK, headers: { "X-A\r\nB": "v" } })),
    ).toBeInstanceOf(MailDeliveryError);
  });

  it("la liste blanche ne contient pas List-Unsubscribe", () => {
    expect(MAIL_HEADER_ALLOWLIST.map((n) => n.toLowerCase())).not.toContain("list-unsubscribe");
  });
});

describe("escapeHtml", () => {
  it("échappe aussi l'apostrophe", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});
