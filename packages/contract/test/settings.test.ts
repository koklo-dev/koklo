import { describe, expect, it } from "vitest";
import {
  CONTRACT_VERSION,
  contract,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
} from "../src/index.ts";
import { input, output, proc, type StandardLike } from "./support.ts";

/**
 * TK-97 (lot A, cas 14) : contrat 2.2.0, ajouts seulement. Réglages : `org.get|update`,
 * `invitation.create|list|resend|revoke`, `member.page|updateRole|remove`, `me.get|update|getNotifications|updateNotification`.
 * `member.invite|setRole|list` restent (dépréciées, B95).
 */
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const isValid = async (schema: StandardLike | undefined, value: unknown) => {
  if (!schema) throw new Error("schema manquant");
  const r = (await schema["~standard"].validate(value)) as { issues?: unknown[] };
  return r.issues === undefined;
};
const meta = (path: string) =>
  (
    proc(path) as unknown as { "~orpc": { meta: { "~openapi": { method: string; path: string } } } }
  )["~orpc"].meta["~openapi"];
const errors = (path: string) => proc(path)?.["~orpc"].errorMap ?? {};

const ROUTES: [string, string, string][] = [
  ["org.get", "GET", "/organization"],
  ["org.update", "PATCH", "/organization"],
  ["invitation.create", "POST", "/invitations"],
  ["invitation.list", "GET", "/invitations"],
  ["invitation.resend", "POST", "/invitations/{invitationId}/resend"],
  ["invitation.revoke", "DELETE", "/invitations/{invitationId}"],
  ["member.page", "GET", "/members/page"],
  ["member.updateRole", "PATCH", "/members/{memberId}"],
  ["member.remove", "DELETE", "/members/{memberId}"],
  ["me.get", "GET", "/me"],
  ["me.update", "PATCH", "/me"],
  ["me.getNotifications", "GET", "/me/notifications"],
  ["me.updateNotification", "PUT", "/me/notifications/{key}"],
];

describe("contrat 2.2.0 : version et routes", () => {
  it("est en 2.2.0", () => expect(CONTRACT_VERSION).toBe("2.2.0"));

  it.each(ROUTES)("%s : %s %s", (name, method, path) => {
    expect(meta(name)).toMatchObject({ method, path });
  });

  it("les routes dépréciées de 2.1.0 restent déclarées", () => {
    for (const name of ["member.invite", "member.setRole", "member.list"]) {
      expect(proc(name), name).toBeDefined();
    }
  });
});

describe("clés d'e-mail (B101)", () => {
  it("liste fermée de huit clés, chacune avec une valeur par défaut", () => {
    expect([...NOTIFICATION_PREFERENCE_KEYS]).toEqual([
      "client_validation",
      "pr_to_review",
      "agent_silent",
      "ai_budget",
      "weekly_digest",
      "deliverable_to_validate",
      "feature_ready",
      "comment_reply",
    ]);
    expect(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).sort()).toEqual(
      [...NOTIFICATION_PREFERENCE_KEYS].sort(),
    );
    expect(DEFAULT_NOTIFICATION_PREFERENCES.weekly_digest).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.pr_to_review).toBe(true);
  });

  it("me.updateNotification refuse une clé inconnue et exige enabled", async () => {
    const schema = input("me.updateNotification");
    expect(await isValid(schema, { key: "comment_reply", enabled: false })).toBe(true);
    expect(await isValid(schema, { key: "inconnue", enabled: false })).toBe(false);
    expect(await isValid(schema, { key: "comment_reply" })).toBe(false);
  });
});

