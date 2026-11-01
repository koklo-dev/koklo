import { describe, expect, it, vi } from "vitest";
import { parseCatalog } from "../src/index.ts";
import { catalogJson } from "./helpers.ts";

type Rules = Record<string, unknown>[];

describe("parseCatalog : cas limites (Green)", () => {
  it("racine non objet : invalid-shape sans chemin", () => {
    const result = parseCatalog("[]");
    expect(result).toMatchObject({ ok: false, error: { code: "catalog.invalid-shape" } });
  });
  it("règle non objet : invalid-shape", () => {
    const json = catalogJson((c) => {
      (c.rules as unknown[])[1] = 42;
    });
    expect(parseCatalog(json)).toMatchObject({
      ok: false,
      error: { code: "catalog.invalid-shape" },
    });
  });
  it("enforcement non objet : invalid-shape", () => {
    const json = catalogJson((c) => {
      (c.rules as Rules)[1] = { ...(c.rules as Rules)[1], enforcement: "gate" };
    });
    expect(parseCatalog(json)).toMatchObject({
      ok: false,
      error: { code: "catalog.invalid-shape" },
    });
  });
  it("protected_rule_ids absent et règle protégée : protected-mismatch", () => {
    const json = catalogJson((c) => {
      delete (c as Record<string, unknown>).protected_rule_ids;
    });
    expect(parseCatalog(json)).toMatchObject({
      ok: false,
      error: { code: "catalog.protected-mismatch", path: "rules.0.protected" },
    });
  });
  it("règle listée mais non protégée : protected-mismatch", () => {
    const json = catalogJson((c) => {
      c.protected_rule_ids = ["global.secrets", "node.esm"];
    });
    expect(parseCatalog(json)).toMatchObject({
      ok: false,
      error: { code: "catalog.protected-mismatch", path: "rules.1.protected" },
    });
  });
  it("règle protégée advisory : invalid-shape sur severity", () => {
    const json = catalogJson((c) => {
      (c.rules as Rules)[0] = { ...(c.rules as Rules)[0], severity: "advisory" };
    });
    expect(parseCatalog(json)).toMatchObject({
      ok: false,
      error: { code: "catalog.invalid-shape", path: "rules.0.severity" },
    });
  });
});

describe("loadBuiltInCatalog : catalogue embarqué invalide", () => {
  it("lève une erreur explicite", async () => {
    vi.resetModules();
    vi.doMock("../src/catalog.json", () => ({ default: { schema_version: 2 } }));
    const { loadBuiltInCatalog } = await import("../src/builtin-catalog.ts");
    expect(() => loadBuiltInCatalog()).toThrow(/catalog\.unknown-version/);
    vi.doUnmock("../src/catalog.json");
  });
});
