import { WEBHOOK_EVENTS } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { InvalidWebhookPayloadError, normalizeWebhook } from "../src/index.ts";
import {
  DELIVERY_ID,
  installationPayload,
  otherPayload,
  PERSONAL,
  pushPayload,
  SHA_AFTER,
  SHA_BEFORE,
} from "./support/webhook-payloads.ts";

/**
 * TK-45a : `normalizeWebhook` (packages/github/src/webhook-normalize.ts, exportée par index.ts).
 *   normalizeWebhook(event: string, deliveryId: string, payload: unknown): NormalizedWebhook
 * (types de `@koklo/domain`). Lève `InvalidWebhookPayloadError` (code "invalid_payload", champ
 * `reason`: "unsupported_event" | "malformed_payload") pour un événement hors `WEBHOOK_EVENTS`
 * (ping, star...) ou une forme invalide ; le message ne contient jamais de valeur de la charge.
 * Le résultat ne contient AUCUNE donnée personnelle : seulement les champs du contrat.
 */
const normalize = (event: string, payload: unknown, deliveryId = DELIVERY_ID) =>
  normalizeWebhook(event, deliveryId, payload);
const malformed = (event: string, payload: unknown) => {
  try {
    normalize(event, payload);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("TK-45a push", () => {
  it("normalise une charge réelle vers exactement les champs du contrat", () => {
    expect(normalize("push", pushPayload())).toEqual({
      event: "push",
      deliveryId: DELIVERY_ID,
      installationId: "4242",
      repositoryId: "9001",
      ref: "refs/heads/cadrage",
      branch: "cadrage",
      before: SHA_BEFORE,
      after: SHA_AFTER,
      created: false,
      deleted: false,
      forced: false,
    });
  });

  it("les identifiants numériques deviennent des chaînes ; repository.id, jamais full_name", () => {
    const result = normalize("push", pushPayload());
    expect(result).toMatchObject({ repositoryId: "9001", installationId: "4242" });
    expect(JSON.stringify(result)).not.toContain("acme/specs");
  });

  it("branche avec des barres : le nom complet après refs/heads/", () => {
    expect(normalize("push", pushPayload({ ref: "refs/heads/feat/tk-45/x" }))).toMatchObject({
      ref: "refs/heads/feat/tk-45/x",
      branch: "feat/tk-45/x",
    });
  });

  it("un tag n'a pas de branche (branch = null), la ref est conservée", () => {
    expect(normalize("push", pushPayload({ ref: "refs/tags/v1.0.0" }))).toMatchObject({
      ref: "refs/tags/v1.0.0",
      branch: null,
    });
  });

  it("une ref hors refs/heads/ et refs/tags/ n'a pas de branche non plus", () => {
    expect(normalize("push", pushPayload({ ref: "refs/pull/12/head" }))).toMatchObject({
      branch: null,
    });
  });

  it("created, deleted et forced sont repris tels quels", () => {
    expect(
      normalize("push", pushPayload({ created: true, deleted: false, forced: false })),
    ).toMatchObject({ created: true, deleted: false, forced: false });
    expect(
      normalize("push", pushPayload({ created: false, deleted: true, forced: false })),
    ).toMatchObject({ created: false, deleted: true, forced: false });
    expect(
      normalize("push", pushPayload({ created: false, deleted: false, forced: true })),
    ).toMatchObject({ created: false, deleted: false, forced: true });
  });

  it("suppression de branche : after = 40 zéros accepté", () => {
    const zeros = "0".repeat(40);
    expect(
      normalize("push", pushPayload({ deleted: true, after: zeros, ref: "refs/heads/old" })),
    ).toMatchObject({ deleted: true, after: zeros });
  });

  it("empreintes SHA-256 de 64 caractères acceptées", () => {
    const long = "ab".repeat(32);
    expect(normalize("push", pushPayload({ before: long, after: long }))).toMatchObject({
      before: long,
      after: long,
    });
  });

  it("l'identifiant de livraison fourni est repris, pas celui d'un en-tête de la charge", () => {
    expect(normalize("push", pushPayload(), "99999999-0000-4000-8000-000000000000")).toMatchObject({
      deliveryId: "99999999-0000-4000-8000-000000000000",
    });
  });
});

describe("TK-45a installation", () => {
  it.each(["created", "deleted", "suspend", "unsuspend", "new_permissions_accepted"] as const)(
    "action %s",
    (action) => {
      expect(normalize("installation", installationPayload(action))).toEqual({
        event: "installation",
        deliveryId: DELIVERY_ID,
        action,
        installationId: "4242",
        account: { externalId: "77", login: "acme", kind: "organization" },
      });
    },
  );

  it("un compte utilisateur donne kind = user", () => {
    const payload = installationPayload("created");
    const installation = payload.installation as { account: Record<string, unknown> };
    installation.account = { login: "bob", id: 5, type: "User" };
    expect(normalize("installation", payload)).toMatchObject({
      account: { externalId: "5", login: "bob", kind: "user" },
    });
  });

  it("un type de compte inconnu est refusé", () => {
    const payload = installationPayload("created");
    (payload.installation as { account: Record<string, unknown> }).account = {
      login: "x",
      id: 5,
      type: "Enterprise",
    };
    expect(malformed("installation", payload)).toBeInstanceOf(InvalidWebhookPayloadError);
  });

  it("une action inconnue est refusée", () => {
    expect(malformed("installation", installationPayload("transferred"))).toBeInstanceOf(
      InvalidWebhookPayloadError,
    );
  });
});

describe("TK-45a autres événements : enveloppe minimale sans corps", () => {
  const others = WEBHOOK_EVENTS.filter((e) => e !== "push" && e !== "installation");

  it("couvre les six autres événements stockés", () => {
    expect(others).toHaveLength(6);
  });

  it.each(others)(
    "%s : { event, deliveryId, action, installationId, repositoryId } seulement",
    (event) => {
      expect(normalize(event, otherPayload("opened"))).toEqual({
        event,
        deliveryId: DELIVERY_ID,
        action: "opened",
        installationId: "4242",
        repositoryId: "9001",
      });
    },
  );

  it("action, installation et dépôt absents donnent null", () => {
    expect(normalize("check_run", { check_run: { id: 1 } })).toEqual({
      event: "check_run",
      deliveryId: DELIVERY_ID,
      action: null,
      installationId: null,
      repositoryId: null,
    });
    expect(normalize("workflow_run", otherPayload(null))).toMatchObject({ action: null });
  });
});

describe("TK-45a événements ignorés : refus typé", () => {
  it.each([
    "ping",
    "star",
    "issues",
    "repository",
    "installation_repositories",
    "",
    "PUSH",
    "push ",
  ])("événement %j", (event) => {
    const error = malformed(event, pushPayload()) as InvalidWebhookPayloadError;
    expect(error).toBeInstanceOf(InvalidWebhookPayloadError);
    expect(error.code).toBe("invalid_payload");
    expect(error.reason).toBe("unsupported_event");
  });
});

describe("TK-45a payload mal formé : InvalidWebhookPayloadError", () => {
  const without = (key: string, base = pushPayload()) => {
    const copy = { ...base };
    delete copy[key];
    return copy;
  };
  const repoWithout = (key: string) => {
    const base = pushPayload();
    const repository = { ...(base.repository as Record<string, unknown>) };
    delete repository[key];
    return { ...base, repository };
  };

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["une chaîne", "push"],
    ["un nombre", 42],
    ["un tableau", [pushPayload()]],
    ["un booléen", true],
  ])("charge qui n'est pas un objet (%s), pour chaque événement", (_label, payload) => {
    for (const event of WEBHOOK_EVENTS) {
      expect(malformed(event, payload), event).toBeInstanceOf(InvalidWebhookPayloadError);
    }
  });

  it.each([
    ["ref absente", without("ref")],
    ["ref vide", pushPayload({ ref: "" })],
    ["ref non chaîne", pushPayload({ ref: 12 })],
    ["before absent", without("before")],
    ["after absent", without("after")],
    ["after non hexadécimal", pushPayload({ after: "z".repeat(40) })],
    ["after de mauvaise longueur", pushPayload({ after: "a".repeat(39) })],
    ["after non chaîne", pushPayload({ after: 123 })],
    ["created absent", without("created")],
    ["deleted non booléen", pushPayload({ deleted: "false" })],
    ["forced absent", without("forced")],
    ["repository absent", without("repository")],
    ["repository non objet", pushPayload({ repository: "acme/specs" })],
    ["repository.id absent", repoWithout("id")],
    ["repository.id nul", pushPayload({ repository: { id: null } })],
    ["repository.id négatif", pushPayload({ repository: { id: -1 } })],
    ["repository.id nul (0)", pushPayload({ repository: { id: 0 } })],
    ["repository.id fractionnaire", pushPayload({ repository: { id: 1.5 } })],
    ["repository.id hors entier sûr", pushPayload({ repository: { id: 2 ** 60 } })],
    ["repository.id NaN", pushPayload({ repository: { id: Number.NaN } })],
    ["repository.id objet", pushPayload({ repository: { id: { n: 1 } } })],
    ["installation absente", without("installation")],
    ["installation.id absent", pushPayload({ installation: {} })],
    ["installation.id non entier", pushPayload({ installation: { id: "abc" } })],
  ])("push : %s", (_label, payload) => {
    const error = malformed("push", payload) as InvalidWebhookPayloadError;
    expect(error).toBeInstanceOf(InvalidWebhookPayloadError);
    expect(error.name).toBe("InvalidWebhookPayloadError");
    expect(error.code).toBe("invalid_payload");
    expect(error.reason).toBe("malformed_payload");
    expect(error.event).toBe("push");
  });

  it.each([
    [
      "action absente",
      (() => {
        const p = installationPayload("created");
        delete p.action;
        return p;
      })(),
    ],
    ["action non chaîne", installationPayload("created", { action: 3 })],
    [
      "installation absente",
      (() => {
        const p = installationPayload("created");
        delete p.installation;
        return p;
      })(),
    ],
    [
      "installation.id absent",
      installationPayload("created", {
        installation: { account: { id: 1, login: "a", type: "User" } },
      }),
    ],
    ["account absent", installationPayload("created", { installation: { id: 1 } })],
    [
      "account.login absent",
      installationPayload("created", { installation: { id: 1, account: { id: 1, type: "User" } } }),
    ],
    [
      "account.id absent",
      installationPayload("created", {
        installation: { id: 1, account: { login: "a", type: "User" } },
      }),
    ],
  ])("installation : %s", (_label, payload) => {
    const error = malformed("installation", payload) as InvalidWebhookPayloadError;
    expect(error).toBeInstanceOf(InvalidWebhookPayloadError);
    expect(error.reason).toBe("malformed_payload");
    expect(error.event).toBe("installation");
  });

  it("identifiant de livraison vide : refusé", () => {
    expect(typeof InvalidWebhookPayloadError).toBe("function");
    expect(() => normalizeWebhook("push", "", pushPayload())).toThrow(InvalidWebhookPayloadError);
  });

  it("le message d'erreur ne répète aucune valeur de la charge", () => {
    const payload = pushPayload({ ref: 12, secretish: "VALUE-SENTINEL-98765" });
    const error = malformed("push", payload) as Error;
    expect(error).toBeInstanceOf(InvalidWebhookPayloadError);
    for (const surface of [
      error.message,
      String(error),
      JSON.stringify(error),
      error.stack ?? "",
    ]) {
      expect(surface).not.toContain("VALUE-SENTINEL-98765");
      expect(surface).not.toContain(PERSONAL.authorEmail);
      expect(surface).not.toContain(SHA_AFTER);
    }
  });
});

