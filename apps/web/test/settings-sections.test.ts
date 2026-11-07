import type { Role } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  canOpenSection,
  defaultSection,
  isReadOnlySection,
  SETTINGS_LABELS,
  sectionsOf,
} from "../src/lib/settings-sections.ts";
import { SETTINGS_SECTIONS } from "../src/lib/shell-routes.ts";

/** TK-97 lot B (cas 1, 2) : matrice section x rôle, défaut par rôle, lecture seule. */
describe("sections de Réglages", () => {
  it("cinq sections, dans l'ordre de la navigation", () => {
    expect(SETTINGS_SECTIONS).toEqual(["general", "members", "ai", "github", "account"]);
    expect(SETTINGS_LABELS).toEqual({
      general: "Général",
      members: "Membres",
      ai: "Fournisseurs d'IA",
      github: "GitHub",
      account: "Mon compte",
    });
  });

  it.each([
    ["owner", ["general", "members", "ai", "github", "account"]],
    ["admin", ["general", "members", "ai", "github", "account"]],
    ["dev", ["members", "account"]],
    ["designer", ["members", "account"]],
    ["business", ["members", "account"]],
    ["client", ["account"]],
    [undefined, ["account"]],
  ] as const)("%s : %j", (role, expected) => {
    expect(sectionsOf(role as Role | undefined)).toEqual(expected);
    for (const section of SETTINGS_SECTIONS) {
      expect(canOpenSection(section, role as Role | undefined)).toBe(
        (expected as readonly string[]).includes(section),
      );
    }
  });

  it.each([
    ["owner", "members"],
    ["admin", "members"],
    ["dev", "members"],
    ["designer", "members"],
    ["business", "members"],
    ["client", "account"],
    [undefined, "account"],
  ] as const)("section par défaut de %s : %s", (role, expected) => {
    expect(defaultSection(role as Role | undefined)).toBe(expected);
  });

  it("Membres est en lecture seule hors propriétaire et administrateur, Mon compte jamais", () => {
    expect(isReadOnlySection("members", "owner")).toBe(false);
    expect(isReadOnlySection("members", "admin")).toBe(false);
    for (const role of ["dev", "designer", "business"] as const) {
      expect(isReadOnlySection("members", role)).toBe(true);
    }
    expect(isReadOnlySection("account", "client")).toBe(false);
  });
});
