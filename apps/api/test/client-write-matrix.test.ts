import { contract } from "@koklo/contract";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commentsFor } from "./helpers/comments.ts";
import { insertActor } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, type ReviewScene, reviewApi } from "./helpers/reviews.ts";
import { shellApi } from "./helpers/shell.ts";
import { suggestionApi } from "./helpers/suggestions.ts";
import { type HttpMethod, seedTicket, send } from "./helpers/tickets.ts";

/**
 * TK-55 (critère unique) : « un client ne peut pas éditer, seulement suggérer et valider ». Les écritures
 * sont ÉNUMÉRÉES DEPUIS LE CONTRAT COMPLET (toute procédure dont la méthode OpenAPI n'est pas GET) et
 * classées : une route d'écriture ajoutée sans classement fait échouer le test. Le client lié ne peut
 * que suggérer (create, withdraw), valider (review.submit) et commenter ; tout le reste est 403.
 */
const ALLOWED = [
  // TK-90 (contrat 2.5.0) : le client dialogue avec l'agent et décide de ses propositions (mêmes droits que l'éditeur).
  "ai.ideaChat",
  "ai.ideaGaps",
  "comment.create",
  // TK-89 (contrat 2.4.0) : le client rédige le dossier d'idée sans le publier (décision 1).
  "idea.page.create",
  "idea.page.delete",
  "idea.page.rename",
  "idea.page.reorder",
  "idea.page.restore",
  "idea.presence",
  "idea.proposal.decide",
  "idea.proposal.undo",
  "idea.save",
  "idea.setStatus",
  // TK-97 : préférences personnelles (nom, e-mails), ouvertes à toute session, client compris.
  "me.update",
  "me.updateNotification",
  // TK-88 : préférence personnelle (dernier projet ouvert), tout rôle ayant accès au projet.
  "project.visit",
  "review.submit",
  "suggestion.create",
  "suggestion.withdraw",
];
/** Suppression de SON propre commentaire : droit d'auteur vérifié dans le service (comment-permissions). */
const OWN_ONLY = ["comment.delete"];
const DENIED = [
  // TK-101 (contrat 2.11.0) : le préremplissage du panneau d'édition relève de l'équipe (SPEC_BATCH_ROLES).
  "ai.prefillItem",
  "ai.proposeCriteria",
  // TK-99a (contrat 2.9.0) : lancer, réviser et décider les propositions de l'agent relèvent de l'équipe.
  "ai.proposeDeliverable",
  "ai.proposeFeatures",
  "ai.reviseProposal",
  // TK-98 (contrat 2.3.0) : fournisseurs d'IA, réglages et plafond, owner et admin seulement.
  "aiProvider.add",
  "aiProvider.remove",
  "aiProvider.replaceKey",
  "aiProvider.setPrimary",
  "aiProvider.verify",
  "aiSettings.update",
  "aiUsage.set",
  "dependency.add",
  "dependency.remove",
  // TK-89 : la publication du dossier d'idée relève de l'équipe (SPEC_BATCH_ROLES).
  // TK-91 (contrat 2.6.0) : le passage au cadrage et la Synthèse de l'idée aussi.
  "ai.ideaSynthesis",
  "idea.freeze",
  "idea.publish",
  "installation.start",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "llmCredential.invalidate",
  "llmCredential.remove",
  "llmCredential.set",
  "llmCredential.verify",
  "invitation.create",
  "invitation.resend",
  "invitation.revoke",
  "member.invite",
  "member.remove",
  "member.setRole",
  "member.updateRole",
  "org.update",
  // TK-55 (décision du 2026-11-06) : un compte qui n'est que client ne crée pas d'organisation.
  "organization.create",
  "proposal.decide",
  "proposal.decideMany",
  "project.create",
  "project.retryRepo",
  "project.setEuOnly",
  "projectClient.add",
  "projectClient.remove",
  "projectState.update",
  "repo.createSpec",
  "repo.link",
  // TK-104 (contrat 3.2.0) : relancer le client relève d'owner et d'admin (B352).
  "review.remind",
  // TK-100 (contrat 2.10.0) : forcer l'ouverture d'un livrable relève d'owner et d'admin.
  "spec.forceDeliverable",
  "specBatch.submit",
  // TK-106 (contrat 3.4.0) : la migration du format de spec et son retour arrière relèvent d'owner seul.
  "specMigration.revert",
  "specMigration.start",
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

/** Toutes les procédures du contrat (groupes, sous-groupes comme `idea.page`, procédures isolées) avec méthode et chemin OpenAPI. */
function routes(): Route[] {
  const visit = (name: string, node: object): Route[] => {
    if (!("~orpc" in node)) {
      return Object.entries(node).flatMap(([child, value]) => visit(`${name}.${child}`, value));
    }
    const meta = (node as Procedure)["~orpc"].meta["~openapi"];
    return [{ name, method: meta?.method ?? "", path: meta?.path ?? "" }];
  };
  return Object.entries(contract as unknown as Record<string, object>).flatMap(([group, node]) =>
    "~orpc" in node
      ? visit(group, node)
      : Object.entries(node).flatMap(([child, value]) => visit(`${group}.${child}`, value)),
  );
}
const classifiedNames = () => [...ALLOWED, ...OWN_ONLY, ...DENIED];
const writes = () => routes().filter((r) => r.method !== "GET");

describe("classement exhaustif des écritures du contrat", () => {
  it("toute écriture du contrat est classée : autorisée, propre à l'auteur ou interdite", () => {
    const classified = [...ALLOWED, ...OWN_ONLY, ...DENIED].sort();
    expect(
      writes()
        .map((r) => r.name)
        .sort(),
    ).toEqual(classified);
  });

  it("review.list est une lecture (GET), ouverte au client pour ses seules cibles et sans SHA (TK-100, B325 e) : hors de ce classement d'écritures", () => {
    expect(routes().find((r) => r.name === "review.list")?.method).toBe("GET");
    expect(classifiedNames()).not.toContain("review.list");
  });

  it("les écritures autorisées au client sont exactement suggérer, retirer, valider, commenter, rédiger le dossier d'idée et dialoguer avec son agent, mémoriser son dernier projet et régler son compte", () => {
    expect(ALLOWED).toEqual([
      "ai.ideaChat",
      "ai.ideaGaps",
      "comment.create",
      "idea.page.create",
      "idea.page.delete",
      "idea.page.rename",
      "idea.page.reorder",
      "idea.page.restore",
      "idea.presence",
      "idea.proposal.decide",
      "idea.proposal.undo",
      "idea.save",
      "idea.setStatus",
      "me.update",
      "me.updateNotification",
      "project.visit",
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

describe("TK-96 : le rôle insuffisant reste 403 quel que soit le projet désigné (aucun oracle)", () => {
  const PROJECTS = ["lié", "inconnu", "étranger"] as const;
  const projectFor = (kind: (typeof PROJECTS)[number]) =>
    kind === "lié"
      ? scene.p1.projectId
      : kind === "inconnu"
        ? "99999999-9999-4999-8999-999999999999"
        : scene.p2.projectId;

  it.each(DENIED.flatMap((name) => PROJECTS.map((kind) => [name, kind] as const)))(
    "%s : 403 pour un client, projet %s",
    async (name, kind) => {
      const route = denied().find((r) => r.name === name);
      const method = (route?.method ?? "GET").toLowerCase() as HttpMethod;
      const path = (route?.path ?? "")
        .replace("{projectId}", projectFor(kind))
        .replace(/\{[^}]+\}/g, "11111111-1111-4111-8111-111111111111");

      const res = await send(
        bench().app,
        scene.c1.cookie,
        method,
        path,
        method === "get" || method === "delete" ? undefined : {},
      );

      expect(res.status, `${name} (${kind}) : ${res.text}`).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    },
  );

  it("les procédures de pilotage interdites figurent bien dans la liste (garde contre le vide)", () => {
    const pilotage = ["ticket.", "dependency.", "sprint.", "lease.", "projectState."];
    const covered = DENIED.filter((name) => pilotage.some((prefix) => name.startsWith(prefix)));
    expect(covered.length).toBeGreaterThanOrEqual(14);
    for (const name of covered) {
      expect(denied().find((r) => r.name === name)?.path, name).toContain("/projects/{projectId}/");
    }
  });
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

  it("project.visit : 200 sur son projet, 404 sur un projet non lié (rien n'est écrit)", async () => {
    const api = shellApi(bench().app, scene.c1);
    const own = await api.visit(scene.p1.projectId);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect((await api.visit(scene.p2.projectId)).status).toBe(404);
    const rows = await bench().database.query(
      "SELECT project_id FROM project_visits WHERE user_id = $1",
      [scene.c1.userId],
    );
    expect(rows).toEqual([{ project_id: scene.p1.projectId }]);
  });

  it("me.update et me.updateNotification : 200 pour un client (préférence personnelle)", async () => {
    const body = { name: "Client Renommé" };
    const name = await send(bench().app, scene.c1.cookie, "patch", "/me", body);
    expect(name.status, JSON.stringify(name.body)).toBe(200);
    const pref = await send(
      bench().app,
      scene.c1.cookie,
      "put",
      "/me/notifications/comment_reply",
      { enabled: false },
    );
    expect(pref.status, JSON.stringify(pref.body)).toBe(200);
  });

  it("comment.create : 200 sur un ticket de son projet", async () => {
    const ticket = await seedTicket(bench().app, scene.p1.world.actors.owner, scene.p1.projectId);
    const res = await commentsFor(bench().app, scene.c1, scene.p1.projectId).create(ticket.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("et rien d'autre ne passe : suggestion.accept sur sa propre suggestion reste 403", async () => {
    const api = suggestionApi(bench().app, scene.c1);
    const created = await api.create(scene.p1.projectId);
    expect((await api.accept(scene.p1.projectId, created.body.id)).status).toBe(403);
  });
});

describe("TK-90 : l'agent de l'espace Idée suit les droits de l'éditeur (le business lit seulement)", () => {
  const AGENT_WRITES = ["ai.ideaChat", "ai.ideaGaps", "idea.proposal.decide", "idea.proposal.undo"];

  it("ces quatre procédures sont des écritures du contrat, autorisées au client", () => {
    const names = writes().map((r) => r.name);
    for (const name of AGENT_WRITES) {
      expect(names).toContain(name);
      expect(ALLOWED).toContain(name);
    }
  });

  it.each(AGENT_WRITES)(
    "%s : 403 FORBIDDEN pour le business, quel que soit le projet",
    async (name) => {
      const route = routes().find((r) => r.name === name);
      const business = await insertActor(bench().database, scene.p1.organizationId, "business");
      for (const projectId of [scene.p1.projectId, scene.p2.projectId]) {
        const path = (route?.path ?? "")
          .replace("{projectId}", projectId)
          .replace(/\{[^}]+\}/g, "11111111-1111-4111-8111-111111111111");
        const res = await send(bench().app, business.cookie, "post", path, {});
        expect(res.status, `${name} : ${res.text}`).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
    },
  );
});

describe("TK-91 : le passage au cadrage et la Synthèse relèvent de l'équipe (SPEC_BATCH_ROLES)", () => {
  const TEAM_WRITES = ["idea.freeze", "ai.ideaSynthesis"];

  it("ce sont des écritures du contrat, classées interdites au client", () => {
    const names = writes().map((r) => r.name);
    for (const name of TEAM_WRITES) {
      expect(names).toContain(name);
      expect(DENIED).toContain(name);
      expect(ALLOWED).not.toContain(name);
    }
  });

  it.each(TEAM_WRITES)(
    "%s : 403 FORBIDDEN pour le client lié et pour le business",
    async (name) => {
      const route = routes().find((r) => r.name === name);
      const business = await insertActor(bench().database, scene.p1.organizationId, "business");
      for (const actor of [scene.c1, business]) {
        const path = (route?.path ?? "").replace("{projectId}", scene.p1.projectId);
        const res = await send(bench().app, actor.cookie, "post", path, {
          projectId: scene.p1.projectId,
          idempotencyKey: "forge-1",
        });
        expect(res.status, `${name} : ${res.text}`).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
    },
  );

  it.each(TEAM_WRITES)("%s : un client d'un autre projet ne passe pas non plus", async (name) => {
    const route = routes().find((r) => r.name === name);
    const path = (route?.path ?? "").replace("{projectId}", scene.p2.projectId);
    const res = await send(bench().app, scene.c1.cookie, "post", path, {
      projectId: scene.p2.projectId,
      idempotencyKey: "forge-2",
    });
    expect([403, 404]).toContain(res.status);
  });
});

describe("TK-99a : les propositions de l'agent relèvent de l'équipe (SPEC_BATCH_ROLES), client et business : 403 partout", () => {
  const AGENT_ROUTES = [
    "ai.proposeDeliverable",
    "ai.proposeOptions",
    "ai.reviseProposal",
    "proposal.list",
    "proposal.decide",
    "proposal.decideMany",
  ];
  const AGENT_WRITES = AGENT_ROUTES.filter(
    (name) => !["ai.proposeOptions", "proposal.list"].includes(name),
  );

  it("les six routes existent ; les quatre écritures sont classées interdites au client, les deux lectures sont des GET", () => {
    const all = routes();
    for (const name of AGENT_ROUTES)
      expect(
        all.map((r) => r.name),
        name,
      ).toContain(name);
    for (const name of AGENT_WRITES) {
      expect(writes().map((r) => r.name)).toContain(name);
      expect(DENIED).toContain(name);
      expect(ALLOWED).not.toContain(name);
    }
    for (const name of ["ai.proposeOptions", "proposal.list"]) {
      expect(all.find((r) => r.name === name)?.method).toBe("GET");
    }
  });

  it.each(AGENT_ROUTES)(
    "%s : 403 FORBIDDEN pour le client lié et pour le business",
    async (name) => {
      const route = routes().find((r) => r.name === name);
      const business = await insertActor(bench().database, scene.p1.organizationId, "business");
      const method = (route?.method ?? "GET").toLowerCase() as HttpMethod;
      for (const actor of [scene.c1, business]) {
        const path = fill(route?.path ?? "");
        const res = await send(
          bench().app,
          actor.cookie,
          method,
          method === "get" ? `${path}?deliverable=functional&groupBy=type` : path,
          method === "get" ? undefined : {},
        );
        expect(res.status, `${name} : ${res.text}`).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      }
    },
  );
});

describe("TK-100 : forcer un livrable est interdit au client, lire les livrables ne l'est pas", () => {
  it("spec.forceDeliverable est une écriture classée interdite ; spec.deliverables est un GET", () => {
    expect(writes().map((r) => r.name)).toContain("spec.forceDeliverable");
    expect(DENIED).toContain("spec.forceDeliverable");
    expect(ALLOWED).not.toContain("spec.forceDeliverable");
    expect(routes().find((r) => r.name === "spec.deliverables")?.method).toBe("GET");
  });

  it("le client lié lit spec.deliverables (200) mais reçoit 403 sur le forçage, aucune ligne écrite", async () => {
    const { projectId } = scene.p1;
    const read = await send(
      bench().app,
      scene.c1.cookie,
      "get",
      `/projects/${projectId}/spec/deliverables`,
    );
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const res = await send(
      bench().app,
      scene.c1.cookie,
      "post",
      `/projects/${projectId}/spec/deliverables/data/force`,
      { projectId, key: "data", confirm: true },
    );
    expect(res.status, res.text).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    const rows = await bench().database.query("SELECT 1 FROM deliverable_overrides");
    expect(rows).toEqual([]);
  });
});
