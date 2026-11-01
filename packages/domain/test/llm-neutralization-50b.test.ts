import { describe, expect, it } from "vitest";
import { framePrompt, trusted, Untrusted } from "../src/index.ts";
import { NONCE } from "./llm-helpers.ts";

/** TK-50b : neutralisation étendue (revue 50a, point 4) vers U+FFFD. */
const userOf = (content: string) =>
  framePrompt({
    instructions: trusted`Résume.`,
    data: [new Untrusted("brief", content)],
    nonce: NONCE,
  }).user;

const EXTRA: readonly (readonly [string, number])[] = [
  ["U+2028 séparateur de ligne", 0x2028],
  ["U+2029 séparateur de paragraphe", 0x2029],
  ["U+2060 word joiner", 0x2060],
  ["U+2061", 0x2061],
  ["U+2062", 0x2062],
  ["U+2063", 0x2063],
  ["U+2064", 0x2064],
  ["U+FEFF BOM", 0xfeff],
  ["U+00AD trait d'union conditionnel", 0x00ad],
  ["U+E0000 tag", 0xe0000],
  ["U+E0041 tag lettre", 0xe0041],
  ["U+E007F tag annulation", 0xe007f],
];

describe("framePrompt : neutralisation étendue", () => {
  it.each(EXTRA)("remplace %s par U+FFFD", (_label, code) => {
    const user = userOf(`a${String.fromCodePoint(code)}b`);
    expect(user).toContain("a�b");
    expect(user).not.toContain(String.fromCodePoint(code));
  });

  it("garde les caractères voisins des plages (U+2027, U+202F, U+2065, U+E0080, U+00AE)", () => {
    for (const code of [0x2027, 0x202f, 0x2065, 0xe0080, 0x00ae]) {
      expect(userOf(`a${String.fromCodePoint(code)}b`)).toContain(
        `a${String.fromCodePoint(code)}b`,
      );
    }
  });

  it("garde \\n et \\t, neutralise \\r", () => {
    expect(userOf("a\n\tb")).toContain("a\n\tb");
    expect(userOf("a\rb")).toContain("a�b");
  });
});
