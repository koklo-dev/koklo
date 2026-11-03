import { contract } from "@koklo/contract";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commentsFor } from "./helpers/comments.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, type ReviewScene, reviewApi } from "./helpers/reviews.ts";
import { suggestionApi } from "./helpers/suggestions.ts";
import { type HttpMethod, seedTicket, send } from "./helpers/tickets.ts";

/**
 * TK-55 (critère unique) : « un client ne peut pas éditer, seulement suggérer et valider ». Les écritures
 * sont ÉNUMÉRÉES DEPUIS LE CONTRAT COMPLET (toute procédure dont la méthode OpenAPI n'est pas GET) et
 * classées : une route d'écriture ajoutée sans classement fait échouer le test. Le client lié ne peut
 * que suggérer (create, withdraw), valider (review.submit) et commenter ; tout le reste est 403, y compris la création d'une organisation (TK-55e).
 */
const ALLOWED = ["comment.create", "review.submit", "suggestion.create", "suggestion.withdraw"];
/** Suppression de SON propre commentaire : droit d'auteur vérifié dans le service (comment-permissions). */
const OWN_ONLY = ["comment.delete"];
const DENIED = [
  "ai.draftBrief",
  "ai.proposeCriteria",
  "ai.proposeFeatures",
  "dependency.add",
  "dependency.remove",
  "installation.start",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "llmCredential.invalidate",
  "llmCredential.remove",
  "llmCredential.set",
  "llmCredential.verify",
  "member.invite",
  "member.setRole",
  "organization.create",
  "project.create",
  "projectClient.add",
  "projectClient.remove",
  "projectState.update",
  "repo.createSpec",
  "repo.link",
  "review.list",
  "specBatch.submit",
  "sprint.activate",
  "sprint.close",
  "sprint.create",
  "sprint.update",
  "suggestion.accept",
  "suggestion.reject",
  "ticket.create",
  "ticket.delete",
  "ticket.transition",
  "ticket.update",
];

interface Route {
  name: string;
  method: string;
  path: string;
}
type Procedure = { "~orpc": { meta: { "~openapi"?: { method?: string; path?: string } } } };

/** Toutes les procédures du contrat (groupes et procédures isolées) avec méthode et chemin OpenAPI. */
function routes(): Route[] {
  const out: Route[] = [];
  for (const [group, node] of Object.entries(contract as unknown as Record<string, object>)) {
    const entries =
      "~orpc" in node
        ? [[group, node]]
        : Object.entries(node).map(([n, p]) => [`${group}.${n}`, p]);
    for (const [name, procedure] of entries as [string, Procedure][]) {
      const meta = procedure["~orpc"].meta["~openapi"];
      out.push({ name, method: meta?.method ?? "", path: meta?.path ?? "" });
    }
  }
  return out;
}
const writes = () => routes().filter((r) => r.method !== "GET");

describe("classement exhaustif des écritures du contrat", () => {
  it("toute écriture du contrat est classée : autorisée, propre à l'auteur ou interdite", () => {
    const classified = [...ALLOWED, ...OWN_ONLY, ...DENIED].sort();
    expect(
      writes()
        .map((r) => r.name)
        .sort(),
    ).toEqual(classified.filter((n) => n !== "review.list"));
  });

  it("aucune écriture n'échappe à la règle : le critère ne laisse plus d'exception de compte", () => {
    const exempt = writes().filter((r) => ![...ALLOWED, ...OWN_ONLY, ...DENIED].includes(r.name));
    expect(exempt).toEqual([]);
    expect(DENIED).toContain("organization.create");
  });

  it("review.list est une lecture (GET) classée interdite au client au titre du détail technique", () => {
    expect(routes().find((r) => r.name === "review.list")?.method).toBe("GET");
  });

  it("les écritures autorisées au client sont exactement suggérer, retirer, valider et commenter", () => {
    expect(ALLOWED).toEqual([
      "comment.create",
      "review.submit",
      "suggestion.create",
      "suggestion.withdraw",
    ]);
  });
});

const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});

const fill = (path: string) =>
  path
    .replace("{projectId}", scene.p1.projectId)
    .replace(/\{[^}]+\}/g, "11111111-1111-4111-8111-111111111111");

const denied = () => routes().filter((r) => DENIED.includes(r.name));

describe("le client reçoit 403 sur toute autre écriture", () => {
  it("l'ensemble des routes interdites est non vide (la garde ne couvre pas du vide)", () => {
    expect(denied().length).toBe(DENIED.length);
  });

  it.each(DENIED)("%s : 403 FORBIDDEN pour un client lié à son projet", async (name) => {
    const route = denied().find((r) => r.name === name);
    expect(route, `${name} absent du contrat`).toBeDefined();
    const method = (route?.method ?? "GET").toLowerCase() as HttpMethod;

    const res = await send(
      bench().app,
      scene.c1.cookie,
      method,
      fill(route?.path ?? ""),
      method === "get" || method === "delete" ? undefined : {},
    );

    expect(res.status, `${name} : ${res.text}`).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it.each(DENIED)(
    "%s : 403 aussi pour un client sans lien (le rôle est refusé avant le projet)",
    async (name) => {
      const route = denied().find((r) => r.name === name);
      const method = (route?.method ?? "GET").toLowerCase() as HttpMethod;

      const res = await send(
        bench().app,
        scene.c3.cookie,
        method,
        fill(route?.path ?? ""),
        method === "get" || method === "delete" ? undefined : {},
      );

      expect(res.status, `${name} : ${res.text}`).toBe(403);
    },
  );
});

describe("les seules écritures du client : suggérer, retirer, valider, commenter", () => {
  it("suggestion.create et suggestion.withdraw : 200", async () => {
    const api = suggestionApi(bench().app, scene.c1);
    const created = await api.create(scene.p1.projectId);
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect((await api.withdraw(scene.p1.projectId, created.body.id)).status).toBe(200);
  });

  it("review.submit : 200", async () => {
    const res = await reviewApi(bench().app, scene.c1).submit(scene.p1.projectId, scene.headP1);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("comment.create : 200 sur un ticket de son projet", async () => {
    const ticket = await seedTicket(bench().app, scene.p1.world.actors.owner);
    const res = await commentsFor(bench().app, scene.c1).create(ticket.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("et rien d'autre ne passe : suggestion.accept sur sa propre suggestion reste 403", async () => {
    const api = suggestionApi(bench().app, scene.c1);
    const created = await api.create(scene.p1.projectId);
    expect((await api.accept(scene.p1.projectId, created.body.id)).status).toBe(403);
  });
});
