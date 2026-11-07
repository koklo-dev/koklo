import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { input, isValid, proc, UUID } from "./support.ts";

/**
 * TK-96 (contrat 2.0.0) : les 25 procédures de pilotage ne résolvent plus un projet « par défaut »
 * côté serveur. Le projet est une entrée explicite (`projectId`, uuid) et un paramètre de chemin
 * `/projects/{projectId}/...`, comme les autres groupes de projet. Les anciens chemins disparaissent.
 */
type Entry = { name: string; method: string; path: string; old: string; sample: object };

const T = "/projects/{projectId}/tickets";
const S = "/projects/{projectId}/sprints";
const C = "/projects/{projectId}/comments";
const KEY = { key: "TK-1" };
const SPRINT_KEY = { key: "SP-1" };
const NEW_TICKET = {
  title: "T",
  type: "feature",
  priority: "high",
  pkg: "api",
  sensitivity: "safe",
};
const EDGE = { key: "TK-1", dependsOn: "TK-2", type: "blocks" };
const NEW_SPRINT = { goal: "G", startsOn: "2026-11-01", endsOn: "2026-11-14" };
const TARGET = { targetKind: "ticket", targetId: UUID };
const LEASE = { key: "TK-1", branch: "feat/tk-1", worktree: "/work/tk-1" };

const PROCEDURES: Entry[] = [
  { name: "ticket.create", method: "POST", path: T, old: "/tickets", sample: NEW_TICKET },
  { name: "ticket.get", method: "GET", path: `${T}/{key}`, old: "/tickets/{key}", sample: KEY },
  { name: "ticket.list", method: "GET", path: T, old: "/tickets", sample: {} },
  {
    name: "ticket.update",
    method: "PATCH",
    path: `${T}/{key}`,
    old: "/tickets/{key}",
    sample: { ...KEY, title: "N" },
  },
  {
    name: "ticket.delete",
    method: "DELETE",
    path: `${T}/{key}`,
    old: "/tickets/{key}",
    sample: KEY,
  },
  {
    name: "ticket.transition",
    method: "POST",
    path: `${T}/{key}/transition`,
    old: "/tickets/{key}/transition",
    sample: { ...KEY, to: "todo" },
  },
  {
    name: "dependency.add",
    method: "POST",
    path: `${T}/{key}/dependencies`,
    old: "/tickets/{key}/dependencies",
    sample: EDGE,
  },
  {
    name: "dependency.remove",
    method: "DELETE",
    path: `${T}/{key}/dependencies/{dependsOn}`,
    old: "/tickets/{key}/dependencies/{dependsOn}",
    sample: EDGE,
  },
  {
    name: "dependency.list",
    method: "GET",
    path: `${T}/{key}/dependencies`,
    old: "/tickets/{key}/dependencies",
    sample: KEY,
  },
  { name: "sprint.create", method: "POST", path: S, old: "/sprints", sample: NEW_SPRINT },
  {
    name: "sprint.get",
    method: "GET",
    path: `${S}/{key}`,
    old: "/sprints/{key}",
    sample: SPRINT_KEY,
  },
  { name: "sprint.list", method: "GET", path: S, old: "/sprints", sample: {} },
  {
    name: "sprint.update",
    method: "PATCH",
    path: `${S}/{key}`,
    old: "/sprints/{key}",
    sample: { ...SPRINT_KEY, goal: "G2" },
  },
  {
    name: "sprint.activate",
    method: "POST",
    path: `${S}/{key}/activate`,
    old: "/sprints/{key}/activate",
    sample: SPRINT_KEY,
  },
  {
    name: "sprint.close",
    method: "POST",
    path: `${S}/{key}/close`,
    old: "/sprints/{key}/close",
    sample: SPRINT_KEY,
  },
  {
    name: "comment.create",
    method: "POST",
    path: C,
    old: "/comments",
    sample: { ...TARGET, body: "Bonjour" },
  },
  { name: "comment.list", method: "GET", path: C, old: "/comments", sample: TARGET },
  {
    name: "comment.delete",
    method: "DELETE",
    path: `${C}/{id}`,
    old: "/comments/{id}",
    sample: { id: UUID },
  },
  {
    name: "projectState.get",
    method: "GET",
    path: "/projects/{projectId}/project-state",
    old: "/project-state",
    sample: {},
  },
  {
    name: "projectState.update",
    method: "PUT",
    path: "/projects/{projectId}/project-state",
    old: "/project-state",
    sample: { expectedVersion: 1, content: {} },
  },
  {
    name: "lease.acquire",
    method: "POST",
    path: `${T}/{key}/lease`,
    old: "/tickets/{key}/lease",
    sample: LEASE,
  },
  {
    name: "lease.heartbeat",
    method: "POST",
    path: `${T}/{key}/lease/heartbeat`,
    old: "/tickets/{key}/lease/heartbeat",
    sample: KEY,
  },
  {
    name: "lease.release",
    method: "DELETE",
    path: `${T}/{key}/lease`,
    old: "/tickets/{key}/lease",
    sample: KEY,
  },
  {
    name: "lease.get",
    method: "GET",
    path: `${T}/{key}/lease`,
    old: "/tickets/{key}/lease",
    sample: KEY,
  },
  {
    name: "audit.list",
    method: "GET",
    path: "/projects/{projectId}/audit",
    old: "/audit",
    sample: {},
  },
];

