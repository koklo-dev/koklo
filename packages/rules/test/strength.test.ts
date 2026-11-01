import { describe, expect, it } from "vitest";
import { isWeaker, type Strength } from "../src/index.ts";

const gate: Strength["enforcement"] = { kind: "gate", adapter: "a" };
const evidence: Strength["enforcement"] = { kind: "evidence", evidence: "x" };
const instruction: Strength["enforcement"] = { kind: "instruction" };
const s = (severity: Strength["severity"], enforcement: Strength["enforcement"]): Strength => ({
  severity,
  enforcement,
});

describe("isWeaker (D7 : gate > evidence > instruction ; blocking > advisory)", () => {
  it.each([
    ["blocking gate -> blocking evidence", s("blocking", gate), s("blocking", evidence), true],
    [
      "blocking evidence -> blocking instruction",
      s("blocking", evidence),
      s("blocking", instruction),
      true,
    ],
    [
      "blocking gate -> blocking instruction",
      s("blocking", gate),
      s("blocking", instruction),
      true,
    ],
    ["blocking -> advisory (même enforcement)", s("blocking", gate), s("advisory", gate), true],
    ["blocking gate -> advisory gate", s("blocking", evidence), s("advisory", evidence), true],
    ["un axe plus faible suffit", s("blocking", gate), s("blocking", instruction), true],
    [
      "advisory instruction -> blocking gate (durcir)",
      s("advisory", instruction),
      s("blocking", gate),
      false,
    ],
    ["advisory -> blocking", s("advisory", gate), s("blocking", gate), false],
    ["identique", s("blocking", gate), s("blocking", gate), false],
    [
      "gate -> gate, autre adapter",
      s("blocking", gate),
      s("blocking", { kind: "gate", adapter: "b" }),
      false,
    ],
    ["durcit un axe, affaiblit l'autre", s("advisory", gate), s("blocking", instruction), true],
  ])("%s", (_n, from, to, expected) => {
    expect(isWeaker(from, to)).toBe(expected);
  });
});
