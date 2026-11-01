import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";
import domainVitestConfig, { domainCoverageThresholds } from "../vitest.config.ts";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");
const FILES = [
  "errors.ts",
  "index.ts",
  "ticket-counters.ts",
  "ticket-key.ts",
  "ticket-package.ts",
  "ticket-sensitivity.ts",
  "ticket-status.ts",
  "ticket-transitions.ts",
  "ticket.ts",
];
const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);
const ALLOWED_EXTERNAL = new Set(["@koklo/contract", "@koklo/config"]);

describe("F1 pureté des imports de src", () => {
  it("contient les 9 fichiers attendus", () => {
    expect(readdirSync(srcDir).sort()).toEqual(expect.arrayContaining(FILES));
  });

  it("n'importe que du relatif ou @koklo/contract | @koklo/config (ni Prisma, Nest, Octokit, fs, node:*)", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const spec of importsOf(readFileSync(resolve(srcDir, file), "utf8"))) {
        const ok = spec.startsWith("./") || ALLOWED_EXTERNAL.has(spec);
        expect(ok, `${file} importe « ${spec} »`).toBe(true);
      }
    }
  });
});

describe("API publique du marquage des données non fiables (TK-50a)", () => {
  it("exporte les noms du marquage, du cadrage et de la validation", () => {
    for (const name of [
      "UNTRUSTED_ORIGINS",
      "Untrusted",
      "revealUntrusted",
      "Trusted",
      "trusted",
      "revealTrusted",
      "UNTRUSTED_DATA_POLICY",
      "FramedPrompt",
      "framePrompt",
      "unvalidated",
      "validateLlmOutput",
      "LlmInvalidOutputError",
    ]) {
      expect(domain, name).toHaveProperty(name);
    }
  });
});

describe("F2 package.json et étiquette", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  it("n'a aucune dépendance d'exécution tierce", () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.filter((d) => !ALLOWED_EXTERNAL.has(d))).toEqual([]);
  });
  it("porte l'étiquette domain", () => {
    const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
    expect(turbo.tags).toEqual(["domain"]);
  });
});

describe("CA2.c seuils de couverture", () => {
  it("fixe branches 90 et lignes 80", () => {
    expect(domainCoverageThresholds).toEqual({ lines: 80, branches: 90 });
    const thresholds = (domainVitestConfig as { test?: { coverage?: { thresholds?: unknown } } })
      .test?.coverage?.thresholds;
    expect(thresholds).toMatchObject({ lines: 80, branches: 90 });
  });
});

describe("API publique", () => {
  it("exporte les points d'entrée du contrat", () => {
    for (const name of [
      "TICKET_STATUSES",
      "isTicketStatus",
      "canTransition",
      "transitionTicket",
      "formatTicketKey",
      "parseTicketKey",
      "nextTicketKey",
      "assertUniqueKeys",
      "TICKET_PACKAGES",
      "parseTicketPackage",
      "pkgFromLabels",
      "SENSITIVITIES",
      "requiresHumanApproval",
      "recordAttempt",
      "recordReviewRound",
      "escalate",
      "createTicket",
      "InvalidTicketTransitionError",
      "InvalidTicketStatusError",
      "InvalidTicketKeyError",
      "DuplicateTicketKeyError",
      "TicketPackageError",
      "InvalidSensitivityError",
      "CounterLimitReachedError",
      "InvalidTicketError",
    ]) {
      expect(domain, name).toHaveProperty(name);
    }
  });
});
