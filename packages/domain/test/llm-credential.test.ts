import { Console } from "node:console";
import { Writable } from "node:stream";
import { format, inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  INVALID_LLM_CREDENTIAL_REASONS,
  InvalidLlmCredentialError,
  isLlmCredential,
  LLM_CREDENTIAL_MAX_LENGTH,
  LlmCredential,
  llmCredential,
  revealLlmCredential,
} from "../src/index.ts";
import { SECRET_KEY } from "./llm-helpers.ts";

/**
 * TK-50b : la clé BYOK est opaque. Tout rendu (gabarit, String, JSON, inspect, console) donne
 * `[redacted]` ; seule `revealLlmCredential` (fonction de dernière minute) rend la clé.
 */
const REDACTED = "[redacted]";
const make = () => llmCredential(SECRET_KEY);

const consoleOutput = (value: unknown): string => {
  let out = "";
  const sink = new Writable({
    write(chunk, _enc, done) {
      out += String(chunk);
      done();
    },
  });
  const c = new Console({ stdout: sink, stderr: sink });
  c.log(value);
  c.error({ nested: { value } });
  c.dir(value, { depth: 5, showHidden: true });
  c.table([{ value }]);
  return out;
};

describe("LlmCredential : opacité", () => {
  it("rend [redacted] dans un gabarit, String(), toString() et une concaténation", () => {
    const c = make();
    expect(`${c}`).toBe(REDACTED);
    expect(String(c)).toBe(REDACTED);
    expect(c.toString()).toBe(REDACTED);
    expect(`${c}!`).toBe(`${REDACTED}!`);
    expect(c + "").toBe(REDACTED);
  });

  it("rend [redacted] dans JSON.stringify, seul ou imbriqué", () => {
    const c = make();
    expect(JSON.stringify(c)).toBe(`"${REDACTED}"`);
    expect(JSON.stringify({ a: [c], b: { c } })).toBe(
      `{"a":["${REDACTED}"],"b":{"c":"${REDACTED}"}}`,
    );
  });

  it("rend [redacted] dans util.inspect et util.format, même détaillés", () => {
    const c = make();
    expect(inspect(c)).toBe(REDACTED);
    expect(inspect(c, { showHidden: true, depth: 9, showProxy: true })).not.toContain(SECRET_KEY);
    expect(inspect({ deep: { c } }, { depth: 9 })).not.toContain(SECRET_KEY);
    for (const f of ["%s", "%j", "%o", "%O", "%d", "%i"]) {
      expect(format(f, c)).not.toContain(SECRET_KEY);
    }
  });

  it("n'imprime jamais la clé via console (log, error, dir, table)", () => {
    const out = consoleOutput(make());
    expect(out).toContain(REDACTED);
    expect(out).not.toContain(SECRET_KEY);
  });

  it("n'expose la clé par aucune propriété, énumérable ou non", () => {
    const c = make();
    expect(Object.keys(c)).toEqual([]);
    expect(Object.getOwnPropertyNames(c)).toEqual([]);
    expect(Object.getOwnPropertySymbols(c).map(String).join()).not.toContain(SECRET_KEY);
    expect(JSON.stringify(Object.entries(c))).not.toContain(SECRET_KEY);
    expect(Object.isFrozen(c)).toBe(true);
  });

  it("ne survit pas à un clonage structuré sous forme lisible", () => {
    const copy = (() => {
      try {
        return structuredClone(make());
      } catch {
        return undefined;
      }
    })();
    expect(JSON.stringify(copy ?? null)).not.toContain(SECRET_KEY);
    expect(isLlmCredential(copy)).toBe(false);
  });
});

describe("LlmCredential : lecture de dernière minute", () => {
  it("revealLlmCredential rend la clé exacte", () => {
    expect(revealLlmCredential(make())).toBe(SECRET_KEY);
  });

  it("deux clés identiques restent des objets distincts", () => {
    expect(make()).not.toBe(make());
  });

  it("revealLlmCredential refuse un objet qui n'est pas une vraie clé", () => {
    expect(() => revealLlmCredential(Object.create(LlmCredential.prototype))).toThrow(TypeError);
    expect(() => revealLlmCredential({} as LlmCredential)).toThrow(TypeError);
  });

  it("isLlmCredential ne reconnaît que les vraies clés", () => {
    expect(isLlmCredential(make())).toBe(true);
    expect(isLlmCredential(Object.create(LlmCredential.prototype))).toBe(false);
    expect(isLlmCredential({ reveal: () => "x" })).toBe(false);
    expect(isLlmCredential(SECRET_KEY)).toBe(false);
    expect(isLlmCredential(null)).toBe(false);
  });

  it("n'est pas constructible hors llmCredential", () => {
    // @ts-expect-error constructeur privé
    const build = () => new LlmCredential(SECRET_KEY);
    expect(build).toThrow(TypeError);
  });
});

describe("llmCredential : validation", () => {
  const reasonOf = (value: unknown): string => {
    try {
      llmCredential(value as string);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidLlmCredentialError);
      return (error as InvalidLlmCredentialError).reason;
    }
    return "accepted";
  };

  it("expose la liste fermée des raisons", () => {
    expect([...INVALID_LLM_CREDENTIAL_REASONS]).toEqual([
      "not-a-string",
      "empty",
      "too-long",
      "control-characters",
    ]);
  });

  it("refuse une clé vide ou blanche", () => {
    expect(reasonOf("")).toBe("empty");
    expect(reasonOf("   ")).toBe("empty");
    expect(reasonOf("\t")).toBe("empty");
  });

  it("refuse une valeur qui n'est pas une chaîne", () => {
    for (const value of [undefined, null, 42, {}, ["k"], Symbol("k")]) {
      expect(reasonOf(value)).toBe("not-a-string");
    }
  });

  it("borne la longueur : le maximum passe, +1 est refusé", () => {
    expect(LLM_CREDENTIAL_MAX_LENGTH).toBe(512);
    expect(reasonOf("k".repeat(LLM_CREDENTIAL_MAX_LENGTH))).toBe("accepted");
    expect(reasonOf("k".repeat(LLM_CREDENTIAL_MAX_LENGTH + 1))).toBe("too-long");
  });

  it("refuse les caractères de contrôle et sauts de ligne (injection d'en-tête)", () => {
    for (const bad of ["a\nb", "a\rb", "a\u0000b", "a\u007fb", "a\u0085b"]) {
      expect(reasonOf(bad)).toBe("control-characters");
    }
  });

  it("l'erreur ne reprend jamais la valeur fournie", () => {
    const bad = `${SECRET_KEY}\nX`;
    try {
      llmCredential(bad);
      expect.unreachable("la clé devait être refusée");
    } catch (error) {
      const e = error as InvalidLlmCredentialError;
      expect(e.message).not.toContain(SECRET_KEY);
      expect(e.stack ?? "").not.toContain(SECRET_KEY);
      expect(JSON.stringify(e)).not.toContain(SECRET_KEY);
      expect("cause" in e).toBe(false);
    }
  });
});
