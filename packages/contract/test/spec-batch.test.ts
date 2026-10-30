import { describe, expect, it } from "vitest";
import {
  batch,
  createOp,
  input,
  isValid,
  output,
  parsed,
  proc,
  report,
  SHA,
  SHA2,
  submitInput,
  UUID,
  UUID2,
} from "./support.ts";

const submit = (patch: object) => ({ ...submitInput, ...patch });
const ops = (n: number) => Array.from({ length: n }, () => createOp);

describe("B0 présence des procédures de lots", () => {
  it.each(["specBatch.submit", "specBatch.get"])("%s existe", (name) => {
    expect(proc(name), name).toBeDefined();
  });
});

describe("B1 specBatch.submit : enveloppe", () => {
  const i = () => input("specBatch.submit");
  it("accepte un lot minimal et un lot complet", async () => {
    expect(await isValid(i(), submitInput)).toBe(true);
    expect(
      await isValid(
        i(),
        submit({ branch: "cadrage", baseSha: SHA, message: "Ajoute la connexion" }),
      ),
    ).toBe(true);
  });
  it("projectId explicite et uuid", async () => {
    expect(await isValid(i(), submit({ projectId: undefined }))).toBe(false);
    expect(await isValid(i(), submit({ projectId: "x" }))).toBe(false);
  });
  it("clé d'idempotence obligatoire, 1 à 128 caractères [A-Za-z0-9._:-]", async () => {
    expect(await isValid(i(), submit({ idempotencyKey: undefined }))).toBe(false);
    expect(await isValid(i(), submit({ idempotencyKey: "" }))).toBe(false);
    expect(await isValid(i(), submit({ idempotencyKey: "a".repeat(128) }))).toBe(true);
    expect(await isValid(i(), submit({ idempotencyKey: "a".repeat(129) }))).toBe(false);
    expect(await isValid(i(), submit({ idempotencyKey: "Ab.9_x:y-z" }))).toBe(true);
    for (const bad of ["a b", "é", "a/b", "a;b", "a\n"]) {
      expect(await isValid(i(), submit({ idempotencyKey: bad })), JSON.stringify(bad)).toBe(false);
    }
  });
  it("branche, baseSha et message bornés", async () => {
    expect(await isValid(i(), submit({ branch: "" }))).toBe(false);
    expect(await isValid(i(), submit({ baseSha: "pas-un-sha" }))).toBe(false);
    expect(await isValid(i(), submit({ message: "a".repeat(200) }))).toBe(true);
    expect(await isValid(i(), submit({ message: "a".repeat(201) }))).toBe(false);
  });
  it("1 à 50 opérations", async () => {
    expect(await isValid(i(), submit({ operations: [] }))).toBe(false);
    expect(await isValid(i(), submit({ operations: undefined }))).toBe(false);
    expect(await isValid(i(), submit({ operations: ops(1) }))).toBe(true);
    expect(await isValid(i(), submit({ operations: ops(50) }))).toBe(true);
    expect(await isValid(i(), submit({ operations: ops(51) }))).toBe(false);
  });
  it("ne lit jamais l'auteur ni les trailers du commit (posés par le serveur)", async () => {
    const value = await parsed(
      i(),
      submit({
        authorUserId: UUID2,
        coAuthoredBy: "x <x@x>",
        koklOps: "x",
        trailers: ["Koklo-Ops: x"],
      }),
    );
    const keys = value === undefined ? [] : Object.keys(value);
    for (const forbidden of ["authorUserId", "coAuthoredBy", "koklOps", "trailers"]) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
  });
});

describe("B2 specBatch.submit : opérations feature.*", () => {
  const i = () => input("specBatch.submit");
  const one = (op: object) => submit({ operations: [op] });
  it("feature.create : titre et priorité obligatoires, reste optionnel", async () => {
    expect(await isValid(i(), one(createOp))).toBe(true);
    expect(
      await isValid(
        i(),
        one({
          ...createOp,
          status: "specifiee",
          description: "Texte",
          tables: ["T-user"],
          endpoints: ["E-login"],
          screens: ["S-login"],
          roles: ["RL-owner"],
          rules: ["R-001"],
          nfr: ["NFR-perf"],
        }),
      ),
    ).toBe(true);
    expect(await isValid(i(), one({ kind: "feature.create", priority: "must" }))).toBe(false);
    expect(await isValid(i(), one({ kind: "feature.create", title: "t" }))).toBe(false);
    expect(await isValid(i(), one({ ...createOp, title: "" }))).toBe(false);
    expect(await isValid(i(), one({ ...createOp, priority: "high" }))).toBe(false);
    expect(await isValid(i(), one({ ...createOp, status: "done" }))).toBe(false);
  });
  it("feature.create : l'identifiant F-nnn est attribué par le serveur", async () => {
    const value = (await parsed(i(), one({ ...createOp, specId: "F-999" }))) as
      | { operations: Record<string, unknown>[] }
      | undefined;
    expect(value === undefined || !("specId" in (value.operations[0] ?? {}))).toBe(true);
  });
  it("feature.create/update : liens de forme contrôlée", async () => {
    for (const patch of [
      { tables: ["user"] },
      { endpoints: ["T-user"] },
      { screens: ["login"] },
      { roles: ["owner"] },
      { rules: ["R-1"] },
      { nfr: ["perf"] },
    ]) {
      expect(await isValid(i(), one({ ...createOp, ...patch })), JSON.stringify(patch)).toBe(false);
      expect(
        await isValid(i(), one({ kind: "feature.update", specId: "F-001", ...patch })),
        JSON.stringify(patch),
      ).toBe(false);
    }
  });
});

