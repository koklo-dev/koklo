import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as delivery from "../src/index.ts";
import deliveryVitestConfig, { deliveryCoverageThresholds } from "../vitest.config.ts";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");
/** La machine d'étapes pure, et rien d'autre : Koklo n'exécute aucun agent (ADR 0023). */
const FILES = [
  "block-cause.ts",
  "errors.ts",
  "index.ts",
  "one-of.ts",
  "run-counters.ts",
  "run-effects.ts",
  "run-event-check.ts",
  "run-event.ts",
  "run-resume.ts",
  "run-state.ts",
  "run-transitions.ts",
  "run.ts",
  "value-check.ts",
];
const sources = () =>
  readdirSync(srcDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, text: readFileSync(resolve(srcDir, file), "utf8") }));
const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);

const OPENER = /(=>\s*\{|\bfunction\b[^{]*\{|^\s*\w+\s*\([^)]*\)\s*(?::[^{]+)?\{)\s*$/;

const braceDelta = (line: string): number =>
  [...line].reduce((sum, ch) => sum + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0);

/** Longueur (en lignes) du corps de fonction qui s'ouvre à la ligne `start`. */
const bodyLength = (lines: string[], start: number): number => {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    depth += braceDelta(lines[i] as string);
    if (depth <= 0) return i - start + 1;
  }
  return lines.length - start;
};

const functionLengths = (text: string): number[] => {
  const lines = text.split("\n");
  return lines.flatMap((line, start) => (OPENER.test(line) ? [bodyLength(lines, start)] : []));
};

describe("pureté de packages/delivery", () => {
  it("src/ contient exactement les fichiers de la machine, sans sous-dossier", () => {
    expect(readdirSync(srcDir).sort()).toEqual(FILES);
  });

  it("n'importe que du relatif (ni paquet, ni node:*)", () => {
    for (const { file, text } of sources()) {
      for (const spec of importsOf(text)) {
        expect(spec.startsWith("./"), `${file} importe « ${spec} »`).toBe(true);
      }
    }
  });

  it("n'utilise ni horloge, ni aléa, ni I/O, ni variables d'environnement", () => {
    const forbidden =
      /\b(Date\.now|new Date|Math\.random|crypto\.|randomUUID|process\.|setTimeout|setInterval|fetch\(|performance\.now|require\()/;
    for (const { file, text } of sources()) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(forbidden.test(code), `${file} utilise une API impure`).toBe(false);
    }
  });

  it("garde chaque fichier à 300 lignes au plus et chaque fonction à 50 lignes au plus", () => {
    for (const { file, text } of sources()) {
      expect(text.split("\n").length, `${file} dépasse 300 lignes`).toBeLessThanOrEqual(300);
      for (const length of functionLengths(text)) {
        expect(length, `${file} : fonction de ${length} lignes`).toBeLessThanOrEqual(50);
      }
    }
  });
});

const PUBLIC_API: readonly string[] = [
  "RUN_STATES",
  "isRunState",
  "isTerminal",
  "BLOCK_CAUSES",
  "isBlockCause",
  "createBlock",
  "RUN_EVENT_TYPES",
  "startRun",
  "applyEvent",
  "canApply",
  "allowedEvents",
  "resumePoint",
  "canRestartDevelopment",
  "InvalidRunStateError",
  "InvalidRunEventError",
  "InvalidRunTransitionError",
  "StaleRunError",
  "ResumeRequiredError",
];

describe("pureté de packages/delivery : API", () => {
  it("exporte exactement l'API de la machine", () => {
    expect(Object.keys(delivery).sort()).toEqual([...PUBLIC_API].sort());
  });
});

describe("package.json, étiquette et seuils", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

  it("n'a aucune dépendance à l'exécution", () => {
    expect(pkg).not.toHaveProperty("dependencies");
  });

  it("n'exporte que « . »", () => {
    expect(pkg.exports).toEqual({
      ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    });
  });

  it("porte l'étiquette delivery", () => {
    const turbo = JSON.parse(readFileSync(resolve(root, "turbo.json"), "utf8"));
    expect(turbo.tags).toEqual(["delivery"]);
  });

  it("fixe la couverture à branches 90 et lignes 80 (CDC §19.2)", () => {
    expect(deliveryCoverageThresholds).toEqual({ lines: 80, branches: 90 });
    const thresholds = (deliveryVitestConfig as { test?: { coverage?: { thresholds?: unknown } } })
      .test?.coverage?.thresholds;
    expect(thresholds).toMatchObject({ lines: 80, branches: 90 });
  });
});
