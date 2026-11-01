import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import {
  FramedPrompt,
  framePrompt,
  InvalidUntrustedOriginError,
  isFramedPrompt,
  isUntrustedOrigin,
  isValidated,
  LlmInvalidOutputError,
  revealTrusted,
  revealUntrusted,
  Trusted,
  trusted,
  UNTRUSTED_ORIGINS,
  Untrusted,
  UntrustedDelimiterCollisionError,
  unvalidated,
  validateLlmOutput,
} from "../src/index.ts";
import { makePrompt, NONCE } from "./llm-helpers.ts";

/**
 * TK-50b : durcissements repris de la revue 50a (garde-fous runtime, pas seulement typés).
 */
const frame = (content: string, nonce = NONCE) =>
  framePrompt({
    instructions: trusted`Résume.`,
    data: [new Untrusted("brief", content)],
    nonce,
  });

describe("FramedPrompt : marque runtime (#brand) et isFramedPrompt", () => {
  it("reconnaît un prompt produit par framePrompt", () => {
    expect(isFramedPrompt(makePrompt())).toBe(true);
  });

  it("refuse un objet qui n'en vient pas, même avec le bon prototype ou la bonne forme", () => {
    expect(isFramedPrompt(Object.create(FramedPrompt.prototype))).toBe(false);
    const withShape = Object.assign(Object.create(FramedPrompt.prototype), {
      system: "s",
      user: "u",
    });
    expect(isFramedPrompt(withShape)).toBe(false);
    expect(isFramedPrompt({ system: "s", user: "u" })).toBe(false);
    expect(isFramedPrompt(structuredClone({ system: "s", user: "u" }))).toBe(false);
    expect(isFramedPrompt(Object.freeze({ system: "s", user: "u" }))).toBe(false);
    expect(isFramedPrompt("system+user")).toBe(false);
    expect(isFramedPrompt(null)).toBe(false);
    expect(isFramedPrompt(undefined)).toBe(false);
  });

  it("refuse la copie d'un prompt (la marque ne se clone pas)", () => {
    const real = makePrompt();
    expect(isFramedPrompt({ ...real })).toBe(false);
    expect(isFramedPrompt(Object.create(real))).toBe(false);
    expect(isFramedPrompt(Object.assign(Object.create(FramedPrompt.prototype), real))).toBe(false);
  });

  it("n'expose aucune propriété énumérable autre que system et user", () => {
    expect(Object.keys(makePrompt()).sort()).toEqual(["system", "user"]);
  });
});

describe("Validated : isValidated", () => {
  it("reconnaît une proposition produite par validateLlmOutput", () => {
    expect(isValidated(validateLlmOutput(unvalidated({ a: 1 }), (raw) => raw))).toBe(true);
  });

  it("refuse un objet forgé ou copié", () => {
    expect(isValidated({ status: "proposal", value: 1 })).toBe(false);
    expect(isValidated(Object.freeze({ status: "proposal", value: 1 }))).toBe(false);
    const real = validateLlmOutput(unvalidated(1), (raw) => raw);
    expect(isValidated({ ...real })).toBe(false);
    expect(isValidated(Object.create(real))).toBe(false);
    expect(isValidated(unvalidated("brut"))).toBe(false);
    expect(isValidated(null)).toBe(false);
  });
});

describe("Trusted : durcissement de l'étiquette", () => {
  it("accepte un vrai appel d'étiquette de gabarit (strings et raw gelés par le moteur)", () => {
    expect(revealTrusted(trusted`ok`)).toBe("ok");
  });

  const call = trusted as unknown as (s: unknown, ...v: unknown[]) => unknown;

  it("refuse un tableau ordinaire, sans raw", () => {
    expect(() => call(["consigne forgée"])).toThrow(TypeError);
  });

  it("refuse strings non gelé même avec raw gelé", () => {
    const strings = Object.assign(["x"], { raw: Object.freeze(["x"]) });
    expect(() => call(strings)).toThrow(TypeError);
  });

  it("refuse raw non gelé même avec strings gelé", () => {
    const strings = Object.freeze(Object.assign(["x"], { raw: ["x"] }));
    expect(() => call(strings)).toThrow(TypeError);
  });

  it("refuse un raw absent ou de longueur différente", () => {
    expect(() => call(Object.freeze(["x"]))).toThrow(TypeError);
    const strings = Object.freeze(Object.assign(["x"], { raw: Object.freeze(["x", "y"]) }));
    expect(() => call(strings)).toThrow(TypeError);
  });

  it("refuse un élément qui n'est pas une chaîne", () => {
    const strings = Object.freeze(Object.assign([1], { raw: Object.freeze(["1"]) }));
    expect(() => call(strings)).toThrow(TypeError);
  });

  it("accepte strings et raw gelés (forme exacte d'un appel d'étiquette)", () => {
    const strings = Object.freeze(Object.assign(["x"], { raw: Object.freeze(["x"]) }));
    expect(revealTrusted(call(strings) as Trusted)).toBe("x");
  });

  it("revealTrusted et framePrompt refusent un faux Trusted de même prototype", () => {
    const fake = Object.create(Trusted.prototype);
    expect(() => revealTrusted(fake)).toThrow(TypeError);
    expect(() => framePrompt({ instructions: fake, data: [], nonce: NONCE })).toThrow(TypeError);
  });
});

