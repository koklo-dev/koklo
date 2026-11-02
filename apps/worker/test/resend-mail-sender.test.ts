import { Resend } from "resend";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailDeliveryError } from "../src/mail/mail-errors.ts";
import type { MailMessage } from "../src/mail/mail-sender.ts";
import { type ResendClient, ResendMailSender } from "../src/mail/resend-mail-sender.ts";

/**
 * TK-58a : ResendMailSender à transport simulé (client injecté, puis `globalThis.fetch` remplacé pour
 * le vrai SDK). Aucun appel réseau. Classement des erreurs : 4xx permanent ; 429, 5xx, réseau,
 * exception du client transitoires. Le message d'erreur ne cite jamais le corps ni l'adresse.
 */
const FROM = "Koklo <no-reply@koklo.dev>";
const MESSAGE: MailMessage = {
  to: "alice@example.test",
  subject: "Sujet",
  text: "https://web.test/?token=SENTINEL-TOKEN",
  html: "<p>SENTINEL-HTML</p>",
  idempotencyKey: "notification:0190-abc",
  headers: { "X-Entity-Ref-ID": "0190-abc" },
};

type SendFn = ResendClient["emails"]["send"];
const clientOf = (send: SendFn): ResendClient => ({ emails: { send } });

async function failureOf(send: SendFn, message = MESSAGE): Promise<MailDeliveryError> {
  try {
    await new ResendMailSender(clientOf(send), FROM).send(message);
  } catch (error) {
    return error as MailDeliveryError;
  }
  throw new Error("aucune erreur levée");
}

afterEach(() => vi.unstubAllGlobals());

describe("ResendMailSender : transmission au client", () => {
  it("transmet from, to, subject, text, html, headers et la clé d'idempotence en option", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ error: null });
    await new ResendMailSender(clientOf(send), FROM).send(MESSAGE);
    expect(send).toHaveBeenCalledTimes(1);
    const [payload, options] = send.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      from: FROM,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
      headers: { "X-Entity-Ref-ID": "0190-abc" },
    });
    expect(payload).not.toHaveProperty("idempotencyKey");
    expect(options).toEqual({ idempotencyKey: "notification:0190-abc" });
  });

  it("sans clé : aucune option d'idempotence", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ error: null });
    const { idempotencyKey: _key, ...withoutKey } = MESSAGE;
    await new ResendMailSender(clientOf(send), FROM).send(withoutKey);
    expect(send.mock.calls[0]?.[1]?.idempotencyKey).toBeUndefined();
  });

  it("refuse un message piégé AVANT tout appel au client", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ error: null });
    const error = await failureOf(send, {
      ...MESSAGE,
      to: "a@example.test\r\nBcc: x@example.test",
    });
    expect(error.kind).toBe("permanent");
    expect(error.code).toBe("invalid-message");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("ResendMailSender : classement des erreurs", () => {
  it.each([400, 401, 403, 404, 422])("statut %d : permanent (rejected)", async (statusCode) => {
    const error = await failureOf(async () => ({
      error: { name: "validation_error", statusCode },
    }));
    expect(error.kind).toBe("permanent");
    expect(error.code).toBe("rejected");
  });

  it("409 (requête concurrente avec la même clé d'idempotence) : transitoire, jamais failed", async () => {
    const error = await failureOf(async () => ({
      error: { name: "concurrent_idempotent_requests", statusCode: 409 },
    }));
    expect(error.kind).toBe("transient");
    expect(error.code).toBe("idempotency-conflict");
  });

  it("429 : transitoire (rate-limited)", async () => {
    const error = await failureOf(async () => ({
      error: { name: "rate_limit_exceeded", statusCode: 429 },
    }));
    expect(error.kind).toBe("transient");
    expect(error.code).toBe("rate-limited");
  });

  it.each([500, 502, 503, 504])(
    "statut %d : transitoire (provider-unavailable)",
    async (statusCode) => {
      const error = await failureOf(async () => ({
        error: { name: "internal_server_error", statusCode },
      }));
      expect(error.kind).toBe("transient");
      expect(error.code).toBe("provider-unavailable");
    },
  );

  it("erreur sans statut (réseau côté SDK) : transitoire (network)", async () => {
    const error = await failureOf(async () => ({
      error: { name: "application_error", statusCode: null },
    }));
    expect(error.kind).toBe("transient");
    expect(error.code).toBe("network");
  });

  it("exception du client (réseau coupé) : transitoire, sans citer le message d'origine", async () => {
    const error = await failureOf(async () => {
      throw new TypeError("fetch failed https://web.test/?token=SENTINEL-TOKEN");
    });
    expect(error.kind).toBe("transient");
    expect(error.code).toBe("network");
    expect(error.message).not.toContain("SENTINEL-TOKEN");
  });

  it("le message d'erreur ne cite ni l'adresse, ni le corps, ni la clé", async () => {
    const error = await failureOf(async () => ({
      error: { name: "validation_error", statusCode: 422 },
    }));
    for (const secret of [MESSAGE.to, "SENTINEL-TOKEN", "SENTINEL-HTML", "0190-abc"]) {
      expect(error.message).not.toContain(secret);
    }
  });
});

describe("ResendMailSender avec le vrai SDK et fetch simulé (jamais le réseau)", () => {
  const ok = () =>
    new Response(JSON.stringify({ id: "mail_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  it("envoie l'en-tête Idempotency-Key et l'en-tête de message au transport", async () => {
    const fetchMock = vi.fn(async (..._args: [unknown, RequestInit]) => ok());
    vi.stubGlobal("fetch", fetchMock);
    await new ResendMailSender(new Resend("re_test_key"), FROM).send(MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("notification:0190-abc");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.headers).toEqual({ "X-Entity-Ref-ID": "0190-abc" });
    expect(body).not.toHaveProperty("idempotencyKey");
  });

  it.each([
    [422, "permanent"],
    [429, "transient"],
    [503, "transient"],
  ] as const)("réponse HTTP %d : erreur %s", async (status, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ name: "x_error", message: "SENTINEL-PROVIDER", statusCode: status }),
            {
              status,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    let caught: MailDeliveryError | undefined;
    try {
      await new ResendMailSender(new Resend("re_test_key"), FROM).send(MESSAGE);
    } catch (error) {
      caught = error as MailDeliveryError;
    }
    expect(caught?.kind).toBe(kind);
    expect(caught?.message).not.toContain("SENTINEL-PROVIDER");
  });

  it("transport coupé : transitoire", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    let caught: MailDeliveryError | undefined;
    try {
      await new ResendMailSender(new Resend("re_test_key"), FROM).send(MESSAGE);
    } catch (error) {
      caught = error as MailDeliveryError;
    }
    expect(caught?.kind).toBe("transient");
  });
});
