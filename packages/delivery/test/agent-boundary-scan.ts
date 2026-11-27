/**
 * Scan PUR de la frontière d'exécution (incident 25) : aucune E/S, il travaille sur des textes.
 * Koklo n'exécute aucun agent de code (ADR 0023) : aucun chemin n'est exempté.
 */

export interface SourceFile {
  /** Chemin relatif à la racine du dépôt, séparateur `/`. */
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

/** Toute invocation d'outil d'agent est une violation. */
export const scanAgentBoundary = (files: readonly SourceFile[]): BoundaryViolation[] =>
  files.flatMap((file) =>
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
 * Seuls utilisateurs permis : les aides de test de `packages/db` (docker de test, CLI prisma),
 * sans lien avec un outil d'agent. Toute autre entrée est refusée.
 */
export const CHILD_PROCESS_ALLOWLIST: readonly string[] = [
  "packages/db/src/testing/prisma-cli.ts",
  "packages/db/src/testing/test-database.ts",
];

const CHILD_PROCESS = /["'`](?:node:)?child_process["'`]/;

/** `node:child_process` n'est importé nulle part, hors de la liste blanche. */
export const scanChildProcessImports = (files: readonly SourceFile[]): ImportViolation[] =>
  files
    .filter((file) => !CHILD_PROCESS_ALLOWLIST.includes(file.path))
    .flatMap((file) =>
      file.text
        .split("\n")
        .flatMap((text, index) =>
          CHILD_PROCESS.test(text) ? [{ path: file.path, line: index + 1 }] : [],
        ),
    );

export interface DependencyViolation {
  readonly path: string;
  readonly dependency: string;
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

const AGENT_PACKAGE = /@anthropic-ai\/claude-/;

type Manifest = Partial<Record<(typeof DEPENDENCY_FIELDS)[number], Record<string, string>>>;

/** `nom@version` : un alias `npm:` est vu autant que le nom déclaré. */
const declared = (manifest: Manifest): string[] =>
  DEPENDENCY_FIELDS.flatMap((field) => Object.entries(manifest[field] ?? {})).map(
    ([name, version]) => `${name}@${version}`,
  );

/** Aucun `package.json` (texte JSON) ne déclare un outil d'agent. */
export const scanAgentDependencies = (manifests: readonly SourceFile[]): DependencyViolation[] =>
  manifests.flatMap((file) =>
    declared(JSON.parse(file.text) as Manifest)
      .filter((dependency) => AGENT_PACKAGE.test(dependency))
      .map((dependency) => ({ path: file.path, dependency })),
  );
