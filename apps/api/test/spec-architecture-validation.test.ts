import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  reviewRows,
} from "./helpers/reviews.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { type EntitySeed, entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-113 lot A (cas 4, 5, 6 ; B575 à B592) : validation du livrable Architecture par l'équipe (owner, admin, développeur ;
 * designer, client et business 403), statut recalculé sur les composants, flux et décisions, impact amont des fonctionnalités,
 * règles et tables citées (À revoir, `staleUpstream`, `staleComponents`, `staleFlows`).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
type Entry = {
  key: string;
  status: string;
  available: boolean;
  staleUpstream?: string[];
  staleComponents?: string[];
  staleFlows?: string[];
};
type Role = "owner" | "admin" | "dev" | "designer" | "business" | "client";

const TABLE = { nom: "Utilisateur", source: ["F-002", "R-004"], champs: [] };
const COMPONENT = {
  id: "C-api",
  titre: "API",
  nom: "API",
  type: "service",
  zone: "Noyau",
  responsabilite: "Expose.",
  sert: ["F-002"],
  possede: ["T-user"],
};
const FLOW = {
  id: "P-001",
  titre: "P-001",
  participants: [],
  fonctionnalites: [],
  regles: ["R-004"],
};
type Over = Partial<Record<string, string>>;
const extra = (tables: string[], over: Over): EntitySeed[] =>
  tables.map((id) => entity("table", id, over[id] ?? "a", { nom: id, champs: [] }));

/** Index de la tête : Fonctionnel, Données, puis composant, flux et décision ; `over` change le hachage d'un élément. */
const base = (over: Over = {}, tables: string[] = ["T-user"]): EntitySeed[] => [
  ...featureEntities(P1_FEATURES).map((e) =>
    over[e.specId] === undefined ? e : entity("feature", e.specId, over[e.specId]),
  ),
  entity("rule", "R-004", over["R-004"] ?? "a"),
  entity("roles", "roles", "a"),
  entity("flow", "P-001", "a"),
  entity("table", "T-user", over["T-user"] ?? "a", TABLE),
  ...extra(
    tables.filter((id) => id !== "T-user"),
    over,
  ),
  entity("component", "C-api", over["C-api"] ?? "a", COMPONENT),
  entity("archflow", "P-001", over["P-001"] ?? "a", FLOW),
  entity("adr", "ADR-001", over["ADR-001"] ?? "a", {
    id: "ADR-001",
    titre: "Monolithe",
    statut: "acceptee",
  }),
];
const p1 = () => scene.p1.projectId;
const as = (role: Role) => reviewApi(bench().app, scene.p1.world.actors[role]);
const head = async (entities: EntitySeed[]) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities })).sha;
const entries = async () => {
  const res = await deliverablesApi(bench().app, scene.p1.world.actors.owner).list(p1());
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return {
    list: Object.fromEntries((res.body.deliverables as Entry[]).map((e) => [e.key, e])) as Record<
      string,
      Entry
    >,
    validatedCount: res.body.validatedCount as number,
  };
};
const validate = (role: Role, version: string, key = "architecture") =>
  as(role).submit(p1(), version, { targetKind: "deliverable", targetRef: key });
const validatePrerequisites = async (version: string) => {
  const client = reviewApi(bench().app, scene.c1);
  for (const [targetKind, targetRef] of [
    ["feature", "F-001"],
    ["feature", "F-002"],
    ["flow", "P-001"],
    ["rules", "rules"],
    ["roles", "roles"],
    ["deliverable", "functional"],
  ] as const) {
    const res = await client.submit(p1(), version, { targetKind, targetRef });
    expect(res.status, `${targetKind} ${targetRef} : ${JSON.stringify(res.body)}`).toBe(200);
  }
  expect((await validate("owner", version, "data")).status).toBe(200);
};
/** Tête validée : Fonctionnel, Données et Architecture ; rend le SHA de la décision. */
const decided = async (entities: EntitySeed[] = base()) => {
  const version = await head(entities);
  await validatePrerequisites(version);
  expect((await validate("owner", version)).status).toBe(200);
  return version;
};

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

describe("cas 4 : valider l'architecture", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : 200, Architecture validée, validatedCount 3, Technique disponible",
    async (role) => {
      const version = await head(base());
      await validatePrerequisites(version);
      const res = await validate(role, version);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const { list, validatedCount } = await entries();
      expect(list.architecture?.status).toBe("validated");
      expect(validatedCount).toBe(3);
      expect(list.technical?.available).toBe(true);
    },
  );

  it.each(["designer", "client", "business"] as const)(
    "%s : 403, rien d'écrit, Architecture non validée",
    async (role) => {
      const version = await head(base());
      await validatePrerequisites(version);
      const res = await validate(role, version);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect((await entries()).list.architecture?.status).not.toBe("validated");
      const rows = await reviewRows(bench().database, p1());
      expect(rows.filter((r) => r.target_ref === "architecture")).toHaveLength(0);
    },
  );
});