describe("B2b specBatch.submit : feature.update, feature.delete, kind", () => {
  const i = () => input("specBatch.submit");
  const one = (op: object) => submit({ operations: [op] });
  it("feature.update : specId F-nnn et au moins un champ modifié", async () => {
    const update = (patch: object) => one({ kind: "feature.update", specId: "F-001", ...patch });
    expect(await isValid(i(), update({ title: "Nouveau" }))).toBe(true);
    expect(await isValid(i(), update({ status: "implementee" }))).toBe(true);
    expect(await isValid(i(), update({ priority: "wont", tables: [] }))).toBe(true);
    expect(await isValid(i(), update({ description: "" }))).toBe(true);
    expect(await isValid(i(), update({}))).toBe(false);
    expect(await isValid(i(), one({ kind: "feature.update", title: "x" }))).toBe(false);
    expect(await isValid(i(), update({ specId: "F-1", title: "x" }))).toBe(false);
    expect(await isValid(i(), update({ status: "done" }))).toBe(false);
    expect(await isValid(i(), update({ priority: "high" }))).toBe(false);
    expect(await isValid(i(), update({ title: "" }))).toBe(false);
  });
  it("feature.delete : specId F-nnn seulement", async () => {
    expect(await isValid(i(), one({ kind: "feature.delete", specId: "F-012" }))).toBe(true);
    expect(await isValid(i(), one({ kind: "feature.delete" }))).toBe(false);
    expect(await isValid(i(), one({ kind: "feature.delete", specId: "AC-1" }))).toBe(false);
  });
  it("kind inconnu ou hors 0.5.0 (tables, endpoints, écrans) refusé", async () => {
    for (const kind of [
      "table.create",
      "endpoint.create",
      "screen.create",
      "feature",
      "",
      "lock",
    ]) {
      expect(await isValid(i(), one({ kind, title: "t", priority: "must" })), kind).toBe(false);
    }
    expect(await isValid(i(), one({ title: "t", priority: "must" }))).toBe(false);
  });
  it("opérations mélangées dans un même lot", async () => {
    expect(
      await isValid(
        i(),
        submit({
          operations: [
            createOp,
            { kind: "feature.update", specId: "F-001", title: "x" },
            { kind: "feature.delete", specId: "F-002" },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe("B3 lot : sortie de submit et de get", () => {
  it.each(["specBatch.submit", "specBatch.get"])("%s : lot complet", async (name) => {
    const o = output(name);
    expect(await isValid(o, batch)).toBe(true);
    const committed = {
      ...batch,
      status: "committed",
      baseSha: SHA,
      commitSha: SHA2,
      committedAt: "2026-11-04T10:01:00.000Z",
      results: [
        { position: 0, kind: "feature.create", specId: "F-004" },
        { position: 1, kind: "feature.update", specId: "F-001" },
        { position: 2, kind: "feature.delete", specId: "F-002" },
      ],
    };
    expect(await isValid(o, committed)).toBe(true);
    expect(
      await isValid(o, { ...batch, status: "failed", errorCode: "SPEC_INVALID", report }),
    ).toBe(true);
    for (const status of ["queued", "committing", "committed", "failed", "conflict"]) {
      expect(await isValid(o, { ...batch, status }), status).toBe(true);
    }
  });
  it.each(["specBatch.submit", "specBatch.get"])(
    "%s : champs fermés et obligatoires",
    async (name) => {
      const o = output(name);
      expect(await isValid(o, { ...batch, status: "pending" })).toBe(false);
      expect(await isValid(o, { ...batch, id: "x" })).toBe(false);
      expect(await isValid(o, { ...batch, commitSha: "xyz" })).toBe(false);
      expect(await isValid(o, { ...batch, enqueuedAt: "hier" })).toBe(false);
      expect(
        await isValid(o, {
          ...batch,
          results: [{ position: 0, kind: "table.create", specId: null }],
        }),
      ).toBe(false);
      expect(
        await isValid(o, {
          ...batch,
          results: [{ position: 0, kind: "feature.create", specId: "x" }],
        }),
      ).toBe(false);
      expect(
        await isValid(o, {
          ...batch,
          results: [{ position: 0.5, kind: "feature.create", specId: null }],
        }),
      ).toBe(false);
      for (const field of Object.keys(batch)) {
        expect(await isValid(o, { ...batch, [field]: undefined }), field).toBe(false);
      }
    },
  );
  it("n'expose pas l'identifiant interne de l'auteur", async () => {
    const value = await parsed(output("specBatch.get"), { ...batch, authorUserId: UUID2 });
    expect(value === undefined || !("authorUserId" in value)).toBe(true);
  });
});

describe("B4 specBatch.get : entrée", () => {
  const i = () => input("specBatch.get");
  it("projectId et batchId uuid obligatoires", async () => {
    expect(await isValid(i(), { projectId: UUID, batchId: UUID2 })).toBe(true);
    expect(await isValid(i(), { projectId: UUID })).toBe(false);
    expect(await isValid(i(), { batchId: UUID2 })).toBe(false);
    expect(await isValid(i(), { projectId: "x", batchId: UUID2 })).toBe(false);
    expect(await isValid(i(), { projectId: UUID, batchId: "x" })).toBe(false);
  });
});
