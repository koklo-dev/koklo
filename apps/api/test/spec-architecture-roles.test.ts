import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  BRANCH,
  batch,
  batchApi,
  batchRows,
  fileOf,
  installSpecBench,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-111 lot B (cas 6, B510, passation 10 §7) : droits de la page Architecture. Lectures `spec.architecture.*` et
 * `spec.item.get` de type composant : owner, admin, développeur et designer ; client et business 403 (donc ni YAML ni Mermaid
 * ne leur sont jamais renvoyés). Écritures `component.*`, `archflow.*`, `adr.*`, `doc.section.*` de `specBatch.submit` : owner,
 * admin et développeur ; le designer lit mais reçoit FORBIDDEN (rien n'est commité) ; client et business 403.
 */
const read = installBench({ beforeAll, afterAll, beforeEach });
const write = installSpecBench({ beforeAll, afterAll, beforeEach });

const COMPONENT = {
  id: "C-api",
  titre: "API",
  nom: "API",
  type: "service",
  zone: "Noyau",
  responsabilite: "Expose.",
};
const ROUTES = (s: { projectId: string }) => [
  `/projects/${s.projectId}/spec/architecture/components`,
  `/projects/${s.projectId}/spec/architecture/document`,
  `/projects/${s.projectId}/spec/architecture/checks`,
  `/projects/${s.projectId}/spec/items/component/C-api`,
];

describe("lectures de la page Architecture", () => {
  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s lit les composants, le document, les avertissements et la fiche d'un composant",
    async (role) => {
      const s = await readScene(read());
      await seedIndex(read(), s, [], {
        commit: true,
        entities: [entity("component", "C-api", "c", COMPONENT)],
      });
      for (const path of ROUTES(s)) {
        const res = await send(read().app, s.world.actors[role].cookie, "get", path);
        expect(res.status, `${role} ${path} ${JSON.stringify(res.body)}`).toBe(200);
        expect(JSON.stringify(res.body), path).not.toMatch(/mermaid|sequenceDiagram|flowchart/i);
      }
    },
  );

  it.each(["client", "business"] as const)(
    "%s reçoit 403 sur chacune des quatre lectures, sans rien d'indexé divulgué",
    async (role) => {
      const s = await readScene(read());
      await seedIndex(read(), s, [], {
        commit: true,
        entities: [entity("component", "C-api", "c", COMPONENT)],
      });
      for (const path of ROUTES(s)) {
        const res = await send(read().app, s.world.actors[role].cookie, "get", path);
        expect(res.status, `${role} ${path}`).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
        expect(JSON.stringify(res.body)).not.toMatch(/API|Noyau|yaml|mermaid/i);
      }
    },
  );

  it("hors du projet de l'organisation : 404, jamais 403", async () => {
    const s = await readScene(read());
    for (const route of ["components", "document", "checks"]) {
      const res = await send(
        read().app,
        s.world.actors.dev.cookie,
        "get",
        `/projects/123e4567-e89b-42d3-a456-426614174000/spec/architecture/${route}`,
      );
      expect(res.status, route).toBe(404);
    }
  });
});

