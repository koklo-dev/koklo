import { createRawDbClient, type PrismaClient } from "@koklo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotificationEmailStore } from "../src/notification/store.ts";
import { SWEEP_BATCH_SIZE, SWEEP_WINDOW_HOURS } from "../src/notification/types.ts";
import { NotificationBench, type NotificationScene } from "./support/notification-bench.ts";

/**
 * TK-58b : store des e-mails de notification (Postgres réel, client brut). Lecture d'un lot borné
 * `pending` dans la fenêtre de 24 h sous `FOR UPDATE SKIP LOCKED`, relecture du destinataire à
 * l'envoi, passages gardés `pending -> sent|skipped|failed`, isolation entre organisations.
 */
let bench: NotificationBench;
let raw: PrismaClient;
let store: NotificationEmailStore;
const NOW = () => new Date();
const AT = new Date("2026-11-02T10:00:00.000Z");
const opts = (limit = SWEEP_BATCH_SIZE) => ({ now: NOW(), limit, windowHours: SWEEP_WINDOW_HOURS });

beforeAll(async () => {
  bench = await NotificationBench.create();
  raw = createRawDbClient(bench.url);
  store = new NotificationEmailStore(raw);
}, 240_000);

afterAll(async () => {
  await raw?.$disconnect();
  await bench?.dispose();
});

const batch = (limit?: number) => store.withPendingBatch(opts(limit), async (ids) => [...ids]);

/** Vide la file entre tests : les lignes déjà traitées ne comptent plus. */
async function settleAll(): Promise<void> {
  await bench.query(
    "UPDATE notifications SET email_state = 'skipped' WHERE email_state = 'pending'",
  );
}

describe("constantes du balayage", () => {
  it("lot borné à 50 et fenêtre de 24 h", () => {
    expect(SWEEP_BATCH_SIZE).toBe(50);
    expect(SWEEP_WINDOW_HOURS).toBe(24);
  });
});

describe("withPendingBatch : lot borné dans la fenêtre", () => {
  it("ne renvoie que les lignes pending récentes, de la plus ancienne à la plus récente", async () => {
    await settleAll();
    const scene = await bench.scene("batch");
    const newest = await bench.notify(scene, { ageHours: 1 });
    const oldest = await bench.notify(scene, { ageHours: 23 });
    const middle = await bench.notify(scene, { ageHours: 5 });
    await bench.notify(scene, { ageHours: 2, emailState: "sent" });
    await bench.notify(scene, { ageHours: 2, emailState: "skipped" });
    await bench.notify(scene, { ageHours: 2, emailState: "failed" });
    await bench.notify(scene, { ageHours: 25 }); // hors fenêtre : jamais envoyée
    await bench.notify(scene, { ageHours: 24 * 30 });
    expect(await batch()).toEqual([oldest, middle, newest]);
  });

  it("borne le lot à la limite demandée (les plus anciennes d'abord)", async () => {
    await settleAll();
    const scene = await bench.scene("limit");
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) ids.push(await bench.notify(scene, { ageHours: 20 - i }));
    expect(await batch(4)).toEqual(ids.slice(0, 4));
    expect(await batch(1)).toEqual(ids.slice(0, 1));
  });

  it("le lot par défaut ne dépasse jamais 50 lignes", async () => {
    await settleAll();
    const scene = await bench.scene("cap");
    await bench.query(
      `INSERT INTO notifications (id, organization_id, recipient_user_id, project_id, type, subject_kind,
         subject_ref, dedupe_key, created_at, updated_at)
       SELECT gen_random_uuid(), $1, $2, $3, 'baseline.proposed', 'baseline', 'baseline-0', 'cap-' || n,
         now() - interval '1 hour', now()
       FROM generate_series(1, 120) AS n`,
      [scene.organizationId, scene.userId, scene.projectId],
    );
    expect(await batch(SWEEP_BATCH_SIZE)).toHaveLength(50);
  });

  it("lit les lignes de toutes les organisations dans le même lot", async () => {
    await settleAll();
    const a = await bench.scene("multi-a");
    const b = await bench.scene("multi-b");
    const ids = [await bench.notify(a, { ageHours: 3 }), await bench.notify(b, { ageHours: 2 })];
    expect(await batch()).toEqual(ids);
  });
});

