import { randomUUID } from "node:crypto";
import { createRawDbClient, type PrismaClient } from "@koklo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotificationEmailStore } from "../src/notification/store.ts";
import { NotificationBench, type NotificationScene } from "./support/notification-bench.ts";

/**
 * TK-97 (cas 9, B101) : une préférence d'e-mail désactivée passe la notification en `skipped`
 * (raison `preference-off`, la notification in-app reste) ; activée ou absente, l'e-mail part.
 * Seuls les types déjà émis sont reliés à une clé ; `ticket.blocked` n'en a pas.
 */
let bench: NotificationBench;
let raw: PrismaClient;
let store: NotificationEmailStore;

beforeAll(async () => {
  bench = await NotificationBench.create();
  raw = createRawDbClient(bench.url);
  store = new NotificationEmailStore(raw);
}, 240_000);

afterAll(async () => {
  await raw?.$disconnect();
  await bench?.dispose();
});

const prefer = (scene: NotificationScene, key: string, enabled: boolean) =>
  bench.query(
    `INSERT INTO notification_preferences (id, organization_id, user_id, key, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())`,
    [randomUUID(), scene.organizationId, scene.userId, key, enabled],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("claimForSend : préférences d'e-mail", () => {
  it("aucune ligne : valeur par défaut (activée), l'e-mail part", async () => {
    const scene = await bench.scene("pref-default");
    const id = await bench.notify(scene, { type: "baseline.proposed" });
    expect((await store.claimForSend(id)).kind).toBe("ready");
  });

  it("préférence désactivée : skipped, raison preference-off, notification conservée", async () => {
    const scene = await bench.scene("pref-off");
    await prefer(scene, "deliverable_to_validate", false);
    const id = await bench.notify(scene, { type: "baseline.proposed" });
    expect(await store.claimForSend(id)).toEqual({ kind: "skipped", reason: "preference-off" });
    expect(await bench.stateOf(id)).toMatchObject({ email_state: "skipped", emailed_at: null });
    expect(await bench.query("SELECT 1 FROM notifications WHERE id = $1", [id])).toHaveLength(1);
  });

  it("préférence activée : l'e-mail part", async () => {
    const scene = await bench.scene("pref-on");
    await prefer(scene, "deliverable_to_validate", true);
    const id = await bench.notify(scene, { type: "baseline.proposed" });
    expect((await store.claimForSend(id)).kind).toBe("ready");
  });

  it("review.submitted suit client_validation", async () => {
    const scene = await bench.scene("pref-review");
    await prefer(scene, "client_validation", false);
    const id = await bench.notify(scene, {
      type: "review.submitted",
      subjectKind: "review",
      subjectRef: "R-1",
    });
    expect(await store.claimForSend(id)).toEqual({ kind: "skipped", reason: "preference-off" });
  });

  it("review.reminded (TK-104) suit client_validation : e-mail par défaut, rien si la préférence est coupée", async () => {
    const scene = await bench.scene("pref-reminded");
    const on = await bench.notify(scene, {
      type: "review.reminded",
      subjectKind: "review",
      subjectRef: "R-1",
    });
    expect((await store.claimForSend(on)).kind).toBe("ready");
    await prefer(scene, "client_validation", false);
    const off = await bench.notify(scene, {
      type: "review.reminded",
      subjectKind: "review",
      subjectRef: "R-1",
    });
    expect(await store.claimForSend(off)).toEqual({ kind: "skipped", reason: "preference-off" });
  });

  it("une autre clé, un autre utilisateur ou une autre organisation n'ont aucun effet", async () => {
    const scene = await bench.scene("pref-scope");
    const other = await bench.scene("pref-scope-other");
    await prefer(scene, "weekly_digest", false);
    await prefer(scene, "client_validation", false);
    await prefer(other, "deliverable_to_validate", false);
    const id = await bench.notify(scene, { type: "baseline.proposed" });
    expect((await store.claimForSend(id)).kind).toBe("ready");
  });

  it("ticket.blocked n'a pas de clé : aucune préférence ne l'arrête", async () => {
    const scene = await bench.scene("pref-blocked");
    for (const key of [
      "agent_silent",
      "pr_to_review",
      "client_validation",
      "deliverable_to_validate",
    ]) {
      await prefer(scene, key, false);
    }
    const id = await bench.notify(scene, {
      type: "ticket.blocked",
      subjectKind: "ticket",
      subjectRef: "TK-1",
    });
    expect((await store.claimForSend(id)).kind).toBe("ready");
  });

  it("une notification déjà lue reste skipped pour already-read, avant la préférence", async () => {
    const scene = await bench.scene("pref-read");
    await prefer(scene, "deliverable_to_validate", false);
    const id = await bench.notify(scene, { type: "baseline.proposed", readAt: new Date() });
    expect(await store.claimForSend(id)).toEqual({ kind: "skipped", reason: "already-read" });
  });

  it("le CHECK de la base refuse une clé inconnue", async () => {
    const scene = await bench.scene("pref-unknown");
    await expect(prefer(scene, "inconnue", false)).rejects.toThrow();
  });
});
