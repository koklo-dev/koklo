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
