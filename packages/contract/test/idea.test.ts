import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID, UUID2 } from "./support.ts";

/**
 * TK-89 lot A (contrat 2.4.0 puis 2.5.0, additif) : groupe `idea` (list, get, save, setStatus, publish, presence)
 * et sous-groupe `idea.page` (create, rename, reorder, delete, restore). `CONFLICT` de `save` porte
 * `data.currentVersion`. Aucune sortie ne porte d'identifiant d'utilisateur ni d'e-mail.
 */
const TOP = [
  "agent",
  "freeze",
  "get",
  "list",
  "message",
  "page",
  "presence",
  "proposal",
  "publish",
  "save",
  "setStatus",
  "synthesis",
];
const PAGE = ["create", "delete", "rename", "reorder", "restore"];
const BASE = "/projects/{projectId}/idea";
const ROUTES = [
  ["idea.list", "get", `${BASE}/pages`],
  ["idea.get", "get", `${BASE}/pages/{pageId}`],
  ["idea.save", "put", `${BASE}/pages/{pageId}/content`],
  ["idea.setStatus", "post", `${BASE}/pages/{pageId}/status`],
  ["idea.publish", "post", `${BASE}/publish`],
  ["idea.presence", "post", `${BASE}/presence`],
  ["idea.page.create", "post", `${BASE}/pages`],
  ["idea.page.rename", "patch", `${BASE}/pages/{pageId}`],
  ["idea.page.reorder", "put", `${BASE}/pages/order`],
  ["idea.page.delete", "delete", `${BASE}/pages/{pageId}`],
  ["idea.page.restore", "post", `${BASE}/pages/{pageId}/restore`],
] as const;

const INSTANT = "2026-11-08T10:00:00.000Z";
const SUMMARY = {
  id: UUID,
  slug: "perimetre",
  title: "Périmètre",
  position: 5,
  required: true,
  origin: "template",
  status: "draft",
  version: 3,
  updatedAt: INSTANT,
  updatedBy: { name: "Awa Koné", isClient: false },
  deletedAt: null,
};
const PAGE_OUT = { ...SUMMARY, contentMd: "## Périmètre\n\ntexte" };

