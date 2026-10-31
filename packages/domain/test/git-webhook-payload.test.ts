import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  InstallationWebhook,
  InstallationWebhookAction,
  NormalizedWebhook,
  OtherWebhook,
  PushWebhook,
  WebhookAccount,
  WebhookDeliveryErrorCode,
  WebhookDeliveryJob,
} from "../src/index.ts";
import * as domain from "../src/index.ts";

/**
 * TK-45a : types de charges de webhook normalisées (provider-neutres, sans aucune donnée personnelle
 * de commit), constantes de file / clés / codes d'erreur / rétention. Fichier attendu :
 * `packages/domain/src/git-webhook-payload.ts`, ré-exporté par `index.ts`. `WEBHOOK_EVENTS` ne change pas.
 */
const srcFile = resolve(import.meta.dirname, "../src/git-webhook-payload.ts");

const push: PushWebhook = {
  event: "push",
  deliveryId: "11111111-2222-4333-8444-555555555555",
  installationId: "4242",
  repositoryId: "9001",
  ref: "refs/heads/cadrage",
  branch: "cadrage",
  before: "a".repeat(40),
  after: "b".repeat(40),
  created: false,
  deleted: false,
  forced: false,
};
const installation: InstallationWebhook = {
  event: "installation",
  deliveryId: "11111111-2222-4333-8444-555555555556",
  action: "suspend",
  installationId: "4242",
  account: { externalId: "77", login: "acme", kind: "organization" },
};

describe("TK-45a fichier et exports du domaine", () => {
  it("git-webhook-payload.ts existe et n'importe que du relatif (domaine pur)", () => {
    const source = readFileSync(srcFile, "utf8");
    const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
      (m) => m[1] as string,
    );
    for (const spec of imports) expect(spec.startsWith("./"), spec).toBe(true);
    expect(source).not.toMatch(/node:crypto|createHmac|timingSafeEqual/);
  });

  it("index.ts ré-exporte le fichier", () => {
    expect(readFileSync(resolve(import.meta.dirname, "../src/index.ts"), "utf8")).toContain(
      'export * from "./git-webhook-payload.ts";',
    );
  });

  it("WEBHOOK_EVENTS reste inchangé (8 événements, gelé)", () => {
    expect([...domain.WEBHOOK_EVENTS]).toEqual([
      "installation",
      "push",
      "pull_request",
      "pull_request_review",
      "check_suite",
      "check_run",
      "workflow_run",
      "deployment_status",
    ]);
    expect(Object.isFrozen(domain.WEBHOOK_EVENTS)).toBe(true);
  });
});