describe("withPendingBatch : lecture seule et erreurs", () => {
  it("n'en modifie aucune : un balayage seul laisse les lignes pending", async () => {
    await settleAll();
    const scene = await bench.scene("readonly");
    const id = await bench.notify(scene);
    await batch();
    expect((await bench.stateOf(id))?.email_state).toBe("pending");
  });

  it("une erreur du gestionnaire se propage et relâche les verrous", async () => {
    await settleAll();
    const scene = await bench.scene("throws");
    const id = await bench.notify(scene);
    await expect(
      store.withPendingBatch(opts(), async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await batch()).toEqual([id]);
  });
});

describe("withPendingBatch : concurrence (FOR UPDATE SKIP LOCKED)", () => {
  it("deux balayages simultanés ne prennent jamais la même ligne", async () => {
    await settleAll();
    const scene = await bench.scene("concurrent");
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) ids.push(await bench.notify(scene, { ageHours: 20 - i }));

    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstSeen: () => void = () => undefined;
    const firstReady = new Promise<void>((resolve) => {
      firstSeen = resolve;
    });

    const first = store.withPendingBatch(opts(3), async (batchIds) => {
      firstSeen();
      await held; // verrous tenus pendant que le second balaie
      return [...batchIds];
    });
    await firstReady;
    const second = await store.withPendingBatch(opts(3), async (batchIds) => [...batchIds]);
    release();
    const firstIds = await first;

    expect(firstIds).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(firstIds.filter((id) => second.includes(id))).toEqual([]);
    expect([...firstIds, ...second].sort()).toEqual([...ids].sort());
  });
});

describe("withPendingBatch : tous les verrous pris", () => {
  it("un balayage ne bloque pas quand toutes les lignes sont verrouillées : lot vide", async () => {
    await settleAll();
    const scene = await bench.scene("all-locked");
    await bench.notify(scene);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstSeen: () => void = () => undefined;
    const firstReady = new Promise<void>((resolve) => {
      firstSeen = resolve;
    });
    const first = store.withPendingBatch(opts(), async (ids) => {
      firstSeen();
      await held;
      return ids.length;
    });
    await firstReady;
    expect(await batch()).toEqual([]);
    release();
    expect(await first).toBe(1);
  });
});

describe("claimForSend : relecture du destinataire à l'envoi", () => {
  it("ready : contexte complet, organisation et destinataire de CETTE ligne", async () => {
    const a = await bench.scene("claim-a");
    const b = await bench.scene("claim-b");
    const idA = await bench.notify(a, {
      type: "ticket.blocked",
      subjectKind: "ticket",
      subjectRef: "TK-45",
    });
    await bench.notify(b);
    const result = await store.claimForSend(idA);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.context).toMatchObject({
      id: idA,
      type: "ticket.blocked",
      subjectKind: "ticket",
      subjectRef: "TK-45",
      projectId: a.projectId,
      organizationId: a.organizationId,
      organizationName: a.organizationName,
      recipientEmail: a.email,
      recipientEmailVerified: true,
      readAt: null,
      emailState: "pending",
    });
    expect(result.context.recipientEmail).not.toBe(b.email);
    expect(result.context.organizationName).not.toBe(b.organizationName);
  });

  it.each(["baseline.proposed", "review.submitted", "ticket.blocked"] as const)(
    "le type %s est envoyé par e-mail",
    async (type) => {
      const scene = await bench.scene("emailed");
      const id = await bench.notify(scene, {
        type,
        subjectKind: "baseline",
        subjectRef: "baseline-0",
      });
      expect((await store.claimForSend(id)).kind).toBe("ready");
    },
  );

  it.each([
    "suggestion.created",
    "suggestion.decided",
    "baseline.validated",
    "baseline.tagged",
  ] as const)("le type %s est passé en skipped (in-app seulement)", async (type) => {
    const scene = await bench.scene("not-emailed");
    const id = await bench.notify(scene, { type, subjectKind: "suggestion", subjectRef: "SG-1" });
    expect(await store.claimForSend(id)).toEqual({ kind: "skipped", reason: "type-not-emailed" });
    expect(await bench.stateOf(id)).toMatchObject({ email_state: "skipped", emailed_at: null });
  });
});

