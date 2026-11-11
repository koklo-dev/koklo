import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, INSTANT, input, isValid, output, UUID } from "./support.ts";

/**
 * TK-92 lot A (contrat 2.7.0, additif) : `project.overview` et `project.activity`. Tout texte est
 * construit côté serveur ; le contenu dépend de `audience`, jamais d'un champ d'entrée.
 */
type Doc = {
  info: { version: string };
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

const ITEM = {
  key: "functional",
  status: "pending",
  content: "7 fonctionnalités",
  done: 4,
  total: 7,
  progressLabel: "4 fonctionnalités validées sur 7",
  validator: "client",
  validatorLabel: "Validation client · obligatoire",
  available: true,
  href: `/projects/${UUID}/spec/functional`,
};
const OVERVIEW = {
  project: { id: UUID, name: "Koklo", startedAt: INSTANT, clientContact: "Marie Lefèvre" },
  audience: "team",
  phase: "framing",
  phaseSteps: [
    { key: "idea", status: "done", subtitle: "Dossier stable" },
    { key: "framing", status: "current", subtitle: "0 livrable validé sur 7" },
    { key: "baseline", status: "todo", subtitle: "Posée à la validation du client" },
    { key: "iterations", status: "todo", subtitle: "Sprints et demandes de changement" },
  ],
  primaryAction: { label: "Continuer le cadrage", href: `/projects/${UUID}/spec/functional` },
  canInvite: true,
  nextAction: {
    rule: "validation_overdue",
    tone: "warning",
    title: "Le cahier fonctionnel attend la validation de Marie",
    body: "2 fonctionnalités en attente.",
    action: {
      label: "Relancer Marie",
      href: `/projects/${UUID}/spec/functional`,
      kind: "copy_link",
    },
  },
  stats: [
    {
      key: "deliverables",
      icon: "inventory_2",
      label: "Livrables validés",
      value: "0 sur 7",
      gauge: { done: 0, total: 7 },
      note: "Aucun livrable validé",
    },
  ],
  main: { kind: "deliverables", items: [ITEM] },
  activity: {
    items: [
      {
        actor: { kind: "client", name: "Marie Lefèvre", initials: "ML" },
        text: "Marie Lefèvre a validé F-001",
        at: INSTANT,
      },
    ],
    total: 1,
  },
  people: {
    items: [{ name: "Awa", initials: "A", role: "Propriétaire", kind: "team" }],
    others: 0,
  },
};

describe("OV1 project.overview : entrée, sortie, erreurs", () => {
  it("entrée : projectId UUID seul", async () => {
    expect(await isValid(input("project.overview"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("project.overview"), { projectId: "x" })).toBe(false);
    expect(await isValid(input("project.overview"), {})).toBe(false);
  });

  it("sortie : forme complète, champs optionnels absents acceptés", async () => {
    const out = output("project.overview");
    expect(await isValid(out, OVERVIEW)).toBe(true);
    const { primaryAction, nextAction, ...bare } = OVERVIEW;
    expect(await isValid(out, bare)).toBe(true);
    expect(primaryAction && nextAction).toBeTruthy();
  });

  it("sortie : phase sans `baseline`, audience fermée, statut de livrable fermé", async () => {
    const out = output("project.overview");
    expect(await isValid(out, { ...OVERVIEW, phase: "baseline" })).toBe(false);
    expect(await isValid(out, { ...OVERVIEW, audience: "business" })).toBe(false);
    const bad = { kind: "deliverables", items: [{ ...ITEM, status: "in_progress" }] };
    expect(await isValid(out, { ...OVERVIEW, main: bad })).toBe(false);
  });

  it("sortie : les trois formes du bloc principal (idée, livrables, sprint)", async () => {
    const out = output("project.overview");
    const idea = {
      kind: "idea",
      pages: [{ position: 0, title: "Vision", note: "x", status: "stable" }],
    };
    const sprint = {
      kind: "sprint",
      tickets: [{ key: "TK-1", title: "t", note: "n", status: "done" }],
    };
    expect(await isValid(out, { ...OVERVIEW, main: idea })).toBe(true);
    expect(await isValid(out, { ...OVERVIEW, main: sprint })).toBe(true);
    expect(await isValid(out, { ...OVERVIEW, main: { kind: "kanban" } })).toBe(false);
  });

  it("sortie : l'action de la prochaine étape est un lien ou une copie de lien", async () => {
    const out = output("project.overview");
    const withKind = (kind: string) => ({
      ...OVERVIEW,
      nextAction: { ...OVERVIEW.nextAction, action: { label: "x", href: "/x", kind } },
    });
    expect(await isValid(out, withKind("link"))).toBe(true);
    expect(await isValid(out, withKind("mailto"))).toBe(false);
  });

  it("erreurs : 401, 404 et 500 ; jamais 403 (tout rôle ayant accès au projet)", () => {
    expect(Object.keys(errors("project.overview")).sort()).toEqual([
      "INTERNAL",
      "NOT_FOUND",
      "UNAUTHORIZED",
    ]);
  });
});

describe("OV2 project.activity : liste à curseur", () => {
  it("entrée : projectId, curseur et limite (≤ 100) ; pas de filtre libre", async () => {
    const schema = input("project.activity");
    expect(await isValid(schema, { projectId: UUID })).toBe(true);
    expect(await isValid(schema, { projectId: UUID, cursor: "abc", limit: "50" })).toBe(true);
    expect(await isValid(schema, { projectId: UUID, limit: "101" })).toBe(false);
    expect(await isValid(schema, {})).toBe(false);
  });

  it("sortie : page de la liste 1.1 dont les éléments sont des événements lisibles", async () => {
    const item = OVERVIEW.activity.items[0];
    const page = { items: [item], nextCursor: null, previousCursor: null, offset: 0, total: 1 };
    expect(await isValid(output("project.activity"), page)).toBe(true);
    const bad = { ...page, items: [{ ...item, actor: { ...item?.actor, kind: "system" } }] };
    expect(await isValid(output("project.activity"), bad)).toBe(false);
  });

  it("erreurs : 401, 404, 500 et VALIDATION (curseur mal formé)", () => {
    expect(Object.keys(errors("project.activity")).sort()).toEqual([
      "INTERNAL",
      "NOT_FOUND",
      "UNAUTHORIZED",
      "VALIDATION",
    ]);
  });
});

describe("OV3 version et surface 2.7.0", () => {
  it("le contrat courant est 2.9.0 (additif : version mineure), égal à package.json", async () => {
    expect(api.CONTRACT_VERSION).toBe("2.9.0");
    expect((await doc()).info.version).toBe("2.9.0");
  });

  it("l'OpenAPI expose GET /projects/{projectId}/overview et /activity", async () => {
    const { paths } = await doc();
    expect(Object.keys(paths["/projects/{projectId}/overview"] ?? {})).toEqual(["get"]);
    expect(Object.keys(paths["/projects/{projectId}/activity"] ?? {})).toEqual(["get"]);
  });
});
