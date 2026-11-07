import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TK-96 (garde) : le projet « par défaut » (plus ancien projet de l'organisation) ne revient pas.
 * Toute procédure de pilotage reçoit `projectId` en entrée et passe par `inProject`. Cette garde lit
 * les sources de `src/` : ni le contexte de projet, ni son jeton, ni les aides `scopeOf` / `inScope`
 * ne doivent subsister.
 */
const SRC = join(import.meta.dirname, "..", "src");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const FORBIDDEN = [
  "OldestProjectContext",
  "PROJECT_CONTEXT",
  "ProjectContext",
  /\bscopeOf\b/,
  /\binScope\b/,
];

describe("retrait du contexte de projet implicite (TK-96)", () => {
  it("le fichier project-context.ts n'existe plus", () => {
    expect(existsSync(join(SRC, "project", "project-context.ts"))).toBe(false);
  });

  it("la garde lit bien des sources (elle ne couvre pas du vide)", () => {
    expect(sources(SRC).length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN.map((f) => [String(f), f] as const))(
    "aucune source de src/ ne contient %s",
    (_label, pattern) => {
      const offenders = sources(SRC).filter((file) => {
        const text = readFileSync(file, "utf8");
        return typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
      });
      expect(offenders).toEqual([]);
    },
  );

  it("les sept contrôleurs de pilotage résolvent le projet depuis l'entrée (inProject)", () => {
    const controllers = [
      "ticket/ticket.controller.ts",
      "ticket/dependency.controller.ts",
      "sprint/sprint.controller.ts",
      "comment/comment.controller.ts",
      "project-state/project-state.controller.ts",
      "lease/lease.controller.ts",
      "audit/audit.controller.ts",
    ];
    for (const file of controllers) {
      const text = readFileSync(join(SRC, file), "utf8");
      const projectArgs = [...text.matchAll(/inProject\(\s*request,\s*errors,\s*([\w.]+)/g)].map(
        (m) => m[1],
      );
      const handlers = [...text.matchAll(/@Implement\(/g)].length;
      expect(projectArgs, file).toHaveLength(handlers);
      for (const arg of projectArgs) expect(["input.projectId", "projectId"], file).toContain(arg);
    }
  });
});