describe("claimForSend : types et verdicts", () => {
  it("destinataire dont l'adresse n'est pas vérifiée : skipped", async () => {
    const scene = await bench.scene("unverified", { verified: false });
    const id = await bench.notify(scene);
    expect(await store.claimForSend(id)).toEqual({
      kind: "skipped",
      reason: "unverified-recipient",
    });
    expect(await bench.stateOf(id)).toMatchObject({ email_state: "skipped", emailed_at: null });
  });
});

describe("claimForSend : destinataire à ignorer", () => {
  it("notification déjà lue dans l'application : skipped", async () => {
    const scene = await bench.scene("read");
    const id = await bench.notify(scene, { readAt: new Date() });
    expect(await store.claimForSend(id)).toEqual({ kind: "skipped", reason: "already-read" });
    expect((await bench.stateOf(id))?.email_state).toBe("skipped");
  });

  it("membre retiré de l'organisation : la ligne a disparu (cascade), rien à envoyer", async () => {
    const scene = await bench.scene("removed");
    const id = await bench.notify(scene);
    await bench.query("DELETE FROM members WHERE organization_id = $1 AND user_id = $2", [
      scene.organizationId,
      scene.userId,
    ]);
    expect(await store.claimForSend(id)).toEqual({ kind: "gone" });
  });

  it("identifiant inconnu : gone", async () => {
    expect(await store.claimForSend("01900000-0000-7000-8000-00000000dead")).toEqual({
      kind: "gone",
    });
  });

  it.each(["sent", "skipped", "failed"] as const)(
    "ligne déjà %s : settled, état inchangé",
    async (state) => {
      const scene = await bench.scene("settled");
      const id = await bench.notify(scene, { emailState: state });
      expect(await store.claimForSend(id)).toEqual({ kind: "settled" });
      expect((await bench.stateOf(id))?.email_state).toBe(state);
    },
  );
});

describe("passages gardés pending -> sent|skipped|failed", () => {
  it("markSent : pending -> sent avec emailed_at, une seule fois", async () => {
    const scene = await bench.scene("sent");
    const id = await bench.notify(scene);
    expect(await store.markSent(id, AT)).toBe(true);
    const state = await bench.stateOf(id);
    expect(state?.email_state).toBe("sent");
    expect(state?.emailed_at?.toISOString()).toBe(AT.toISOString());
    expect(await store.markSent(id, new Date())).toBe(false);
    expect((await bench.stateOf(id))?.emailed_at?.toISOString()).toBe(AT.toISOString());
  });

  it("markSkipped et markFailed : pending -> état, emailed_at reste vide", async () => {
    const scene = await bench.scene("skipfail");
    const skipped = await bench.notify(scene);
    const failed = await bench.notify(scene);
    expect(await store.markSkipped(skipped)).toBe(true);
    expect(await store.markFailed(failed)).toBe(true);
    expect(await bench.stateOf(skipped)).toMatchObject({
      email_state: "skipped",
      emailed_at: null,
    });
    expect(await bench.stateOf(failed)).toMatchObject({ email_state: "failed", emailed_at: null });
  });

  it("aucun passage depuis un état terminal : false et état inchangé", async () => {
    const scene = await bench.scene("terminal");
    for (const state of ["sent", "skipped", "failed"] as const) {
      const id = await bench.notify(scene, { emailState: state });
      expect(await store.markSent(id, AT)).toBe(false);
      expect(await store.markSkipped(id)).toBe(false);
      expect(await store.markFailed(id)).toBe(false);
      expect((await bench.stateOf(id))?.email_state).toBe(state);
    }
  });
});

describe("passages gardés : cas limites", () => {
  it("identifiant inconnu : false", async () => {
    const unknown = "01900000-0000-7000-8000-00000000dead";
    expect(await store.markSent(unknown, AT)).toBe(false);
    expect(await store.markSkipped(unknown)).toBe(false);
    expect(await store.markFailed(unknown)).toBe(false);
  });

  it("deux marquages simultanés : un seul gagne", async () => {
    const scene = await bench.scene("race");
    const id = await bench.notify(scene);
    const results = await Promise.all([
      store.markSent(id, AT),
      store.markFailed(id),
      store.markSkipped(id),
      store.markSent(id, AT),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("ne touche qu'à la ligne visée", async () => {
    const scene: NotificationScene = await bench.scene("scoped");
    const target = await bench.notify(scene);
    const other = await bench.notify(scene);
    await store.markSent(target, AT);
    expect((await bench.stateOf(other))?.email_state).toBe("pending");
  });
});
