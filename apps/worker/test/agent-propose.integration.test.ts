import { AiCapReachedError } from "@koklo/llm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeAi,
  feature,
  finished,
  launch,
  launchState,
  proposalsOf,
  seedIdeaV2,
  seedOtherProject,
  seedProject,
} from "./support/agent-propose-bench.ts";
import { type Scene, WorkerBench } from "./support/spec-write-bench.ts";

/**
 * TK-99a lot B : la génération des propositions dans le worker (pg-boss réel, Postgres éphémère, faux
 * `AiProvider`). Cas de la fiche : 2 flux par zone, 3 départ de l'utilisateur, 4 invalide écartée et comptée,
 * 5 rien dans la spec, 7 charge au modèle, 14 résilience.
 */
let bench: WorkerBench;
const ai = new FakeAi();
let scene: Scene;

beforeAll(async () => {
  bench = await WorkerBench.create();
  await bench.start({ agentPropose: { ai, retryLimit: 1, retryDelaySeconds: 1 } });
}, 240_000);
afterAll(async () => {
  await bench?.dispose();
});
beforeEach(async () => {
  ai.reset();
  scene = await bench.scene();
  await seedProject(bench, scene);
});

const notifications = (launchId: string) =>
  bench.query<{
    type: string;
    subject_kind: string;
    subject_ref: string;
    email_state: string;
    recipient_user_id: string;
  }>(
    "SELECT type, subject_kind, subject_ref, email_state, recipient_user_id FROM notifications WHERE dedupe_key = $1",
    [launchId],
  );