type Operation = { responses: Record<string, unknown> };
type Doc = { info: { version: string }; paths: Record<string, Record<string, Operation>> };
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("idea : surface", () => {
  it("expose le groupe idea et son sous-groupe page, rien d'autre", () => {
    const group = (api.contract as unknown as Record<string, Record<string, object>>).idea;
    expect(Object.keys(group ?? {}).sort()).toEqual(TOP);
    expect(Object.keys(group?.page ?? {}).sort()).toEqual(PAGE);
  });

  it.each(ROUTES)("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    expect(proc(name)).toBeDefined();
    expect((await doc()).paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("le contrat courant est 3.3.0 (rupture : version majeure)", async () => {
    expect(api.CONTRACT_VERSION).toBe("3.3.0");
    expect((await doc()).info.version).toBe("3.3.0");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("idea : entrées", () => {
  it("list et get exigent le projet (et la page)", async () => {
    expect(await isValid(input("idea.list"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("idea.list"), {})).toBe(false);
    expect(await isValid(input("idea.get"), { projectId: UUID, pageId: UUID2 })).toBe(true);
    expect(await isValid(input("idea.get"), { projectId: UUID })).toBe(false);
  });

  it("save exige la version de base et borne le contenu à 50 000 caractères", async () => {
    const ok = { projectId: UUID, pageId: UUID2, baseVersion: 3, contentMd: "x" };
    expect(await isValid(input("idea.save"), ok)).toBe(true);
    expect(await isValid(input("idea.save"), { ...ok, contentMd: "" })).toBe(true);
    expect(await isValid(input("idea.save"), { ...ok, baseVersion: undefined })).toBe(false);
    expect(await isValid(input("idea.save"), { ...ok, baseVersion: 0 })).toBe(false);
    expect(await isValid(input("idea.save"), { ...ok, contentMd: "a".repeat(50_000) })).toBe(true);
    expect(await isValid(input("idea.save"), { ...ok, contentMd: "a".repeat(50_001) })).toBe(false);
  });

  it("setStatus n'accepte que brouillon, à relire et stable", async () => {
    const base = { projectId: UUID, pageId: UUID2 };
    for (const status of ["draft", "review", "stable"]) {
      expect(await isValid(input("idea.setStatus"), { ...base, status })).toBe(true);
    }
    expect(await isValid(input("idea.setStatus"), { ...base, status: "empty" })).toBe(false);
    expect(await isValid(input("idea.setStatus"), { ...base, status: "autre" })).toBe(false);
  });

  it("publish exige une clé d'idempotence", async () => {
    expect(await isValid(input("idea.publish"), { projectId: UUID, idempotencyKey: "k-1" })).toBe(
      true,
    );
    expect(await isValid(input("idea.publish"), { projectId: UUID })).toBe(false);
    expect(await isValid(input("idea.publish"), { projectId: UUID, idempotencyKey: "a b" })).toBe(
      false,
    );
  });

  it("presence accepte une page ou aucune", async () => {
    expect(await isValid(input("idea.presence"), { projectId: UUID })).toBe(true);
    expect(await isValid(input("idea.presence"), { projectId: UUID, pageId: UUID2 })).toBe(true);
    expect(await isValid(input("idea.presence"), { projectId: UUID, pageId: null })).toBe(true);
    expect(await isValid(input("idea.presence"), { projectId: UUID, pageId: "x" })).toBe(false);
  });

  it("page.create, rename : titre de 1 à 120 caractères", async () => {
    const base = { projectId: UUID };
    expect(await isValid(input("idea.page.create"), { ...base, title: "Concurrence" })).toBe(true);
    expect(
      await isValid(input("idea.page.create"), { ...base, title: "x", afterPageId: UUID2 }),
    ).toBe(true);
    expect(await isValid(input("idea.page.create"), { ...base, title: "" })).toBe(false);
    expect(await isValid(input("idea.page.create"), { ...base, title: "a".repeat(121) })).toBe(
      false,
    );
    const rename = { ...base, pageId: UUID2 };
    expect(await isValid(input("idea.page.rename"), { ...rename, title: "Nouveau" })).toBe(true);
    expect(await isValid(input("idea.page.rename"), { ...rename, title: " " })).toBe(false);
  });

  it("reorder : liste d'au plus 50 identifiants", async () => {
    const ids = (n: number) => Array.from({ length: n }, () => UUID);
    expect(await isValid(input("idea.page.reorder"), { projectId: UUID, pageIds: ids(50) })).toBe(
      true,
    );
    expect(await isValid(input("idea.page.reorder"), { projectId: UUID, pageIds: ids(51) })).toBe(
      false,
    );
    expect(await isValid(input("idea.page.reorder"), { projectId: UUID, pageIds: ["x"] })).toBe(
      false,
    );
  });

  it("delete et restore exigent la page", async () => {
    for (const name of ["idea.page.delete", "idea.page.restore"]) {
      expect(await isValid(input(name), { projectId: UUID, pageId: UUID2 })).toBe(true);
      expect(await isValid(input(name), { projectId: UUID })).toBe(false);
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("idea : sorties", () => {
  it("list : pages actives, corbeille, total réel, publication ; jamais de contenu", async () => {
    const out = {
      pages: [{ ...SUMMARY, pendingProposals: 0 }],
      trash: [{ ...SUMMARY, deletedAt: INSTANT, required: false }],
      total: 1,
      publication: { available: true, last: { commitSha: "a".repeat(40), publishedAt: INSTANT } },
      pendingPageProposals: [],
      maturity: { stable: 1, total: 1, missingRequired: [], openQuestions: 0 },
      version: { latest: null, modifiedSince: false },
    };
    expect(await isValid(output("idea.list"), out)).toBe(true);
    expect(
      await isValid(output("idea.list"), { ...out, publication: { available: false, last: null } }),
    ).toBe(true);
    expect(await isValid(output("idea.list"), { ...out, total: undefined })).toBe(false);
    const parsedPages = (await output("idea.list")?.["~standard"].validate(out)) as {
      value: { pages: Record<string, unknown>[] };
    };
    expect(Object.keys(parsedPages.value.pages[0] ?? {})).not.toContain("contentMd");
  });

  it("save, setStatus, create, rename, restore rendent la page complète (get y ajoute ses propositions)", async () => {
    for (const name of [
      "idea.save",
      "idea.setStatus",
      "idea.page.create",
      "idea.page.rename",
      "idea.page.restore",
    ]) {
      expect(await isValid(output(name), PAGE_OUT), name).toBe(true);
      expect(await isValid(output(name), { ...PAGE_OUT, contentMd: undefined }), name).toBe(false);
    }
  });

  it("l'auteur d'une modification n'est jamais un identifiant ni un e-mail", async () => {
    const parsed = (await output("idea.get")?.["~standard"].validate({
      ...PAGE_OUT,
      proposals: [],
      updatedBy: { name: "Awa", isClient: false, userId: UUID, email: "a@b.fr" },
    })) as { value: { updatedBy: Record<string, unknown> } };
    expect(Object.keys(parsed.value.updatedBy).sort()).toEqual(["isClient", "name"]);
  });

  it("delete rend le résumé ; reorder rend les pages ; publish rend le lot ; presence les présents", async () => {
    expect(await isValid(output("idea.page.delete"), { ...SUMMARY, deletedAt: INSTANT })).toBe(
      true,
    );
    expect(await isValid(output("idea.page.reorder"), { pages: [SUMMARY] })).toBe(true);
    expect(await isValid(output("idea.publish"), { batchId: UUID })).toBe(true);
    const present = {
      present: [
        { initials: "ML", name: "Marie Lefèvre", isClient: true, pageId: UUID, mine: false },
      ],
    };
    expect(await isValid(output("idea.presence"), present)).toBe(true);
    const leaked = (await output("idea.presence")?.["~standard"].validate({
      present: [{ ...present.present[0], userId: UUID, email: "m@l.fr" }],
    })) as { value: { present: Record<string, unknown>[] } };
    expect(Object.keys(leaked.value.present[0] ?? {}).sort()).toEqual([
      "initials",
      "isClient",
      "mine",
      "name",
      "pageId",
    ]);
  });
});

describe("idea : erreurs", () => {
  it("save : CONFLICT 409 porte currentVersion, VALIDATION 422, NOT_FOUND, FORBIDDEN", async () => {
    const map = errors("idea.save");
    expect(map.CONFLICT?.status).toBe(409);
    const data = map.CONFLICT?.data;
    expect(await isValid(data, { currentVersion: 4 })).toBe(true);
    expect(await isValid(data, { reason: "slug_taken" })).toBe(false);
    for (const code of ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "INTERNAL"]) {
      expect(map[code], code).toBeDefined();
    }
  });

  it("page.delete : FORBIDDEN motivé par required_page", async () => {
    const data = errors("idea.page.delete").FORBIDDEN?.data;
    expect(await isValid(data, { reason: "required_page" })).toBe(true);
    expect(await isValid(data, { reason: "autre" })).toBe(false);
  });

  it("les lectures n'exposent ni FORBIDDEN ni CONFLICT", () => {
    for (const name of ["idea.list", "idea.get"]) {
      expect(errors(name).FORBIDDEN, name).toBeUndefined();
      expect(errors(name).CONFLICT, name).toBeUndefined();
      expect(errors(name).NOT_FOUND, name).toBeDefined();
    }
  });

  it("publish : fournisseur indisponible et clé d'idempotence réutilisée", () => {
    const map = errors("idea.publish");
    expect(map.PROVIDER_UNAVAILABLE).toBeDefined();
    expect(map.SPEC_BATCH_CONFLICT).toBeDefined();
  });
});
