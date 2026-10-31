import {
  GitAuthExpiredError,
  GitNotFoundError,
  GitProviderUnavailableError,
  GitRateLimitedError,
  WEBHOOK_DELIVERY_ERROR_CODES,
} from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { tableYaml } from "./support/spec-files.ts";
import { sha, WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-45b §4 : un échec MÉTIER est écrit sur la livraison (failed + code fermé) et le job termine
 * normalement (un job failed bloquerait sa clé en key_strict_fifo) ; une panne TRANSITOIRE relance
 * le job (`webhookDelivery: { retryLimit: 1, retryDelaySeconds: 1 }` : 2 exécutions au plus) puis,
 * au dernier essai, écrit failed + code et termine SANS lever.
 */
let bench: WebhookBench;
let scene: WebhookScene;
const covered = new Set<string>();

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  bench.spy.reset();
  scene = await bench.scene();
});

const TRANSIENT = [
  ["provider_unavailable", () => new GitProviderUnavailableError({ operation: "listFiles" })],
  [
    "provider_auth_expired",
    () =>
      new GitAuthExpiredError({ operation: "listFiles", kind: "installation", refreshable: true }),
  ],
  [
    "provider_rate_limited",
    () => new GitRateLimitedError({ operation: "listFiles", retryAfterMs: undefined }),
  ],
  ["internal", () => new Error("boom")],
] as const;

describe("pannes transitoires : relance puis failed au dernier essai", () => {
  it.each(TRANSIENT)("%s : 2 essais, failed + code, job completed", async (code, makeError) => {
    bench.spy.failWith("listFiles", makeError());
    const id = await bench.deliver(bench.pushPayload(scene));

    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "failed", error_code: code, attempts: 2 });
    expect(bench.spy.callsOf("listFiles").length).toBeGreaterThanOrEqual(2);
    expect((await bench.jobCompleted(id)).state).toBe("completed");
    covered.add(code);
  });

  it("une panne passagère est relancée : processed au second essai, un seul snapshot", async () => {
    bench.spy.failWith("listFiles", new GitProviderUnavailableError({ operation: "listFiles" }), 1);
    const id = await bench.deliver(bench.pushPayload(scene));

    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "processed", error_code: null, attempts: 2 });
    expect(await bench.snapshots(scene)).toHaveLength(1);
  });

  it("la clé n'est pas bloquée derrière une livraison en échec : la suivante s'exécute", async () => {
    bench.spy.failWith("listFiles", new GitProviderUnavailableError({ operation: "listFiles" }));
    const first = await bench.deliver(bench.pushPayload(scene));
    const second = await bench.deliver(bench.pushPayload(scene, { after: sha(9) }));
    await bench.settled(first);
    bench.spy.failures.clear();

    expect(await bench.settled(second)).toMatchObject({ status: "processed" });
    expect((await bench.jobCompleted(first)).state).toBe("completed");
  });
});

describe("échecs métier : écrits sur la livraison, aucune relance", () => {
  it("charge illisible : failed / invalid_payload, 1 essai, aucun appel au fournisseur", async () => {
    const id = await bench.insertDelivery({
      installationExternalId: scene.installationExternalId,
      repoExternalId: scene.repoExternalId,
      payload: {},
    });
    await bench.enqueue(id, `push:${scene.repoExternalId}:refs/heads/cadrage`);

    const row = await bench.settled(id);

    expect(row).toMatchObject({ status: "failed", error_code: "invalid_payload", attempts: 1 });
    expect(bench.spy.calls).toHaveLength(0);
    expect((await bench.jobCompleted(id)).retryCount).toBe(0);
    covered.add("invalid_payload");
  });

  it("dépôt introuvable chez le fournisseur : failed / repo_not_found, tête inchangée", async () => {
    await bench.push(scene);
    const before = await bench.headSha(scene);
    const error = new GitNotFoundError({
      operation: "listFiles",
      resource: "repository",
      identifier: "a/b",
    });
    bench.spy.failWith("listFiles", error);

    const row = await bench.push(scene, { after: sha(5) });

    expect(row).toMatchObject({ status: "failed", error_code: "repo_not_found", attempts: 1 });
    expect(await bench.headSha(scene)).toBe(before);
    covered.add("repo_not_found");
  });

  it("installation inconnue : ignored / unknown_installation, aucun appel au fournisseur", async () => {
    const payload = bench.pushPayload(scene, { installationId: "999000111" });
    const row = await bench.settled(await bench.deliver(payload));
    expect(row).toMatchObject({ status: "ignored", error_code: "unknown_installation" });
    expect(bench.spy.calls).toHaveLength(0);
    covered.add("unknown_installation");
  });

  it("dépôt inconnu de l'installation : ignored / unknown_repo", async () => {
    const row = await bench.push(scene, { repositoryId: "424242424" });
    expect(row).toMatchObject({ status: "ignored", error_code: "unknown_repo" });
    expect(bench.spy.calls).toHaveLength(0);
    covered.add("unknown_repo");
  });

  it("dépôt connu sous une AUTRE installation : ignored / unknown_repo", async () => {
    const other = await bench.scene();
    const row = await bench.push(scene, { repositoryId: other.repoExternalId });
    expect(row).toMatchObject({ status: "ignored", error_code: "unknown_repo" });
    expect(await bench.snapshots(other)).toEqual([]);
  });
});

describe("échecs métier : plafond et couverture des codes", () => {
  it("plus de 2 000 fichiers reconnus : snapshot failed / spec_too_large, tête déplacée, aucune lecture", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 2001 }, (_, index) => [
        `data/tables/T-t${index}.yaml`,
        tableYaml(`T-t${index}`),
      ]),
    );
    const head = await bench.commit(scene, files);
    bench.spy.reset();

    const row = await bench.push(scene, { after: head });

    expect(row).toMatchObject({ status: "failed", error_code: "spec_too_large", attempts: 1 });
    expect(await bench.snapshots(scene)).toMatchObject([
      { commit_sha: head, status: "failed", error_code: "spec_too_large" },
    ]);
    expect(await bench.headSha(scene)).toBe(head);
    expect(bench.spy.callsOf("readFile")).toHaveLength(0);
    covered.add("spec_too_large");
  });

  it("les 9 codes du domaine sont tous produits par un scénario de ce fichier", () => {
    expect([...covered].sort()).toEqual([...WEBHOOK_DELIVERY_ERROR_CODES].sort());
  });
});
