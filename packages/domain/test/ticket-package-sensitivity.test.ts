import { describe, expect, it } from "vitest";
import {
  InvalidSensitivityError,
  isSensitivity,
  parseSensitivity,
  parseTicketPackage,
  pkgFromLabels,
  requiresHumanApproval,
  SENSITIVITIES,
  TICKET_PACKAGES,
  TicketPackageError,
} from "../src/index.ts";

const FIFTEEN = [
  "web",
  "api",
  "worker",
  "contract",
  "db",
  "domain",
  "schema",
  "github",
  "rules",
  "delivery",
  "cli",
  "ui",
  "config",
  "e2e",
  "infra",
];

describe("P1 paquet", () => {
  it("liste fermée des 15 paquets", () => {
    expect([...TICKET_PACKAGES].sort()).toEqual([...FIFTEEN].sort());
  });

  it.each(FIFTEEN)("accepte %s", (pkg) => {
    expect(parseTicketPackage(pkg)).toBe(pkg);
  });

  it("distingue inconnu, plusieurs et aucun", () => {
    const reason = (value: unknown) => {
      try {
        parseTicketPackage(value);
      } catch (error) {
        expect(error).toBeInstanceOf(TicketPackageError);
        return (error as TicketPackageError).reason;
      }
      return "ok";
    };
    for (const v of ["mobile", "Web", "pkg:web", 3, null]) expect(reason(v)).toBe("unknown");
    for (const v of ["web,api", ["web", "api"]]) expect(reason(v)).toBe("multiple");
    for (const v of [[], "", undefined]) expect(reason(v)).toBe("none");
  });
});

describe("P2 extraction depuis les étiquettes", () => {
  it("extrait l'unique pkg:*", () => {
    expect(pkgFromLabels(["pkg:web", "safe"])).toBe("web");
  });
  it("refuse plusieurs pkg:*", () => {
    expect(() => pkgFromLabels(["pkg:web", "pkg:api"])).toThrow(
      expect.objectContaining({ reason: "multiple" }),
    );
  });
  it("refuse aucun pkg:*", () => {
    expect(() => pkgFromLabels(["safe"])).toThrow(expect.objectContaining({ reason: "none" }));
  });
  it("refuse un pkg:* inconnu", () => {
    expect(() => pkgFromLabels(["pkg:mobile"])).toThrow(
      expect.objectContaining({ reason: "unknown" }),
    );
  });
});

describe("S1 S2 sensibilité", () => {
  it("liste fermée safe | sensitive", () => {
    expect([...SENSITIVITIES]).toEqual(["safe", "sensitive"]);
    expect(isSensitivity("safe")).toBe(true);
    expect(isSensitivity("sensitive")).toBe(true);
    for (const bad of ["Safe", "", "unsafe", undefined, null])
      expect(isSensitivity(bad)).toBe(false);
  });
  it("parseSensitivity refuse toute autre valeur", () => {
    expect(parseSensitivity("safe")).toBe("safe");
    expect(() => parseSensitivity("critical")).toThrow(InvalidSensitivityError);
    expect(() => parseSensitivity(undefined)).toThrow(InvalidSensitivityError);
  });
  it("requiresHumanApproval : sensitive vrai, safe faux", () => {
    expect(requiresHumanApproval("sensitive")).toBe(true);
    expect(requiresHumanApproval("safe")).toBe(false);
  });
});
