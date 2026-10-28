import { describe, expect, it } from "vitest";
import { createLogger } from "../src/index.ts";

function sink() {
  const lines: string[] = [];
  return { lines, destination: { write: (line: string) => void lines.push(line) } };
}

describe("createLogger (TK-19)", () => {
  it("écrit une ligne JSON parsable avec niveau, message et champs structurés", () => {
    const { lines, destination } = sink();
    createLogger({ level: "info", destination }).info({ requestId: "req-1" }, "bonjour");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      level: 30,
      msg: "bonjour",
      requestId: "req-1",
    });
  });

  it("un logger enfant porte son identifiant de corrélation sur chaque ligne", () => {
    const { lines, destination } = sink();
    const logger = createLogger({ level: "info", destination }).child({ jobId: "job-7" });
    logger.info("début");
    logger.error("échec");
    expect(lines.map((line) => JSON.parse(line).jobId)).toEqual(["job-7", "job-7"]);
  });

  it.each([
    ["req.headers", (secret: string) => ({ req: { headers: { authorization: secret } } })],
    ["req.headers", (secret: string) => ({ req: { headers: { cookie: secret } } })],
    ["headers", (secret: string) => ({ headers: { authorization: secret } })],
    ["headers", (secret: string) => ({ headers: { cookie: secret } })],
  ])("redaction : %s authorization/cookie ne sortent jamais", (_label, build) => {
    const { lines, destination } = sink();
    createLogger({ level: "info", destination }).info(build("valeur-secrete-xyz"), "requête");
    expect(lines.join("")).not.toContain("valeur-secrete-xyz");
  });

  it("redaction : les autres en-têtes restent visibles", () => {
    const { lines, destination } = sink();
    createLogger({ level: "info", destination }).info(
      { req: { headers: { "user-agent": "vitest", authorization: "secret-abc" } } },
      "requête",
    );
    expect(lines.join("")).toContain("vitest");
    expect(lines.join("")).not.toContain("secret-abc");
  });

  it("LOG_LEVEL filtre : au niveau warn, info est supprimé et warn conservé", () => {
    const { lines, destination } = sink();
    const logger = createLogger({ level: "warn", destination });
    logger.info("ignoré");
    logger.warn("gardé");
    expect(lines.map((line) => JSON.parse(line).msg)).toEqual(["gardé"]);
  });

  it("le niveau silent n'écrit rien", () => {
    const { lines, destination } = sink();
    createLogger({ level: "silent", destination }).error("rien");
    expect(lines).toEqual([]);
  });
});

describe("createLogger : jetons et liens (TK-22)", () => {
  it.each([
    ["token", (secret: string) => ({ token: secret })],
    ["url", (secret: string) => ({ url: secret })],
    ["data.token", (secret: string) => ({ data: { token: secret } })],
    ["data.url", (secret: string) => ({ data: { url: secret } })],
    ["job.data.url", (secret: string) => ({ job: { data: { url: secret } } })],
    [
      "res.headers.set-cookie",
      (secret: string) => ({ res: { headers: { "set-cookie": [secret] } } }),
    ],
  ])("redaction (TK-22) : %s ne sort jamais", (_label, build) => {
    const { lines, destination } = sink();
    createLogger({ level: "info", destination }).info(build("valeur-secrete-xyz"), "lien");
    expect(lines.join("")).not.toContain("valeur-secrete-xyz");
  });
});
