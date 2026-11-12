import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, parsed } from "./support.ts";

/**
 * TK-98 lot A, cas 12 : contrat 2.3.0, ajouts seulement. Quatre groupes (`aiProvider`, `aiModel`,
 * `aiUsage`, `aiSettings`), onze routes sous `/ai/...`. Aucune sortie ne porte la clé ni l'adresse de base.
 */
const INSTANT = "2026-11-07T10:00:00.000Z";
const KEY = `FAKE-KEY-NOT-REAL-${"a1".repeat(12)}`;
const ITEM = {
  provider: "anthropic",
  role: "primary",
  status: "verified",
  intermediary: false,
  euEligible: true,
  baseUrlRequired: false,
};

type Doc = { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
const doc = async () => (await generateOpenApi()) as unknown as Doc;

const ROUTES: [string, string, string][] = [
  ["aiProvider.list", "get", "/ai/providers"],
  ["aiProvider.add", "post", "/ai/providers"],
  ["aiProvider.verify", "post", "/ai/providers/{provider}/verify"],
  ["aiProvider.replaceKey", "put", "/ai/providers/{provider}/key"],
  ["aiProvider.remove", "delete", "/ai/providers/{provider}"],
  ["aiProvider.setPrimary", "post", "/ai/providers/{provider}/primary"],
  ["aiModel.listQualified", "get", "/ai/models"],
  ["aiUsage.set", "put", "/ai/usages/{usage}"],
  ["aiUsage.report", "get", "/ai/usage"],
  ["aiSettings.get", "get", "/ai/settings"],
  ["aiSettings.update", "patch", "/ai/settings"],
];

describe("AP1 surface : onze routes sous /ai", () => {
  it.each(ROUTES)("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    const d = await doc();
    expect(d.paths[path]?.[method], `${method} ${path}`).toBeDefined();
    expect(output(name), name).toBeDefined();
  });

  it("aucun chemin /ai existant n'est modifié : les propositions restent sous /projects/{projectId}/ai", async () => {
    const paths = Object.keys((await doc()).paths).filter((p) => p.includes("/ai/"));
    expect(paths.filter((p) => p.startsWith("/projects/")).sort()).toEqual([
      "/projects/{projectId}/ai/brief",
      "/projects/{projectId}/ai/criteria",
      "/projects/{projectId}/ai/deliverable/options",
      "/projects/{projectId}/ai/deliverable/propose",
      "/projects/{projectId}/ai/features",
      "/projects/{projectId}/ai/idea/chat",
      "/projects/{projectId}/ai/idea/gaps",
      "/projects/{projectId}/ai/idea/synthesis",
      "/projects/{projectId}/ai/proposals/{proposalId}/revise",
    ]);
  });
});

describe("AP2 aiProvider : entrées", () => {
  const add = (over: Record<string, unknown>) =>
    isValid(input("aiProvider.add"), { provider: "anthropic", apiKey: KEY, ...over });

  it("add accepte clé seule, adresse et modèle (un « / » permis)", async () => {
    expect(await add({})).toBe(true);
    expect(await add({ provider: "openai_compatible", baseUrl: "https://x.example/v1" })).toBe(
      true,
    );
    expect(await add({ provider: "openrouter", model: "editeur/modele-1" })).toBe(true);
  });

  it.each([
    ["clé vide", { apiKey: "   " }],
    ["clé trop longue", { apiKey: "k".repeat(513) }],
    ["clé avec caractère de contrôle", { apiKey: "ab\u0007cd" }],
    ["fournisseur inconnu", { provider: "fake" }],
    ["modèle avec ..", { model: "a..b" }],
    ["modèle avec deux /", { model: "a/b/c" }],
    ["modèle vide", { model: "" }],
    ["adresse vide", { baseUrl: "" }],
  ])("add refuse : %s", async (_label, over) => {
    expect(await add(over)).toBe(false);
  });

  it("replaceKey : mêmes règles ; verify et remove et setPrimary : fournisseur seul", async () => {
    expect(await isValid(input("aiProvider.replaceKey"), { provider: "openai", apiKey: KEY })).toBe(
      true,
    );
    expect(await isValid(input("aiProvider.replaceKey"), { provider: "openai", apiKey: "" })).toBe(
      false,
    );
    for (const name of ["aiProvider.verify", "aiProvider.remove", "aiProvider.setPrimary"]) {
      expect(await isValid(input(name), { provider: "google" }), name).toBe(true);
      expect(await isValid(input(name), { provider: "fake" }), name).toBe(false);
    }
  });
});