describe("TK-45a champs inattendus ignorés, charges énormes, aucune donnée personnelle", () => {
  const PERSONAL_VALUES = Object.values(PERSONAL);

  it("aucun champ personnel (auteurs, e-mails, expéditeur, avatars) dans push", () => {
    const text = JSON.stringify(normalize("push", pushPayload()));
    for (const value of PERSONAL_VALUES) expect(text).not.toContain(value);
    expect(text).not.toMatch(/@|avatar|author|committer|pusher|sender|message|commit/i);
  });

  it("aucun champ personnel dans installation (le compte ne rend que id, login, type)", () => {
    const result = normalize("installation", installationPayload("suspend"));
    const text = JSON.stringify(result);
    for (const value of PERSONAL_VALUES) expect(text).not.toContain(value);
    expect(Object.keys((result as { account: object }).account).sort()).toEqual([
      "externalId",
      "kind",
      "login",
    ]);
    expect(text).not.toMatch(/suspended_by|sender|permissions|repositories/);
  });

  it("aucun champ personnel dans les autres événements", () => {
    const text = JSON.stringify(normalize("pull_request", otherPayload()));
    for (const value of PERSONAL_VALUES) expect(text).not.toContain(value);
    expect(text).not.toContain("SENTINEL");
  });

  it("des champs inconnus à tous les niveaux n'ont aucun effet sur le résultat", () => {
    const baseline = normalize("push", pushPayload());
    const noisy = pushPayload({
      surprise: { deep: [1, 2, 3] },
      repository: { id: 9001, extra: { a: 1 }, owner: { email: PERSONAL.authorEmail } },
      installation: { id: 4242, unexpected: true },
    });
    expect(normalize("push", noisy)).toEqual(baseline);
  });

  it("une charge énorme (20 000 commits, chaînes de 1 Mio) donne un résultat minuscule et vite", () => {
    const huge = "x".repeat(1024 * 1024);
    const commits = Array.from({ length: 20_000 }, (_, i) => ({
      id: String(i),
      message: huge.slice(0, 64),
      author: { name: huge.slice(0, 32), email: `${i}@example.invalid` },
    }));
    const payload = pushPayload({ commits, head_commit: { message: huge }, note: huge });

    const started = Date.now();
    const result = normalize("push", payload);

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(JSON.stringify(result).length).toBeLessThan(1_000);
  });

  it("ne modifie pas la charge reçue", () => {
    const payload = pushPayload();
    const snapshot = JSON.stringify(payload);
    normalize("push", payload);
    expect(JSON.stringify(payload)).toBe(snapshot);
  });

  it("une clé __proto__ ou constructor dans la charge ne pollue ni le résultat ni les prototypes", () => {
    const payload = JSON.parse(
      `{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},` +
        `"ref":"refs/heads/cadrage","before":"${SHA_BEFORE}","after":"${SHA_AFTER}",` +
        `"created":false,"deleted":false,"forced":false,"repository":{"id":9001},"installation":{"id":4242}}`,
    );
    const result = normalize("push", payload);
    expect((result as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(result).sort()).toEqual(
      [
        "after",
        "before",
        "branch",
        "created",
        "deleted",
        "deliveryId",
        "event",
        "forced",
        "installationId",
        "ref",
        "repositoryId",
      ].sort(),
    );
  });

  it("le résultat est indépendant de la charge (copie de valeurs, pas de référence)", () => {
    const payload = installationPayload("created");
    const result = normalize("installation", payload) as { account: object };
    expect(result.account).not.toBe((payload.installation as { account: object }).account);
  });
});