describe("TK-45a formes des charges normalisées (types)", () => {
  it("PushWebhook : identifiants, ref, branche, avant/après, créé/supprimé/forcé", () => {
    expectTypeOf(push).toHaveProperty("deliveryId").toEqualTypeOf<string>();
    expectTypeOf(push).toHaveProperty("installationId").toEqualTypeOf<string>();
    expectTypeOf(push).toHaveProperty("repositoryId").toEqualTypeOf<string>();
    expectTypeOf(push).toHaveProperty("ref").toEqualTypeOf<string>();
    expectTypeOf(push).toHaveProperty("branch").toEqualTypeOf<string | null>();
    expectTypeOf(push).toHaveProperty("before").toEqualTypeOf<string>();
    expectTypeOf(push).toHaveProperty("after").toEqualTypeOf<string>();
    expectTypeOf(push).toHaveProperty("created").toEqualTypeOf<boolean>();
    expectTypeOf(push).toHaveProperty("deleted").toEqualTypeOf<boolean>();
    expectTypeOf(push).toHaveProperty("forced").toEqualTypeOf<boolean>();
    expect(push.event).toBe("push");
  });

  it("PushWebhook ne porte ni commits, ni auteurs, ni e-mails, ni messages, ni expéditeur", () => {
    for (const key of [
      "commits",
      "head_commit",
      "author",
      "authors",
      "email",
      "pusher",
      "sender",
    ]) {
      expectTypeOf<PushWebhook>().not.toHaveProperty(key);
    }
    expect(Object.keys(push).sort()).toEqual(
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
});

describe("TK-45a formes des charges normalisées (types), suite", () => {
  it("InstallationWebhook : action fermée, installation, compte propriétaire", () => {
    expectTypeOf<InstallationWebhookAction>().toEqualTypeOf<
      "created" | "deleted" | "suspend" | "unsuspend" | "new_permissions_accepted"
    >();
    expectTypeOf(installation).toHaveProperty("account").toEqualTypeOf<WebhookAccount>();
    expectTypeOf<WebhookAccount>().toEqualTypeOf<{
      readonly externalId: string;
      readonly login: string;
      readonly kind: "user" | "organization";
    }>();
    expectTypeOf<InstallationWebhook>().not.toHaveProperty("sender");
  });

  it("OtherWebhook : enveloppe minimale, sans corps", () => {
    expectTypeOf<OtherWebhook>().toHaveProperty("action").toEqualTypeOf<string | null>();
    expectTypeOf<OtherWebhook>().toHaveProperty("installationId").toEqualTypeOf<string | null>();
    expectTypeOf<OtherWebhook>().toHaveProperty("repositoryId").toEqualTypeOf<string | null>();
    expectTypeOf<OtherWebhook>().not.toHaveProperty("payload");
    expectTypeOf<OtherWebhook["event"]>().toEqualTypeOf<
      | "pull_request"
      | "pull_request_review"
      | "check_suite"
      | "check_run"
      | "workflow_run"
      | "deployment_status"
    >();
  });

  it("NormalizedWebhook est l'union des trois formes, discriminée par event", () => {
    expectTypeOf<NormalizedWebhook>().toEqualTypeOf<
      PushWebhook | InstallationWebhook | OtherWebhook
    >();
  });

  it("WebhookDeliveryJob ne porte que l'identifiant de ligne", () => {
    expectTypeOf<WebhookDeliveryJob>().toEqualTypeOf<{ readonly deliveryId: string }>();
  });
});

describe("TK-45a constantes de file, clés et codes d'erreur", () => {
  it("noms des files", () => {
    expect(domain.WEBHOOK_DELIVERY_QUEUE).toBe("webhook-delivery");
    expect(domain.WEBHOOK_PURGE_QUEUE).toBe("webhook-purge");
  });

  it("clé de sérialisation : installation:<id> et push:<repo>:<ref>", () => {
    expect(domain.webhookDeliverySingletonKey(installation)).toBe("installation:4242");
    expect(domain.webhookDeliverySingletonKey(push)).toBe("push:9001:refs/heads/cadrage");
  });

  it("deux branches ont deux clés, une même branche la même, deux dépôts deux clés", () => {
    const other = { ...push, ref: "refs/heads/feat/x", branch: "feat/x" };
    const otherRepo = { ...push, repositoryId: "9002" };
    expect(domain.webhookDeliverySingletonKey(other)).not.toBe(
      domain.webhookDeliverySingletonKey(push),
    );
    expect(domain.webhookDeliverySingletonKey(otherRepo)).not.toBe(
      domain.webhookDeliverySingletonKey(push),
    );
    expect(domain.webhookDeliverySingletonKey({ ...push, after: "c".repeat(40) })).toBe(
      domain.webhookDeliverySingletonKey(push),
    );
  });
});

describe("TK-45a codes d'erreur, actions et limites", () => {
  it("codes d'erreur de livraison : liste fermée, gelée, dans l'ordre de l'analyse", () => {
    expect([...domain.WEBHOOK_DELIVERY_ERROR_CODES]).toEqual([
      "invalid_payload",
      "unknown_installation",
      "unknown_repo",
      "repo_not_found",
      "provider_unavailable",
      "provider_auth_expired",
      "provider_rate_limited",
      "spec_too_large",
      "internal",
    ]);
    expect(Object.isFrozen(domain.WEBHOOK_DELIVERY_ERROR_CODES)).toBe(true);
    expectTypeOf<WebhookDeliveryErrorCode>().toEqualTypeOf<
      (typeof domain.WEBHOOK_DELIVERY_ERROR_CODES)[number]
    >();
  });

  it("actions d'installation connues : liste gelée", () => {
    expect([...domain.INSTALLATION_WEBHOOK_ACTIONS]).toEqual([
      "created",
      "deleted",
      "suspend",
      "unsuspend",
      "new_permissions_accepted",
    ]);
    expect(Object.isFrozen(domain.INSTALLATION_WEBHOOK_ACTIONS)).toBe(true);
  });

  it("rétention : 30 jours par défaut, bornes 1 à 365", () => {
    expect(domain.WEBHOOK_RETENTION_DAYS_DEFAULT).toBe(30);
    expect(domain.WEBHOOK_RETENTION_DAYS_MIN).toBe(1);
    expect(domain.WEBHOOK_RETENTION_DAYS_MAX).toBe(365);
  });

  it("plafond du corps : 5 Mio", () => {
    expect(domain.WEBHOOK_MAX_BODY_BYTES).toBe(5 * 1024 * 1024);
  });
});
