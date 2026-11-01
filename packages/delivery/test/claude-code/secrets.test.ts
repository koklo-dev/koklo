import { inspect } from "node:util";
import { revealUntrusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { REDACTED, redactSecrets } from "../../src/claude-code/index.ts";
import { AgentRuntimeUnavailableError } from "../../src/index.ts";
import { makeRequest, SECRET_KEY } from "../agent-helpers.ts";
import { makeRuntime, makeSandbox, recordedArgv, script } from "./support.ts";

const LEAKS = [
  "sk-ant-api03-LEAKEDSECRET0123456789",
  "ghp_LEAKEDGITHUBTOKEN0123456789abcd",
  "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz",
  "Bearer abc.def-LEAKED",
  "AKIAIOSFODNN7EXAMPLE",
  "ASIAIOSFODNN7EXAMPLE",
  "sk-proj-abcDEF0123456789_-abcdef",
  "xoxb-1234567890-abcdefABCDEF",
  "xoxp-1234567890-abcdefABCDEF",
  "glpat-abcdefghij0123456789",
  "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabcdef\n-----END RSA PRIVATE KEY-----",
  "-----BEGIN PRIVATE KEY-----\nMIIEvQ\n-----END PRIVATE KEY-----",
];

describe("redactSecrets", () => {
  it.each(LEAKS)("masque le motif %s", (leak) => {
    const out = redactSecrets(`avant ${leak} apres`);
    expect(out).not.toContain(leak);
    expect(out).toContain(REDACTED);
    expect(out).toContain("avant");
    expect(out).toContain("apres");
  });

  it("masque les valeurs exactes des credentials connus, meme sans motif", () => {
    const out = redactSecrets("la cle est topsecret-valeur-42 ici", ["topsecret-valeur-42"]);
    expect(out).not.toContain("topsecret-valeur-42");
  });

  it("est idempotente et laisse un texte sans secret inchange", () => {
    for (const text of ["", "rien a signaler", `x ${LEAKS.join(" ")} y`]) {
      const once = redactSecrets(text, [SECRET_KEY]);
      expect(redactSecrets(once, [SECRET_KEY])).toBe(once);
    }
    expect(redactSecrets("rien a signaler")).toBe("rien a signaler");
  });

  it("masque un bloc PEM entier, y compris les sauts de ligne", () => {
    const pem =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\nBBBB\n-----END OPENSSH PRIVATE KEY-----";
    const out = redactSecrets(`a ${pem} b`);
    expect(out).toBe(`a ${REDACTED} b`);
  });

  it("ignore les secrets connus vides (ne masque pas tout)", () => {
    expect(redactSecrets("texte", [""])).toBe("texte");
  });
});

describe("non-fuite de secrets de bout en bout", () => {
  it("redige la sortie, le resultat et son inspect ; la cle n'est jamais en argv", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "leak", text: `echo ${SECRET_KEY}` });
    const result = await makeRuntime(sandbox).launchSession(
      makeRequest({ worktree: sandbox.worktree }),
    );
    expect(result.status).toBe("completed");
    const revealed = revealUntrusted(result.output);
    const renderings = [
      revealed,
      JSON.stringify(result),
      inspect(result, { depth: 6 }),
      String(result.output),
    ];
    for (const text of renderings) {
      for (const leak of [...LEAKS, SECRET_KEY]) {
        expect(text, leak).not.toContain(leak);
      }
    }
    expect(revealed).toContain(REDACTED);
    expect(recordedArgv(sandbox).join("\n")).not.toContain(SECRET_KEY);
  });

  it("ne divulgue ni la cle ni le chemin du binaire dans l'erreur d'un executable absent", async () => {
    const sandbox = makeSandbox();
    const executable = `${sandbox.root}/secret-dir-SENTINELLE/claude`;
    const error = await makeRuntime(sandbox, { executable })
      .launchSession(makeRequest({ worktree: sandbox.worktree }))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentRuntimeUnavailableError);
    const text = `${String(error)}${(error as Error).stack}${JSON.stringify(error)}${inspect(error)}`;
    expect(text).not.toContain(SECRET_KEY);
    expect(text).not.toContain("secret-dir-SENTINELLE");
  });
});
