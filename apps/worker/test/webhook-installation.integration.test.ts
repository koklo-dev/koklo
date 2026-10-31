import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebhookBench, type WebhookScene } from "./support/webhook-bench.ts";

/**
 * TK-45b §5.2 : événement `installation`. suspend/unsuspend/deleted mettent à jour
 * `provider_installations.status` ; `deleted` est terminal ; `created` ne crée jamais de ligne
 * (organisation inconnue) ; chaque changement de statut écrit une entrée d'audit SYSTÈME
 * (`actor_kind = system`, `provider.installation.<suspended|reactivated|deleted>`, cible = la ligne).
 */
let bench: WebhookBench;
let scene: WebhookScene;

beforeAll(async () => {
  bench = await WebhookBench.create();
  await bench.start();
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  scene = await bench.scene();
});

const statusOf = async (target: WebhookScene) => {
  const [row] = await bench.query<{ status: string }>(
    "SELECT status FROM provider_installations WHERE id = $1",
    [target.installationId],
  );
  return row?.status;
};

const audits = (target: WebhookScene) =>
  bench.query<{
    action: string;
    actor_kind: string;
    actor_id: string | null;
    target_kind: string;
    target_id: string;
    ticket_id: string | null;
  }>(
    "SELECT action, actor_kind, actor_id, target_kind, target_id, ticket_id FROM audit_log WHERE organization_id = $1 ORDER BY occurred_at, id",
    [target.organizationId],
  );

async function apply(
  target: WebhookScene,
  action: Parameters<WebhookBench["installationPayload"]>[1],
) {
  const id = await bench.deliver(bench.installationPayload(target, action));
  return bench.settled(id);
}

describe("changements de statut", () => {
  it.each([
    ["suspend", "suspended", "provider.installation.suspended"],
    ["deleted", "deleted", "provider.installation.deleted"],
  ] as const)("%s -> %s, livraison processed, audit système", async (action, status, audit) => {
    const row = await apply(scene, action);

    expect(row).toMatchObject({ status: "processed", error_code: null });
    expect(await statusOf(scene)).toBe(status);
    expect(await audits(scene)).toEqual([
      {
        action: audit,
        actor_kind: "system",
        actor_id: null,
        target_kind: "provider_installation",
        target_id: scene.installationId,
        ticket_id: null,
      },
    ]);
  });

  it("suspend puis unsuspend : retour à active, deux entrées d'audit (suspended, reactivated)", async () => {
    await apply(scene, "suspend");
    await apply(scene, "unsuspend");

    expect(await statusOf(scene)).toBe("active");
    expect((await audits(scene)).map((entry) => entry.action)).toEqual([
      "provider.installation.suspended",
      "provider.installation.reactivated",
    ]);
  });

  it("un statut inchangé (suspend rejoué) n'écrit pas de seconde entrée d'audit", async () => {
    await apply(scene, "suspend");
    const row = await apply(scene, "suspend");

    expect(row.status).toBe("processed");
    expect(await audits(scene)).toHaveLength(1);
  });

  it("new_permissions_accepted : ignored, statut et audit intacts", async () => {
    const row = await apply(scene, "new_permissions_accepted");
    expect(row.status).toBe("ignored");
    expect(await statusOf(scene)).toBe("active");
    expect(await audits(scene)).toEqual([]);
  });
});

describe("deleted est terminal", () => {
  it.each(["suspend", "unsuspend", "created"] as const)(
    "un %s tardif ne ressuscite pas l'installation : ignored, aucun audit de plus",
    async (late) => {
      await apply(scene, "deleted");
      const row = await apply(scene, late);

      expect(row.status).toBe("ignored");
      expect(await statusOf(scene)).toBe("deleted");
      expect(await audits(scene)).toHaveLength(1);
    },
  );

  it("deleted ne supprime ni le dépôt ni l'index (l'historique de spec reste lisible)", async () => {
    await bench.push(scene);
    await apply(scene, "deleted");

    const [repos] = await bench.query<{ n: string }>(
      "SELECT count(*) AS n FROM project_repos WHERE id = $1",
      [scene.repoId],
    );
    expect(repos?.n).toBe("1");
    expect(await bench.snapshots(scene)).toHaveLength(1);
    expect(await bench.headSha(scene)).toBeDefined();
  });
});