type Doc = {
  paths: Record<
    string,
    Record<string, { parameters?: { name: string; in: string; required?: boolean }[] }>
  >;
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("PS0 liste des 25 procédures", () => {
  it("couvre exactement les groupes ticket, dependency, sprint, comment, projectState, lease, audit", () => {
    expect(PROCEDURES).toHaveLength(25);
    const groups = new Set(PROCEDURES.map((p) => p.name.split(".")[0]));
    expect([...groups].sort()).toEqual(
      ["audit", "comment", "dependency", "lease", "projectState", "sprint", "ticket"].sort(),
    );
  });
});

describe.each(PROCEDURES)("PS1 $name", ({ name, method, path, old, sample }) => {
  it("existe et est exposée sur /projects/{projectId}/... (méthode inchangée)", async () => {
    expect(proc(name)).toBeDefined();
    const operation = (await doc()).paths[path]?.[method.toLowerCase()];
    expect(operation, `${method} ${path}`).toBeDefined();
  });

  it("déclare projectId comme paramètre de chemin obligatoire", async () => {
    const operation = (await doc()).paths[path]?.[method.toLowerCase()];
    const parameter = operation?.parameters?.find((p) => p.name === "projectId");
    expect(parameter?.in).toBe("path");
    expect(parameter?.required).toBe(true);
  });

  it("n'expose plus l'ancien chemin sans projet", async () => {
    expect((await doc()).paths[old]?.[method.toLowerCase()]).toBeUndefined();
  });

  it("accepte l'entrée avec un projectId uuid", async () => {
    expect(await isValid(input(name), { projectId: UUID, ...sample })).toBe(true);
  });

  it("rejette l'entrée sans projectId", async () => {
    expect(await isValid(input(name), sample)).toBe(false);
  });

  it.each([
    ["non uuid", "projet-1"],
    ["vide", ""],
    ["numérique", 12],
    ["null", null],
  ])("rejette un projectId %s (VALIDATION)", async (_label, projectId) => {
    expect(await isValid(input(name), { projectId, ...sample })).toBe(false);
  });
});

describe("PS2 aucun chemin de pilotage sans projet ne subsiste", () => {
  it("aucun chemin racine /tickets, /sprints, /comments, /audit, /project-state", async () => {
    const paths = Object.keys((await doc()).paths);
    const legacy = paths.filter((p) =>
      /^\/(tickets|sprints|comments|audit|project-state)(\/|$)/.test(p),
    );
    expect(legacy).toEqual([]);
  });
});