const component = (name: string, over: Record<string, unknown> = {}) => ({
  kind: "component.create",
  name,
  type: "service",
  zone: "Noyau",
  responsibility: "Fait son travail.",
  serves: ["F-100"],
  ...over,
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("écritures : component.*, adr.*, doc.section.* par specBatch.submit", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s écrit un composant : fichier et schema.mmd dans UN commit, identifiant posé par le serveur",
    async (role) => {
      const b = write();
      const s = await specScene(b);
      const body = await submitOk(b, s, [component("API")], {}, role);
      expect(body.status).toBe("committed");
      expect(body.results).toEqual([{ position: 0, kind: "component.create", specId: "C-api" }]);
      const file = await fileOf(b, s, "architecture/components/api.yaml");
      expect(file.content).toContain("id: C-api");
      const schema = await fileOf(b, s, "architecture/schema.mmd");
      expect(schema.content).toContain("flowchart");
      expect(file.ref).toBe(schema.ref);
      expect(file.ref).toBe(body.commitSha);
    },
  );

  it("décision numérotée par le compteur du projet et section numérotée à la suite, dans un même lot", async () => {
    const b = write();
    const s = await specScene(b);
    const first = await submitOk(b, s, [
      { kind: "adr.create", title: "PostgreSQL", context: "Une base.", decision: "PostgreSQL 17." },
      {
        kind: "adr.create",
        title: "Monolithe",
        context: "Une app.",
        decision: "Un seul déploiement.",
      },
      { kind: "doc.section.create", title: "Déploiement", markdown: "Un environnement." },
    ]);
    expect(first.results.map((r) => r.specId)).toEqual(["ADR-001", "ADR-002", "DOC-deploiement"]);
    expect((await fileOf(b, s, "architecture/adr/ADR-002-monolithe.md")).content).toContain(
      "statut: proposee",
    );
    expect((await fileOf(b, s, "architecture/overview/02-deploiement.md")).content).toContain(
      "statut: brouillon",
    );
    const next = await submitOk(b, s, [
      { kind: "adr.create", title: "Cache", context: "Lent.", decision: "Un cache." },
    ]);
    expect(next.results[0]?.specId).toBe("ADR-003");
  });

  it("flux technique d'un parcours : .yaml et .mmd dans le même commit que le composant et le parcours", async () => {
    const b = write();
    const s = await specScene(b);
    const body = await submitOk(b, s, [
      {
        kind: "flow.create",
        title: "Réserver",
        actor: "Client",
        start: { label: "Ouvrir" },
        steps: [{ label: "Choisir" }],
      },
      component("API"),
      component("Base", { type: "store", serves: [] }),
      {
        kind: "archflow.create",
        flow: "P-reserver",
        participants: ["C-api", "C-base"],
        messages: [{ from: "C-api", to: "C-base", text: "Lit", reply: "Données" }],
      },
    ]);
    expect(body.results.map((r) => r.specId)).toEqual([
      "P-reserver",
      "C-api",
      "C-base",
      "P-reserver",
    ]);
    const flow = await fileOf(b, s, "architecture/flows/P-reserver.yaml");
    const mermaid = await fileOf(b, s, "architecture/flows/P-reserver.mmd");
    expect(mermaid.content).toContain("sequenceDiagram");
    expect(flow.ref).toBe(mermaid.ref);
    expect(flow.ref).toBe((await fileOf(b, s, "architecture/schema.mmd")).ref);
  });

  it("référence inconnue : SPEC_INVALID (422), rien n'est écrit", async () => {
    const b = write();
    const s = await specScene(b);
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([component("API", { owns: ["T-absente"] })], { branch: BRANCH }),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPEC_INVALID");
    await expect(fileOf(b, s, "architecture/components/api.yaml")).rejects.toThrow();
  });

  it("le designer reçoit 403 FORBIDDEN : aucun fichier, aucun commit", async () => {
    const b = write();
    const s = await specScene(b);
    for (const operation of [
      component("API"),
      { kind: "adr.create", title: "T", context: "C", decision: "D" },
      { kind: "doc.section.create", title: "T", markdown: "x" },
    ]) {
      const res = await batchApi(b.app, s.world.actors.designer).submit(
        s.projectId,
        batch([operation], { branch: BRANCH }),
      );
      expect(res.status, operation.kind).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    await expect(fileOf(b, s, "architecture/components/api.yaml")).rejects.toThrow();
  });

  it.each(["client", "business"] as const)("%s reçoit 403 : aucun lot enregistré", async (role) => {
    const b = write();
    const s = await specScene(b);
    const res = await batchApi(b.app, s.world.actors[role]).submit(
      s.projectId,
      batch([component("API")], { branch: BRANCH }),
    );
    expect(res.status).toBe(403);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});
