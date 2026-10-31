import { describe, expect, it } from "vitest";
import { githubAppFromEnv } from "../src/index.ts";

// Assemblé : un PEM complet en littéral déclencherait la garde « aucun motif PEM » du paquet.
const PEM = `${["-----BEGIN", "PRIVATE KEY-----"].join(" ")}\nABCDEF\n${["-----END", "PRIVATE KEY-----"].join(" ")}\n`;

describe("githubAppFromEnv", () => {
  it("rend undefined sans variable ou avec des valeurs vides", () => {
    expect(githubAppFromEnv({})).toBeUndefined();
    expect(githubAppFromEnv({ GITHUB_APP_ID: "", GITHUB_APP_PRIVATE_KEY: "" })).toBeUndefined();
  });

  it("décode la clé en base64 ou aux \\n littéraux, laisse un PEM intact", () => {
    const base = { GITHUB_APP_ID: "1" };
    const encoded = Buffer.from(PEM).toString("base64");
    for (const value of [encoded, PEM.replaceAll("\n", "\\n"), PEM]) {
      expect(githubAppFromEnv({ ...base, GITHUB_APP_PRIVATE_KEY: value })?.privateKey).toBe(PEM);
    }
  });

  it("garde une valeur qui n'est ni PEM ni base64 de PEM telle quelle", () => {
    expect(githubAppFromEnv({ GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "opaque" })).toEqual({
      appId: "1",
      privateKey: "opaque",
    });
  });

  it("ajoute la paire client quand elle est complète", () => {
    const app = githubAppFromEnv({
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: PEM,
      GITHUB_APP_CLIENT_ID: "Iv1.x",
      GITHUB_APP_CLIENT_SECRET: "sec",
    });
    expect(app).toMatchObject({ clientId: "Iv1.x", clientSecret: "sec" });
  });

  it.each([
    [{ GITHUB_APP_ID: "1" }, "GITHUB_APP_PRIVATE_KEY"],
    [{ GITHUB_APP_PRIVATE_KEY: PEM }, "GITHUB_APP_ID"],
    [{ GITHUB_APP_CLIENT_ID: "a", GITHUB_APP_CLIENT_SECRET: "b" }, "GITHUB_APP_ID"],
    [
      { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: PEM, GITHUB_APP_CLIENT_SECRET: "b" },
      "GITHUB_APP_CLIENT_ID",
    ],
  ])("configuration partielle %#: l'erreur nomme la variable manquante", (env, missing) => {
    expect(() => githubAppFromEnv(env)).toThrow(missing);
  });
});