describe("flux par zone (cas 2)", () => {
  it("publie la première zone avant la fin, positions croissantes, tout en attente", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    ai.batch = async (call) => {
      if (call === 2) await gate;
      return { proposals: [feature(`Fonction ${call}a`), feature(`Fonction ${call}b`)] };
    };
    const id = await launch(bench, scene);
    await vi.waitFor(async () => expect((await proposalsOf(bench, id)).length).toBe(2), {
      timeout: 15_000,
    });
    expect((await launchState(bench, id)).status).toBe("running");
    release();
    const done = await finished(bench, id);
    expect(done).toMatchObject({ status: "done", error_code: null, proposed_count: 4 });
    const rows = await proposalsOf(bench, id);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(rows.map((r) => r.zone)).toEqual(["Accès", "Accès", "Facturation", "Facturation"]);
    expect(rows.every((r) => r.status === "pending" && r.kind === "feature")).toBe(true);
    expect(rows[0]).toMatchObject({ title: "Fonction 1a", rationale: "Absent du cahier" });
  });

  it("une zone par appel, et au plus douze zones", async () => {
    ai.zones = Array.from({ length: 15 }, (_, index) => `Zone ${index + 1}`);
    ai.batch = () => ({ proposals: [] });
    const id = await launch(bench, scene);
    await finished(bench, id);
    const purposes = ai.requests.map((r) => r.trace.purpose);
    expect(purposes.filter((p) => p === "proposal-zones")).toHaveLength(1);
    expect(purposes.filter((p) => p === "proposal-batch")).toHaveLength(12);
  });

  it("bat le coeur à chaque appel", async () => {
    const id = await launch(bench, scene, { heartbeatAt: "2020-01-01T00:00:00Z" });
    const done = await finished(bench, id);
    expect(done.heartbeat_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("départ de l'utilisateur (cas 3)", () => {
  it("lastSeenAt ancien : une notification proposal.ready, sans e-mail, clé de déduplication = lancement", async () => {
    const id = await launch(bench, scene, { lastSeenAt: "2020-01-01T00:00:00Z" });
    await finished(bench, id);
    expect(await notifications(id)).toEqual([
      {
        type: "proposal.ready",
        subject_kind: "agent_launch",
        subject_ref: id,
        email_state: "skipped",
        recipient_user_id: scene.userId,
      },
    ]);
  });

  it("lecture de la liste il y a moins de 30 secondes : aucune notification", async () => {
    const id = await launch(bench, scene, { lastSeenAt: new Date().toISOString() });
    await finished(bench, id);
    expect(await notifications(id)).toEqual([]);
  });

  it("aucune notification quand le lancement échoue", async () => {
    ai.failWith = new Error("panne");
    const id = await launch(bench, scene);
    await finished(bench, id);
    expect(await notifications(id)).toEqual([]);
  });
});

describe("validation (cas 4)", () => {
  it("une valide, une hors schéma, une avec lien ou balise : une publiée, deux écartées et comptées", async () => {
    ai.zones = ["Accès"];
    ai.batch = () => ({
      proposals: [
        feature("Valide"),
        feature("Sans critère", { criteria: [] }),
        feature("Avec lien", { description: "Voir https://exemple.test/x et <b>gras</b>" }),
      ],
    });
    const id = await launch(bench, scene);
    const done = await finished(bench, id);
    expect(done).toMatchObject({ status: "done", proposed_count: 1, discarded_count: 2 });
    expect((await proposalsOf(bench, id)).map((r) => r.title)).toEqual(["Valide"]);
  });

  it("doublon de titre avec le cahier ou avec la même génération : écarté et compté", async () => {
    ai.zones = ["Accès"];
    ai.batch = () => ({
      proposals: [feature("connexion"), feature("Nouvelle"), feature("NOUVELLE")],
    });
    const id = await launch(bench, scene);
    const done = await finished(bench, id);
    expect(done).toMatchObject({ proposed_count: 1, discarded_count: 2 });
  });

  it("type non attendu pour le mode, ou charge qui n'est pas un objet : écarté et compté", async () => {
    ai.zones = ["Accès"];
    ai.batch = () => ({
      proposals: [
        feature("Bonne"),
        { kind: "rule", rationale: "x", content: { title: "R", statement: "S" } },
        "texte",
        { kind: "feature", rationale: "x", content: null },
      ],
    });
    const done = await finished(bench, await launch(bench, scene));
    expect(done).toMatchObject({ proposed_count: 1, discarded_count: 3 });
  });

  it("mode critères : seules les fonctionnalités sans critère reçoivent une proposition", async () => {
    ai.zones = ["Critères"];
    const criteria = [
      {
        title: "Cas nominal",
        steps: [
          { type: "etant_donne", text: "Un export" },
          { type: "quand", text: "Il est lancé" },
          { type: "alors", text: "Un fichier est produit" },
        ],
      },
    ];
    ai.batch = () => ({
      proposals: [
        { kind: "criteria", rationale: "Manque", content: { specId: "F-002", criteria } },
        { kind: "criteria", rationale: "Déjà couvert", content: { specId: "F-001", criteria } },
        { kind: "criteria", rationale: "Inconnu", content: { specId: "F-099", criteria } },
      ],
    });
    const id = await launch(bench, scene, { mode: "criteria" });
    const done = await finished(bench, id);
    expect(done).toMatchObject({ proposed_count: 1, discarded_count: 2 });
    const [row] = await proposalsOf(bench, id);
    expect(row).toMatchObject({ kind: "criteria", title: "F-002 · Export" });
  });
});

describe("mode update (B328)", () => {
  it("le modèle ne reçoit que le diff idea-v1 vers idea-v2 : pages modifiées et ajoutées, jamais les pages inchangées", async () => {
    await seedIdeaV2(bench, scene);
    const id = await launch(bench, scene, { mode: "update", baseVersion: 2 });
    await finished(bench, id);
    const sent = ai.sent();
    for (const present of ["VISION-V2", "ANNEXE-V2", "idea-v1", "idea-v2", "F-001", "Connexion"]) {
      expect(sent, present).toContain(present);
    }
    for (const absent of [
      "FROZEN-VISION",
      "FROZEN-PERSONAS",
      "RISK-OK",
      "SYNTH-OK",
      "SECRET-PAGE-MODIFIEE",
    ]) {
      expect(sent, absent).not.toContain(absent);
    }
  });

  it("la consigne du mode update demande de ne proposer que ce qui découle des changements", async () => {
    await seedIdeaV2(bench, scene);
    await finished(bench, await launch(bench, scene, { mode: "update", baseVersion: 2 }));
    const [first] = ai.requests;
    expect(first?.prompt.system).toMatch(/changes between the two versions/i);
  });

  it("pages retirées : seul leur identifiant est transmis, jamais un contenu", async () => {
    await seedIdeaV2(bench, scene);
    await bench.query(
      `UPDATE idea_versions SET pages_versions = pages_versions - 'personas' WHERE project_id = $1 AND number = 2`,
      [scene.projectId],
    );
    await finished(bench, await launch(bench, scene, { mode: "update", baseVersion: 2 }));
    expect(ai.sent()).toContain("personas");
    expect(ai.sent()).not.toContain("FROZEN-PERSONAS");
  });

  it("le mode complete reste inchangé : tout le dossier figé est lu", async () => {
    await finished(bench, await launch(bench, scene));
    expect(ai.sent()).toContain("FROZEN-PERSONAS");
  });

  it("update sans version précédente : échec propre, rien n'est envoyé au modèle", async () => {
    const done = await finished(bench, await launch(bench, scene, { mode: "update" }));
    expect(done.status).toBe("failed");
    expect(ai.requests).toEqual([]);
  });
});

describe("rien dans la spec (cas 5)", () => {
  it("le worker n'écrit ni lot ni opération de spec", async () => {
    const id = await launch(bench, scene);
    await finished(bench, id);
    const [row] = await bench.query<{ count: string }>(
      "SELECT count(*) FROM spec_write_batches WHERE project_id = $1",
      [scene.projectId],
    );
    expect(row?.count).toBe("0");
    expect(bench.spy.calls).toEqual([]);
  });
});

describe("charge au modèle (cas 7)", () => {
  it("les quatre sources listées, et aucune autre donnée", async () => {
    await seedOtherProject(bench, scene);
    await bench.query(
      `INSERT INTO idea_synthesis (id, organization_id, project_id, content_md, source, generated_at, updated_at)
       SELECT gen_random_uuid(), organization_id, id, 'SECRET-BROUILLON', NULL, now(), now()
         FROM projects WHERE name = 'Autre'`,
    );
    const id = await launch(bench, scene, { instruction: "Priorité au paiement" });
    await finished(bench, id);
    const sent = ai.sent();
    for (const present of [
      "FROZEN-VISION",
      "FROZEN-PERSONAS",
      "SYNTH-OK",
      "RISK-OK",
      "F-001",
      "Connexion",
      "CRITERE-EXISTANT",
      "Export",
      "Priorité au paiement",
    ]) {
      expect(sent, present).toContain(present);
    }
    for (const absent of [
      "SECRET-PAGE-MODIFIEE",
      "SECRET-COMMENTAIRE",
      "SECRET-AUTRE-PROJET",
      "SECRET-BROUILLON",
      scene.userEmail,
      scene.userName,
    ]) {
      expect(sent, absent).not.toContain(absent);
    }
  });

  it("usage spec_deliverables, réglage « données en UE » du projet, utilisateur du lancement", async () => {
    const id = await launch(bench, scene);
    await finished(bench, id);
    const [request] = ai.requests;
    expect(request).toMatchObject({
      usage: "spec_deliverables",
      organizationId: scene.organizationId,
      userId: scene.userId,
      euOnly: false,
    });
    expect(request?.trace.correlationId).toBe(id);
  });
});

describe("résilience (cas 14)", () => {
  it("échec du fournisseur : failed, code typé sans texte du fournisseur, verrou libéré, relance possible", async () => {
    ai.failWith = new Error("SECRET-TEXTE-FOURNISSEUR");
    const id = await launch(bench, scene);
    const failed = await finished(bench, id);
    expect(failed).toMatchObject({ status: "failed", error_code: "provider_error" });
    expect(JSON.stringify(failed)).not.toContain("SECRET-TEXTE-FOURNISSEUR");
    ai.reset();
    const again = await launch(bench, scene);
    expect((await finished(bench, again)).status).toBe("done");
  });

  it("plafond mensuel atteint : failed llm_cap_reached", async () => {
    ai.failWith = new AiCapReachedError();
    const failed = await finished(bench, await launch(bench, scene));
    expect(failed).toMatchObject({ status: "failed", error_code: "llm_cap_reached" });
  });

  it("sortie des zones inexploitable : failed output_invalid", async () => {
    ai.zones = "pas une liste" as never;
    const failed = await finished(bench, await launch(bench, scene));
    expect(failed).toMatchObject({ status: "failed", error_code: "output_invalid" });
  });

  it("durée maximale dépassée : failed timeout, rien de publié", async () => {
    await bench.start({
      agentPropose: { ai, deadlineMs: -1, retryLimit: 1, retryDelaySeconds: 1 },
    });
    try {
      const failed = await finished(bench, await launch(bench, scene));
      expect(failed).toMatchObject({ status: "failed", error_code: "timeout", proposed_count: 0 });
    } finally {
      await bench.start({ agentPropose: { ai, retryLimit: 1, retryDelaySeconds: 1 } });
    }
  });

  it("sans version figée : failed no_frozen_version, aucun appel", async () => {
    const bare = await bench.scene();
    const failed = await finished(bench, await launch(bench, bare));
    expect(failed).toMatchObject({ status: "failed", error_code: "no_frozen_version" });
    expect(ai.requests).toEqual([]);
  });

  it("lancement déjà en cours de traitement à la reprise : failed worker_lost, aucun appel", async () => {
    const failed = await finished(bench, await launch(bench, scene, { status: "running" }));
    expect(failed).toMatchObject({ status: "failed", error_code: "worker_lost" });
    expect(ai.requests).toEqual([]);
  });

  it("la charge pg-boss ne porte que l'identifiant du lancement", async () => {
    const id = await launch(bench, scene);
    await finished(bench, id);
    const rows = await bench.query<{ data: unknown }>(
      "SELECT data FROM pgboss.job WHERE name = 'agent-propose' AND id = $1",
      [id],
    );
    expect(rows[0]?.data).toEqual({ launchId: id });
  });
});