describe("AP3 aiProvider : sorties sans secret", () => {
  it("list : au plus six éléments, rôle nul permis", async () => {
    expect(await isValid(output("aiProvider.list"), { items: [{ ...ITEM, role: null }] })).toBe(
      true,
    );
    const seven = Array.from({ length: 7 }, () => ITEM);
    expect(await isValid(output("aiProvider.list"), { items: seven })).toBe(false);
  });

  it("une propriété dérivée de la clé ou l'adresse n'est jamais conservée", async () => {
    const value = await parsed(output("aiProvider.add"), {
      ...ITEM,
      lastUsedAt: INSTANT,
      defaultModel: "un-modele",
      apiKey: KEY,
      baseUrl: "https://x.example",
      suffix: KEY.slice(-4),
      ciphertext: "00",
    });
    expect(Object.keys(value ?? {}).sort()).toEqual(
      [...Object.keys(ITEM), "defaultModel", "lastUsedAt"].sort(),
    );
  });

  it("statut fermé : verified, unverified, invalid", async () => {
    for (const status of ["verified", "unverified", "invalid"]) {
      expect(await isValid(output("aiProvider.add"), { ...ITEM, status })).toBe(true);
    }
    expect(await isValid(output("aiProvider.add"), { ...ITEM, status: "ok" })).toBe(false);
    expect(await isValid(output("aiProvider.add"), { ...ITEM, role: "extra" })).toBe(false);
  });

  it("verify : { ok: true, model, checkedAt } ; remove : { removed: true }", async () => {
    expect(
      await isValid(output("aiProvider.verify"), { ok: true, model: "m", checkedAt: INSTANT }),
    ).toBe(true);
    expect(await isValid(output("aiProvider.remove"), { removed: true })).toBe(true);
    expect(await isValid(output("aiProvider.remove"), { removed: false })).toBe(false);
  });

  it("l'OpenAPI des routes /ai/providers ne cite aucun nom de secret", async () => {
    const d = await doc();
    const text = JSON.stringify(Object.entries(d.paths).filter(([p]) => p.startsWith("/ai/")));
    for (const name of ["keyVersion", "ciphertext", "nonce", "fingerprint", "last4", "hostname"]) {
      expect(text, name).not.toContain(`"${name}"`);
    }
    // `apiKey` n'existe qu'en entrée (corps de add et de replaceKey).
    const outputs = JSON.stringify(
      Object.values(d.paths["/ai/providers"] ?? {}).map(
        (op) => (op as { responses: unknown }).responses,
      ),
    );
    expect(outputs).not.toContain('"apiKey"');
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même groupe, un test par comportement
describe("AP4 aiModel, aiUsage, aiSettings", () => {
  it("aiModel.listQualified : { items[{ provider, model, usages, economy }] }", async () => {
    const entry = { provider: "anthropic", model: "m", usages: ["idea_space"], economy: false };
    expect(await isValid(output("aiModel.listQualified"), { items: [entry] })).toBe(true);
    expect(
      await isValid(output("aiModel.listQualified"), { items: [{ ...entry, usages: ["x"] }] }),
    ).toBe(false);
  });

  it("aiUsage.set : { provider, model } ou { model: null } ; jamais l'un sans l'autre", async () => {
    const set = (value: Record<string, unknown>) => isValid(input("aiUsage.set"), value);
    expect(
      await set({ usage: "idea_space", provider: "anthropic", model: "claude-sonnet-5-5" }),
    ).toBe(true);
    expect(await set({ usage: "idea_space", model: null })).toBe(true);
    expect(await set({ usage: "idea_space", provider: "anthropic", model: null })).toBe(false);
    expect(await set({ usage: "idea_space", model: "claude-sonnet-5-5" })).toBe(false);
    expect(await set({ usage: "inconnu", provider: "anthropic", model: "m" })).toBe(false);
    expect(await set({ usage: "idea_space", provider: "anthropic", model: "a..b" })).toBe(false);
  });

  it("aiUsage.set : sortie avec isDefault", async () => {
    expect(await isValid(output("aiUsage.set"), { usage: "idea_space", isDefault: true })).toBe(
      true,
    );
    expect(
      await isValid(output("aiUsage.set"), {
        usage: "idea_space",
        provider: "openai",
        model: "m",
        isDefault: false,
      }),
    ).toBe(true);
  });

  it("aiUsage.report : mois AAAA-MM facultatif, micro-dollars entiers, capState fermé", async () => {
    const report = (value: unknown) => isValid(input("aiUsage.report"), value);
    expect(await report({})).toBe(true);
    expect(await report({ month: "2026-11" })).toBe(true);
    for (const month of ["2026-13", "2026-00", "26-11", "2026-1", "novembre", "2026-11-01"]) {
      expect(await report({ month }), month).toBe(false);
    }
    const body = {
      month: "2026-11",
      providers: [
        { provider: "openai", calls: 2, inputTokens: 10, outputTokens: 4, costMicroUsd: 120 },
      ],
      totalCostMicroUsd: 120,
      monthlyCapMicroUsd: 1000,
      capState: "ok",
    };
    expect(await isValid(output("aiUsage.report"), body)).toBe(true);
    expect(await isValid(output("aiUsage.report"), { ...body, totalCostMicroUsd: 1.5 })).toBe(
      false,
    );
    expect(await isValid(output("aiUsage.report"), { ...body, capState: "rouge" })).toBe(false);
  });

  it("aiSettings.update : plafond entier > 0 ou null ; secours fournisseur ou null", async () => {
    const update = (value: unknown) => isValid(input("aiSettings.update"), value);
    expect(await update({})).toBe(true);
    expect(await update({ fallback: null, fallbackEnabled: true, monthlyCapMicroUsd: null })).toBe(
      true,
    );
    expect(await update({ fallback: "openai", monthlyCapMicroUsd: 5_000_000 })).toBe(true);
    for (const cap of [0, -1, 1.5, "10"])
      expect(await update({ monthlyCapMicroUsd: cap }), String(cap)).toBe(false);
    expect(await update({ fallback: "fake" })).toBe(false);
  });

  it("aiSettings.get : fallbackEnabled, plafond facultatif, une ligne par usage", async () => {
    const body = { fallbackEnabled: false, usages: [{ usage: "idea_space", isDefault: true }] };
    expect(await isValid(output("aiSettings.get"), body)).toBe(true);
    expect(await isValid(output("aiSettings.get"), { ...body, monthlyCapMicroUsd: 100 })).toBe(
      true,
    );
    expect(await isValid(output("aiSettings.get"), { usages: [] })).toBe(false);
  });
});

describe("AP5 erreurs typées", () => {
  const codes = (name: string) => Object.keys(errors(name)).sort();

  it("toutes les routes ont 401 et 403 (owner et admin, lectures comprises)", () => {
    for (const [name] of ROUTES) {
      expect(codes(name), name).toEqual(
        expect.arrayContaining(["FORBIDDEN", "UNAUTHORIZED", "INTERNAL"]),
      );
    }
  });

  it("add : 409 already_configured, 422, 503 chiffrement, 429/502 du fournisseur", () => {
    expect(codes("aiProvider.add")).toEqual(
      expect.arrayContaining([
        "CONFLICT",
        "VALIDATION",
        "ENCRYPTION_UNAVAILABLE",
        "LLM_RATE_LIMITED",
        "LLM_PROVIDER_ERROR",
      ]),
    );
    expect(codes("aiProvider.replaceKey")).toEqual(
      expect.arrayContaining(["NOT_FOUND", "LLM_PROVIDER_ERROR"]),
    );
    expect(codes("aiProvider.verify")).toEqual(
      expect.arrayContaining(["NOT_FOUND", "LLM_PROVIDER_ERROR"]),
    );
  });

  it("remove et setPrimary : 404 et 422 ; set, update, report : 422", () => {
    for (const name of ["aiProvider.remove", "aiProvider.setPrimary"]) {
      expect(codes(name), name).toEqual(expect.arrayContaining(["NOT_FOUND", "VALIDATION"]));
    }
    for (const name of ["aiUsage.set", "aiUsage.report", "aiSettings.update"]) {
      expect(codes(name), name).toContain("VALIDATION");
    }
  });
});
