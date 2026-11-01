/** Scan PUR de la frontiere AgentRuntime (incident 25) : aucune E/S, il travaille sur des textes. */

/** Seul endroit autorise a invoquer un outil d'agent. */
export const ADAPTER_PREFIX = "packages/delivery/src/claude-code/";

export interface SourceFile {
  /** Chemin relatif a la racine du depot, separateur `/`. */
  readonly path: string;
  readonly text: string;
}

export interface BoundaryViolation {
  readonly path: string;
  readonly line: number;
  readonly rule: string;
}

const RULES: readonly (readonly [string, RegExp])[] = [
  [
    "claude-binary-spawn",
    /\b(?:spawn|exec|execFile|execSync|execFileSync|fork)\w*\(\s*["'`]claude["'`]/,
  ],
  ["claude-binary-argv", /["'`]claude["'`]\s*,\s*\[/],
  ["claude-cli-print", /\bclaude\s+-p\b/],
  ["agent-sdk", /@anthropic-ai\/claude-/],
  ["allowed-tools-flag", /--(?:allowedTools|disallowedTools|allowed-tools|disallowed-tools)\b/],
  ["stream-json", /stream-json/],
  ["skip-permissions", /--(?:allow-)?dangerously-skip-permissions/],
  ["french-entry-point", /\blancerSession\b/],
];

/** Toute invocation d'outil d'agent hors de l'adaptateur est une violation. */
export const scanAgentBoundary = (files: readonly SourceFile[]): BoundaryViolation[] =>
  files
    .filter((file) => !file.path.startsWith(ADAPTER_PREFIX))
    .flatMap((file) =>
      file.text.split("\n").flatMap((text, index) =>
        RULES.filter(([, pattern]) => pattern.test(text)).map(([rule]) => ({
          path: file.path,
          line: index + 1,
          rule,
        })),
      ),
    );

export interface ImportViolation {
  readonly path: string;
  readonly line: number;
}

/**
 * Seuls utilisateurs existants hors de l'adaptateur : les aides de test de `packages/db`
 * (docker de test, CLI prisma), sans lien avec un outil d'agent. Toute autre entree est refusee.
 */
export const CHILD_PROCESS_ALLOWLIST: readonly string[] = [
  "packages/db/src/testing/prisma-cli.ts",
  "packages/db/src/testing/test-database.ts",
];

const CHILD_PROCESS = /["'`](?:node:)?child_process["'`]/;

/** `node:child_process` n'est importe nulle part hors de l'adaptateur (liste blanche vide ailleurs). */
export const scanChildProcessImports = (files: readonly SourceFile[]): ImportViolation[] =>
  files
    .filter((file) => !file.path.startsWith(ADAPTER_PREFIX))
    .filter((file) => !CHILD_PROCESS_ALLOWLIST.includes(file.path))
    .flatMap((file) =>
      file.text
        .split("\n")
        .flatMap((text, index) =>
          CHILD_PROCESS.test(text) ? [{ path: file.path, line: index + 1 }] : [],
        ),
    );
