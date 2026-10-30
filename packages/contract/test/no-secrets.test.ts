import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, installation, output, parsed } from "./support.ts";

/** Noms de propriété interdits dans le contrat : un secret n'y a sa place ni en entrée, ni en sortie, ni en erreur. */
const FORBIDDEN_NAMES = [
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "clientSecret",
  "privateKey",
  "signature",
  "authorization",
  "password",
  "externalId",
  "state",
  "payload",
  "webhookSecret",
  "expiresIn",
];

const propertyNames = (node: unknown, found: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(node)) {
    for (const item of node) propertyNames(item, found);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && value && typeof value === "object") {
        for (const name of Object.keys(value)) found.add(name);
      }
      propertyNames(value, found);
    }
  }
  return found;
};

describe("Z1 aucun secret dans l'OpenAPI", () => {
  it("aucune propriété de schéma ne porte un nom de secret", async () => {
    const names = propertyNames(await generateOpenApi());
    for (const forbidden of FORBIDDEN_NAMES) expect(names.has(forbidden), forbidden).toBe(false);
  });
  it("les paramètres de chemin et de requête ne portent pas de secret", async () => {
    const doc = (await generateOpenApi()) as {
      paths: Record<string, Record<string, { parameters?: { name: string }[] }>>;
    };
    const params = Object.values(doc.paths)
      .flatMap((ops) => Object.values(ops))
      .flatMap((op) => (op.parameters ?? []).map((p) => p.name));
    for (const forbidden of FORBIDDEN_NAMES) expect(params, forbidden).not.toContain(forbidden);
  });
  it("le document contient bien les nouvelles routes (le scan n'est pas vide)", async () => {
    const doc = (await generateOpenApi()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toContain("/provider/installations/start");
    expect(propertyNames(doc).has("userAuthorization")).toBe(true);
  });
});

describe("Z2 aucun secret dans les erreurs typées des nouvelles routes", () => {
  it.each(["repo.link", "repo.createSpec", "spec.getFeature", "specBatch.submit"])(
    "%s : data des erreurs sans secret",
    async (name) => {
      expect(Object.keys(errors(name)), name).toContain("PROVIDER_AUTH_EXPIRED");
      const probe = { token: "ghs_x", accessToken: "x", refreshToken: "ghr_x", message: "boom" };
      for (const [code, entry] of Object.entries(errors(name))) {
        const schema = entry.data as { "~standard": { validate(v: unknown): unknown } } | undefined;
        if (!schema) continue;
        const value = await parsed(schema, probe);
        expect(
          value === undefined ||
            !("token" in value || "accessToken" in value || "refreshToken" in value),
          `${name} ${code}`,
        ).toBe(true);
      }
    },
  );
});

describe("Z3 sorties : une propriété secrète ajoutée n'est jamais conservée", () => {
  it("installation.list", async () => {
    const value = (await parsed(output("installation.list"), [
      { ...installation, token: "ghs_x", refreshToken: "ghr_x", externalId: "9" },
    ])) as unknown as Record<string, unknown>[] | undefined;
    const item = value?.[0] ?? {};
    for (const forbidden of ["token", "refreshToken", "externalId"])
      expect(forbidden in item, forbidden).toBe(false);
  });
  it("installation.start n'a pas de champ state séparé", async () => {
    const value = await parsed(output("installation.start"), {
      url: "https://github.com/apps/koklo/installations/new?state=abc",
      expiresAt: "2026-11-04T10:00:00.000Z",
      state: "abc",
    });
    expect(value === undefined || !("state" in value)).toBe(true);
  });
  it("les entrées n'acceptent pas de jeton à la place du serveur", async () => {
    const value = await parsed(input("repo.createSpec"), {
      projectId: "123e4567-e89b-42d3-a456-426614174000",
      installationId: "223e4567-e89b-42d3-a456-426614174001",
      token: "ghu_x",
      refreshToken: "ghr_x",
    });
    expect(value === undefined || !("token" in value || "refreshToken" in value)).toBe(true);
  });
});
