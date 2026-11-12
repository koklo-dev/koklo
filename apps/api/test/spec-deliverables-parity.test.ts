import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DELIVERABLE_KEYS } from "@koklo/contract";
import { DELIVERABLE_DEPENDENCIES, deliverablesAvailabilityOf } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { DELIVERABLE_FORCE_ROLES } from "../src/auth/roles.ts";

/**
 * TK-100 lot A : la constante `DELIVERABLE_KEYS` du contrat est la seule liste ordonnée des sept livrables. Le domaine
 * (qui n'importe pas le contrat) en porte les clés dans le graphe B1 : même ensemble, même ordre. Aucune copie locale
 * dans l'API (les anciens `ORDER` de la coquille et de la vue d'ensemble sont supprimés).
 */
const SRC = resolve(import.meta.dirname, "../src");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return path.endsWith(".ts") ? [path] : [];
  });

describe("parité contrat <-> domaine des livrables", () => {
  it("le graphe du domaine porte les mêmes clés, dans le même ordre, que DELIVERABLE_KEYS", () => {
    expect(Object.keys(DELIVERABLE_DEPENDENCIES)).toEqual([...DELIVERABLE_KEYS]);
  });

  it("la disponibilité du domaine sort les sept clés dans l'ordre du contrat", () => {
    const statuses = Object.fromEntries(DELIVERABLE_KEYS.map((key) => [key, "todo"]));
    const result = deliverablesAvailabilityOf({
      ideaFrozen: false,
      functionalHasEntity: false,
      statuses: statuses as never,
      forced: [],
    });
    expect(result.map((entry) => entry.key)).toEqual([...DELIVERABLE_KEYS]);
  });

  it("aucune copie de la liste ordonnée dans les sources de l'API (ORDER supprimés)", () => {
    const copy = /["']functional["']\s*,\s*["']data["']\s*,\s*["']architecture["']/;
    const offenders = files(SRC)
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) => copy.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});

describe("rôles du forçage", () => {
  it("DELIVERABLE_FORCE_ROLES : owner et admin seulement", () => {
    expect([...DELIVERABLE_FORCE_ROLES]).toEqual(["owner", "admin"]);
  });
});