describe("installation inconnue ou création", () => {
  it("created : ignored / unknown_installation, aucune ligne provider_installations créée", async () => {
    const before = await bench.query("SELECT id FROM provider_installations");
    const payload = bench.installationPayload(scene, "created", "555000555");

    const row = await bench.settled(await bench.deliver(payload));

    expect(row).toMatchObject({ status: "ignored", error_code: "unknown_installation" });
    expect(await bench.query("SELECT id FROM provider_installations")).toHaveLength(before.length);
  });

  it.each(["suspend", "unsuspend", "deleted"] as const)(
    "%s d'une installation inconnue : ignored / unknown_installation, ni erreur ni audit",
    async (action) => {
      const payload = bench.installationPayload(scene, action, "777000777");
      const row = await bench.settled(await bench.deliver(payload));

      expect(row).toMatchObject({ status: "ignored", error_code: "unknown_installation" });
      expect(await audits(scene)).toEqual([]);
      expect(await statusOf(scene)).toBe("active");
    },
  );
});

describe("isolation entre installations", () => {
  it("l'événement d'une installation ne touche ni le statut ni l'audit d'une autre", async () => {
    const other = await bench.scene();
    await apply(scene, "suspend");

    expect(await statusOf(other)).toBe("active");
    expect(await audits(other)).toEqual([]);
    expect(await audits(scene)).toHaveLength(1);
  });

  it("une écriture d'audit qui échoue annule le changement de statut (une seule transaction)", async () => {
    await bench.query(
      `CREATE FUNCTION test_block_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit bloqué'; END $$`,
    );
    await bench.query(
      "CREATE TRIGGER test_block_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION test_block_audit()",
    );
    try {
      const row = await apply(scene, "suspend");

      expect(row).toMatchObject({ status: "failed", error_code: "internal" });
      expect(await statusOf(scene)).toBe("active");
    } finally {
      await bench.query("DROP TRIGGER test_block_audit ON audit_log");
      await bench.query("DROP FUNCTION test_block_audit()");
    }
  });
});

describe("effacement des livraisons d'une installation supprimée (RGPD)", () => {
  const remaining = async (ids: string[]) =>
    (
      await bench.query<{ id: string }>(
        "SELECT id FROM webhook_deliveries WHERE id = ANY($1::uuid[])",
        [ids],
      )
    )
      .map((row) => row.id)
      .sort();

  it("efface les livraisons de l'installation, sauf la courante ; celles des autres restent", async () => {
    const other = await bench.scene();
    const own = scene.installationExternalId;
    const mine = await Promise.all(
      ["processed", "failed", "ignored", "received"].map((status) =>
        bench.insertDelivery({ status, installationExternalId: own, payload: { n: status } }),
      ),
    );
    const theirs = await bench.insertDelivery({
      status: "processed",
      installationExternalId: other.installationExternalId,
    });
    const orphan = await bench.insertDelivery({
      status: "processed",
      installationExternalId: null,
    });

    const current = await bench.deliver(bench.installationPayload(scene, "deleted"));
    await bench.settled(current);

    expect(await remaining([...mine, current, theirs, orphan])).toEqual(
      [current, theirs, orphan].sort(),
    );
  });

  it("un suspend (pas deleted) n'efface aucune livraison", async () => {
    const keep = await bench.insertDelivery({
      status: "processed",
      installationExternalId: scene.installationExternalId,
    });
    await bench.settled(await bench.deliver(bench.installationPayload(scene, "suspend")));
    expect(await remaining([keep])).toEqual([keep]);
  });
});
