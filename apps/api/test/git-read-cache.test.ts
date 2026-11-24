import { type FileContent, type FileListing, GitRateLimitedError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { commitAtHead, setEntityPath } from "./helpers/spec-architecture.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-114f lot A (A3, B687 à B693) : les lectures git de l'API au commit indexé passent par un cache partagé du processus,
 * par installation et dépôt ; un quota épuisé freine l'installation sans appel ; l'état de l'installation reste vérifié
 * avant le cache.
 */
const read = installBench({ beforeAll, afterAll, beforeEach });

const FLOW = {
  id: "P-reserver",
  titre: "P-reserver",
  participants: ["RL-client", "C-api"],
  messages: [{ de: "RL-client", vers: "C-api", texte: "Réserve", retour: "OK" }],
};
const COMPONENT = { id: "C-api", titre: "API", nom: "API", type: "service", zone: "Coeur" };
const FLOW_PATH = "architecture/flows/P-reserver.yaml";
const FLOW_YAML = "id: P-reserver\ntitre: Réserver\nparticipants: [RL-client, C-api]\n";

async function seeded() {
  const s = await readScene(read());
  const indexed = await seedIndex(read(), s, [], {
    commit: true,
    entities: [
      entity("component", "C-api", "c", COMPONENT),
      entity("archflow", "P-reserver", "f", FLOW),
      entity("roles", "roles", "r", { roles: [{ id: "RL-client", nom: "Client" }] }),
    ],
  });
  await setEntityPath(read(), indexed.snapshotId, "P-reserver", FLOW_PATH);
  return { s, ...indexed };
}

type Scene = Awaited<ReturnType<typeof seeded>>["s"];

const source = (s: Scene, query = "target[kind]=flow&target[id]=P-reserver") =>
  send(
    read().app,
    s.world.actors.dev.cookie,
    "get",
    `/projects/${s.projectId}/spec/architecture/source?${query}`,
  );
const reads = () => read().harness.calls.filter((c) => /^(readFile|listFiles)$/.test(c.method));
const count = (method: string) => read().harness.callsOf(method).length;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même cache, un test par comportement
describe("cache des lectures git de l'API (TK-114f, A3)", () => {
  it("deux affichages de la source d'un flux (YAML) : un seul readFile", async () => {
    const { s, snapshotId } = await seeded();
    await commitAtHead(read(), s, snapshotId, [{ path: FLOW_PATH, content: FLOW_YAML }]);
    read().harness.calls = [];
    const first = await source(s);
    const second = await source(s);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(first.body).toMatchObject({ text: FLOW_YAML, generated: false });
    expect(count("readFile")).toBe(1);
    expect(count("listFiles")).toBe(1);
  });

  it("Mermaid absent du dépôt : généré, sans readFile après l'arbre", async () => {
    const { s } = await seeded();
    read().harness.calls = [];
    const res = await source(s, "target[kind]=flow&target[id]=P-reserver&format=mermaid");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.generated).toBe(true);
    expect(count("listFiles")).toBe(1);
    expect(count("readFile")).toBe(0);
  });

  it("deux projets, deux installations, même commit et chemin : chacun lit son contenu", async () => {
    const a = await seeded();
    const b = await seeded();
    const sha = "c".repeat(40);
    await read().database.query("UPDATE spec_snapshots SET commit_sha = $1 WHERE id IN ($2, $3)", [
      sha,
      a.snapshotId,
      b.snapshotId,
    ]);
    const blob = "d".repeat(40);
    const inner = read().harness.inner;
    vi.spyOn(inner, "listFiles").mockImplementation(
      async (): Promise<FileListing> => ({ ref: sha, files: [{ path: FLOW_PATH, sha: blob }] }),
    );
    vi.spyOn(inner, "readFile").mockImplementation(
      async (request): Promise<FileContent> => ({
        path: request.path,
        ref: sha,
        sha: blob,
        content: `id: P-reserver\n# ${request.repo.owner.login}\n`,
      }),
    );
    expect((await source(a.s)).body.text).toContain(`# ${a.s.owner.login}`);
    expect((await source(b.s)).body.text).toContain(`# ${b.s.owner.login}`);
    expect(count("readFile")).toBe(2);
  });

  it("quota épuisé : 429 PROVIDER_RATE_LIMITED avec retryAfterMs, puis 2e requête sans lecture", async () => {
    const { s } = await seeded();
    read().harness.calls = [];
    read().harness.failWith(
      "listFiles",
      new GitRateLimitedError({ operation: "listFiles", retryAfterMs: 1_800_000 }),
      { once: true },
    );
    const first = await source(s);
    expect(first.status, JSON.stringify(first.body)).toBe(429);
    expect(first.body).toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      data: { retryAfterMs: 1_800_000 },
    });
    const second = await source(s);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("PROVIDER_RATE_LIMITED");
    expect(second.body.data.retryAfterMs).toBeGreaterThan(0);
    expect(second.body.data.retryAfterMs).toBeLessThanOrEqual(1_800_000);
    expect(reads()).toHaveLength(1);
  });

  it("installation inactive : inchangé (généré, document indisponible) même avec le cache plein", async () => {
    const { s, snapshotId } = await seeded();
    await commitAtHead(read(), s, snapshotId, [{ path: FLOW_PATH, content: FLOW_YAML }]);
    expect((await source(s)).body.generated).toBe(false);
    await read().database.query(
      "UPDATE provider_installations SET status = 'suspended' WHERE id = $1",
      [s.installation.id],
    );
    read().harness.calls = [];
    const res = await source(s);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.generated).toBe(true);
    const doc = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      `/projects/${s.projectId}/spec/architecture/document`,
    );
    expect(doc.body.code).toBe("PROVIDER_UNAVAILABLE");
    expect(read().harness.calls).toEqual([]);
  });
});