describe("cas 5 : modifier un élément après la validation", () => {
  it.each(["C-api", "P-001", "ADR-001"])(
    "%s modifié : Architecture repasse à valider, la décision précédente reste au journal",
    async (id) => {
      await decided();
      expect((await entries()).list.architecture?.status).toBe("validated");

      await head(base({ [id]: "modifié" }));

      expect((await entries()).list.architecture?.status).toBe("pending");
      const rows = await reviewRows(bench().database, p1());
      expect(rows.filter((r) => r.target_ref === "architecture")).toHaveLength(1);
    },
  );
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("cas 6 : impact amont", () => {
  it("F-002 modifiée (citée par le composant) : À revoir, composant concerné, aucun flux", async () => {
    await decided();
    expect((await entries()).list.architecture?.staleUpstream).toBeUndefined();

    await head(base({ "F-002": "modifiée" }));

    const { list } = await entries();
    expect(list.architecture).toMatchObject({
      status: "revise",
      staleUpstream: ["F-002"],
      staleComponents: ["C-api"],
    });
    expect(list.architecture?.staleFlows).toBeUndefined();
    expect(list.data?.staleUpstream).toEqual(["F-002"]);
  });

  it("R-004 modifiée (citée par le flux) : le flux est concerné", async () => {
    await decided();
    await head(base({ "R-004": "modifiée" }));
    const { list } = await entries();
    expect(list.architecture).toMatchObject({ status: "revise", staleFlows: ["P-001"] });
    expect(list.architecture?.staleUpstream).toContain("R-004");
  });

  it("T-user modifiée (possédée par le composant) : T- dans staleUpstream, composant concerné", async () => {
    await decided();
    await head(base({ "T-user": "modifiée" }));
    expect((await entries()).list.architecture).toMatchObject({
      status: "revise",
      staleUpstream: ["T-user"],
      staleComponents: ["C-api"],
    });
  });

  it("table ajoutée depuis la décision : À revoir, la table est dans staleUpstream", async () => {
    await decided();
    await head(base({}, ["T-user", "T-order"]));
    expect((await entries()).list.architecture).toMatchObject({
      status: "revise",
      staleUpstream: ["T-order"],
    });
  });

  it("table retirée depuis la décision : À revoir", async () => {
    await decided(base({}, ["T-user", "T-old"]));
    await head(base({}, ["T-user"]));
    expect((await entries()).list.architecture).toMatchObject({
      status: "revise",
      staleUpstream: ["T-old"],
    });
  });

  it("un amont non cité (F-001), modifié, n'est pas un impact", async () => {
    await decided();
    await head(base({ "F-001": "modifiée" }));
    const { list } = await entries();
    expect(list.architecture?.staleUpstream).toBeUndefined();
    expect(list.architecture?.status).not.toBe("revise");
  });

  it("jamais décidée : aucun impact, ni À revoir ni staleUpstream", async () => {
    await head(base());
    await head(base({ "F-002": "modifiée", "R-004": "modifiée" }, ["T-user", "T-order"]));
    const { list } = await entries();
    expect(list.architecture?.staleUpstream).toBeUndefined();
    expect(list.architecture?.status).not.toBe("revise");
  });

  it("décision hors index (instantané en échec) : aucun impact, jamais de faux À revoir", async () => {
    const version = await decided();
    await head(base({ "F-002": "modifiée" }));
    await bench().database.query(
      "UPDATE spec_snapshots SET status = 'failed', error_code = 'test' WHERE commit_sha = $1",
      [version],
    );
    expect((await entries()).list.architecture?.staleUpstream).toBeUndefined();
  });

  it("une nouvelle décision remet l'impact à zéro", async () => {
    await decided();
    const next = await head(base({ "F-002": "modifiée" }));
    expect((await entries()).list.architecture?.staleUpstream).toEqual(["F-002"]);

    expect((await validate("owner", next)).status).toBe(200);

    const { list } = await entries();
    expect(list.architecture?.staleUpstream).toBeUndefined();
    expect(list.architecture?.staleComponents).toBeUndefined();
    expect(list.architecture?.status).toBe("validated");
  });

  it("plafonds : 20 amonts, 50 composants concernés", async () => {
    const tables = Array.from({ length: 25 }, (_, i) => `T-t${String(i).padStart(2, "0")}`);
    const components = (hash: string) =>
      Array.from({ length: 55 }, (_, i) =>
        entity("component", `C-c${String(i).padStart(2, "0")}`, hash, {
          ...COMPONENT,
          sert: ["F-002"],
          possede: tables,
        }),
      );
    const withComponents = (over: Over, hash: string) => [
      ...base(over, ["T-user", ...tables]).filter((e) => e.kind !== "component"),
      ...components(hash),
    ];
    await decided(withComponents({}, "a"));
    await head(
      withComponents({ "F-002": "x", ...Object.fromEntries(tables.map((t) => [t, "x"])) }, "a"),
    );
    const { list } = await entries();
    expect(list.architecture?.staleUpstream).toHaveLength(20);
    expect(list.architecture?.staleComponents).toHaveLength(50);
  });
});