describe("entrées", () => {
  it("org.update : nom 1-100, slug 2-48 minuscules, chiffres, tirets", async () => {
    const schema = input("org.update");
    expect(await isValid(schema, { name: "Atelier", slug: "atelier-2" })).toBe(true);
    expect(await isValid(schema, { name: "", slug: "atelier" })).toBe(false);
    expect(await isValid(schema, { name: "A", slug: "A B" })).toBe(false);
    expect(await isValid(schema, { name: "A", slug: "a" })).toBe(false);
  });

  it("invitation.create : e-mail, rôle attribuable, projectIds facultatifs en UUID", async () => {
    const schema = input("invitation.create");
    expect(
      await isValid(schema, { email: "a@example.test", role: "client", projectIds: [UUID] }),
    ).toBe(true);
    expect(await isValid(schema, { email: "a@example.test", role: "dev" })).toBe(true);
    expect(await isValid(schema, { email: "a@example.test", role: "owner" })).toBe(false);
    expect(
      await isValid(schema, { email: "a@example.test", role: "client", projectIds: ["x"] }),
    ).toBe(false);
  });

  it("member.page : schéma de pages numérotées (page, size 25|50|100, q)", async () => {
    const schema = input("member.page");
    expect(await isValid(schema, { page: "1", size: "25" })).toBe(true);
    expect(await isValid(schema, { page: "2", size: "100", q: "ali" })).toBe(true);
    expect(await isValid(schema, { page: "0", size: "25" })).toBe(false);
    expect(await isValid(schema, { page: "1", size: "30" })).toBe(false);
  });

  it("member.updateRole et member.remove : memberId uuid ; rôle attribuable", async () => {
    expect(await isValid(input("member.updateRole"), { memberId: UUID, role: "dev" })).toBe(true);
    expect(await isValid(input("member.updateRole"), { memberId: UUID, role: "owner" })).toBe(
      false,
    );
    expect(await isValid(input("member.remove"), { memberId: UUID })).toBe(true);
    expect(await isValid(input("member.remove"), { memberId: "1" })).toBe(false);
  });

  it("me.update : nom de 1 à 80 caractères", async () => {
    expect(await isValid(input("me.update"), { name: "Alice" })).toBe(true);
    expect(await isValid(input("me.update"), { name: "" })).toBe(false);
    expect(await isValid(input("me.update"), { name: "x".repeat(81) })).toBe(false);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("sorties", () => {
  it("member.page : lignes avec projets et dernière activité nullable, total, totalIsEstimate", async () => {
    const row = {
      id: UUID,
      userId: UUID,
      name: "Alice",
      email: "a@example.test",
      role: "client",
      projects: [{ id: UUID, name: "P1" }],
      lastActiveAt: null,
    };
    const schema = output("member.page");
    expect(await isValid(schema, { items: [row], total: 1, totalIsEstimate: false })).toBe(true);
    expect(
      await isValid(schema, {
        items: [{ ...row, lastActiveAt: "2026-11-07T10:00:00.000Z" }],
        total: 1,
        totalIsEstimate: false,
      }),
    ).toBe(true);
    expect(
      await isValid(schema, {
        items: [{ ...row, projects: undefined }],
        total: 1,
        totalIsEstimate: false,
      }),
    ).toBe(false);
  });

  it("org.get : compteurs de projets, de membres et de clés d'IA, jamais le fournisseur", async () => {
    const schema = output("org.get");
    const value = {
      id: UUID,
      name: "O",
      slug: "o",
      logo: null,
      projectCount: 1,
      memberCount: 2,
      aiProviderCount: 0,
    };
    expect(await isValid(schema, value)).toBe(true);
    expect(await isValid(schema, { ...value, projectCount: -1 })).toBe(false);
  });

  it("invitation.list : invitations en attente avec leurs projets", async () => {
    const schema = output("invitation.list");
    expect(
      await isValid(schema, [
        {
          id: UUID,
          email: "a@example.test",
          role: "client",
          status: "pending",
          expiresAt: "2026-11-14T10:00:00.000Z",
          invitedBy: "Brice",
          projects: [{ id: UUID, name: "P1" }],
        },
      ]),
    ).toBe(true);
  });

  it("me.get et me.getNotifications", async () => {
    expect(
      await isValid(output("me.get"), {
        id: UUID,
        name: "A",
        email: "a@example.test",
        role: "dev",
      }),
    ).toBe(true);
    expect(
      await isValid(output("me.getNotifications"), [{ key: "comment_reply", enabled: true }]),
    ).toBe(true);
    expect(await isValid(output("me.getNotifications"), [{ key: "inconnue", enabled: true }])).toBe(
      false,
    );
  });
});

describe("erreurs typées", () => {
  it("droits : 401 et 403 sur les écritures de gestion ; 404 uniforme pour les ressources", () => {
    for (const name of [
      "org.update",
      "invitation.create",
      "invitation.revoke",
      "member.updateRole",
      "member.remove",
    ]) {
      expect(errors(name).FORBIDDEN?.status, name).toBe(403);
      expect(errors(name).UNAUTHORIZED?.status, name).toBe(401);
    }
    for (const name of [
      "invitation.resend",
      "invitation.revoke",
      "member.updateRole",
      "member.remove",
      "invitation.create",
    ]) {
      expect(errors(name).NOT_FOUND?.status, name).toBe(404);
    }
    expect(errors("me.get").FORBIDDEN).toBeUndefined();
  });

  it("conflits motivés : slug_taken, already_member, already_invited, self_role, self_remove, last_owner", async () => {
    const reasons = async (name: string, ok: string, ko: string) => {
      const data = errors(name).CONFLICT?.data;
      expect(await isValid(data, { reason: ok }), `${name} ${ok}`).toBe(true);
      expect(await isValid(data, { reason: ko }), `${name} ${ko}`).toBe(false);
    };
    await reasons("org.update", "slug_taken", "self_role");
    await reasons("invitation.create", "already_invited", "slug_taken");
    await reasons("invitation.create", "already_member", "last_owner");
    await reasons("member.updateRole", "self_role", "already_member");
    await reasons("member.updateRole", "last_owner", "self_remove");
    await reasons("member.remove", "self_remove", "self_role");
    await reasons("member.remove", "last_owner", "slug_taken");
  });

  it("entrée invalide : VALIDATION 422 sur invitation.create (projets requis ou refusés)", () => {
    expect(errors("invitation.create").VALIDATION?.status).toBe(422);
  });

  it("le contrat expose les groupes org, invitation et me", () => {
    for (const group of ["org", "invitation", "me"]) {
      expect(Object.keys(contract)).toContain(group);
    }
  });
});