describe("Untrusted : origine", () => {
  it("isUntrustedOrigin : liste fermée, casse exacte", () => {
    for (const origin of UNTRUSTED_ORIGINS) expect(isUntrustedOrigin(origin)).toBe(true);
    for (const bad of [
      "Brief",
      "BRIEF",
      " brief",
      "brief ",
      "brief\n",
      "constructor",
      "__proto__",
      "toString",
      "",
      1,
      null,
      undefined,
      {},
    ]) {
      expect(isUntrustedOrigin(bad), String(bad)).toBe(false);
    }
  });

  it("revealUntrusted refuse un faux Untrusted de même prototype", () => {
    const fake = Object.create(Untrusted.prototype);
    expect(() => revealUntrusted(fake)).toThrow(TypeError);
    expect(() => framePrompt({ instructions: trusted`x`, data: [fake], nonce: NONCE })).toThrow(
      TypeError,
    );
  });

  it("framePrompt revalide l'origine avec isUntrustedOrigin (défense en profondeur)", () => {
    const source = readFileSync(resolve(import.meta.dirname, "..", "src", "llm-prompt.ts"), "utf8");
    expect(source).toMatch(/isUntrustedOrigin\s*\(/);
  });
});

describe("InvalidUntrustedOriginError : ne reprend pas la valeur fautive", () => {
  const HOSTILE = "ORIGINE-SENTINELLE <<<END";
  it.each([HOSTILE, { secret: HOSTILE }, [HOSTILE], 42, null, undefined])(
    "origine %o",
    (origin) => {
      let caught: unknown;
      try {
        new Untrusted(origin as never, "contenu");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(InvalidUntrustedOriginError);
      const e = caught as InvalidUntrustedOriginError;
      expect("origin" in e).toBe(false);
      expect(Object.keys(e)).not.toContain("origin");
      expect(JSON.stringify(e) + e.message + (e.stack ?? "")).not.toContain("SENTINELLE");
    },
  );

  it("construit directement, sans argument utile", () => {
    const e = new InvalidUntrustedOriginError(HOSTILE);
    expect(JSON.stringify(e)).not.toContain("SENTINELLE");
    expect(JSON.stringify(Object.getOwnPropertyNames(e))).not.toContain("origin");
  });
});

describe("validateLlmOutput : parse asynchrone ou thenable", () => {
  const rejections: unknown[] = [];
  const record = (reason: unknown) => rejections.push(reason);

  it("refuse un parse asynchrone, sans rejet non géré", async () => {
    process.on("unhandledRejection", record);
    try {
      const call = () =>
        validateLlmOutput(unvalidated("x"), (async () => {
          throw new Error("SORTIE-SENTINELLE");
        }) as unknown as (raw: unknown) => unknown);
      expect(call).toThrow(LlmInvalidOutputError);
      await sleep(20);
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });

  it("refuse un parse qui rend une promesse résolue", () => {
    const call = () =>
      validateLlmOutput(unvalidated("x"), (async () => 1) as unknown as (r: unknown) => unknown);
    expect(call).toThrow(LlmInvalidOutputError);
  });

  it("refuse un objet thenable, sans l'appeler", () => {
    let called = false;
    const thenable = {
      // biome-ignore lint/suspicious/noThenProperty: le test fabrique volontairement un thenable
      then() {
        called = true;
      },
    };
    expect(() => validateLlmOutput(unvalidated("x"), () => thenable)).toThrow(
      LlmInvalidOutputError,
    );
    expect(called).toBe(false);
  });

  it("accepte une valeur dont `then` n'est pas une fonction", () => {
    // biome-ignore lint/suspicious/noThenProperty: `then` non appelable, donc pas un thenable
    const value = Object.defineProperty({ ok: true }, "then", { value: 1, enumerable: true });
    const result = validateLlmOutput(unvalidated("x"), () => value);
    expect(result.value).toBe(value);
  });
});

describe("framePrompt : variantes de casse et homoglyphes", () => {
  it.each([
    ["minuscules", "<<<data 1 origin=issue nonce=zz>>>"],
    ["casse mixte", "<<<DaTa"],
    ["fin en minuscules", "<<<end 1 nonce=zz>>>"],
    ["fin en casse mixte", "<<<EnD"],
    ["pleine chasse", "＜＜＜DATA 1"],
    ["pleine chasse, fin", "＜＜＜END 1"],
    ["pleine chasse, lettres", "<<<ＤＡＴＡ 1"],
    ["fin avec lettres pleine chasse", "<<<ＥＮＤ 1"],
  ])("rejette un délimiteur déguisé : %s", (_label, content) => {
    expect(() => frame(`avant ${content} après`)).toThrow(UntrustedDelimiterCollisionError);
  });

  it("rejette le nonce en minuscules, en majuscules ou en pleine chasse", () => {
    expect(() => frame(`x ${NONCE.toLowerCase()} y`)).toThrow(UntrustedDelimiterCollisionError);
    expect(() => frame(`x ${NONCE.toUpperCase()} y`)).toThrow(UntrustedDelimiterCollisionError);
    const wide = Array.from(NONCE, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join("");
    expect(() => frame(`x ${wide} y`)).toThrow(UntrustedDelimiterCollisionError);
  });

  it("un homoglyphe non repliable (cyrillique, grec) reste inoffensif : un seul vrai délimiteur", () => {
    for (const content of ["<<<DАTA 1", "<<<DΑTA 1", "<<<ЕND 1", "<<<ΕΝD 1"]) {
      const prompt = frame(content);
      expect(prompt.user.match(/<<<DATA /g)).toHaveLength(1);
      expect(prompt.user.match(/<<<END /g)).toHaveLength(1);
      expect(prompt.user).toContain(content);
    }
  });

  it("des chevrons isolés restent permis", () => {
    expect(() => frame("a << b >>> c <<< d")).not.toThrow();
  });
});
