/** Politique d'outils abstraite par rôle, indépendante de tout runtime (mapping dans l'adaptateur). */
import { AGENT_ROLES, type AgentRole } from "@koklo/rules";
import { InvalidAgentRequestError } from "./agent-errors.ts";

export type AgentShellProfile = "none" | "project-checks";

export interface AgentToolPolicy {
  readonly read: true;
  readonly search: true;
  readonly write: boolean;
  readonly edit: boolean;
  readonly shell: AgentShellProfile;
  /** Chemins relatifs au worktree où l'écriture est permise (vide si `write` et `edit` sont faux). */
  readonly writablePaths: readonly string[];
  readonly network: "none";
  readonly mcp: false;
}

export const AGENT_TOOL_POLICY_KEYS = [
  "read",
  "search",
  "write",
  "edit",
  "shell",
  "writablePaths",
  "network",
  "mcp",
] as const satisfies readonly (keyof AgentToolPolicy)[];

const policy = (
  shell: AgentShellProfile,
  writablePaths: readonly string[],
  writes = true,
): AgentToolPolicy =>
  Object.freeze({
    read: true,
    search: true,
    write: writes,
    edit: writes,
    shell,
    writablePaths: Object.freeze([...writablePaths]),
    network: "none",
    mcp: false,
  });

const READ_ONLY = policy("none", [], false);

/** Politiques de référence : jamais de réseau ni de MCP, écriture bornée au strict nécessaire. */
const ROLE_POLICIES: Readonly<Record<AgentRole, AgentToolPolicy>> = Object.freeze({
  "product-owner": READ_ONLY,
  analyst: READ_ONLY,
  "qa-reviewer": READ_ONLY,
  "tech-lead": READ_ONLY,
  developer: policy("project-checks", ["."]),
  "test-writer": policy("project-checks", ["."]),
  "doc-writer": policy("none", ["docs", "README.md"]),
  designer: policy("none", ["design"]),
});

export const isAgentRole = (value: unknown): value is AgentRole =>
  (AGENT_ROLES as readonly unknown[]).includes(value);

/** Politique de référence d'un rôle (gelée en profondeur) ; rôle inconnu : InvalidAgentRequestError. */
export const toolsForRole = (role: AgentRole): AgentToolPolicy => {
  if (!isAgentRole(role)) {
    throw new InvalidAgentRequestError("role");
  }
  return ROLE_POLICIES[role];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyPolicyKeys = (value: Record<string, unknown>): boolean => {
  const keys = Object.keys(value);
  return (
    keys.length === AGENT_TOOL_POLICY_KEYS.length &&
    keys.every((key) => (AGENT_TOOL_POLICY_KEYS as readonly string[]).includes(key))
  );
};

const SAFE_PATH_CHARS = /^[A-Za-z0-9._/-]+$/;

const isSafeSegment = (segment: string): boolean =>
  segment !== "" &&
  segment !== "." &&
  segment !== ".." &&
  !segment.startsWith("-") &&
  !segment.startsWith("~");

/**
 * Chemin relatif sûr pour une règle d'outil : uniquement `[A-Za-z0-9._/-]` (ni glob, ni
 * parenthèse, ni virgule, ni espace), sans segment vide, `.`, `..`, ni commençant par `-` ou `~`.
 * `.` seul désigne le worktree. Limite : un lien symbolique commité (`docs -> /etc`) n'est pas
 * détectable ici ; le CLI suit le lien (voir ADR 0014).
 */
export const isSafeRelativePath = (path: unknown): path is string =>
  typeof path === "string" &&
  SAFE_PATH_CHARS.test(path) &&
  (path === "." || path.split("/").every(isSafeSegment));

const isUnder = (path: string, root: string): boolean =>
  root === "." || path === root || path.startsWith(`${root}/`);

const SHELL_RANK: Readonly<Record<AgentShellProfile, number>> = { none: 0, "project-checks": 1 };

const isShell = (value: unknown): value is AgentShellProfile =>
  value === "none" || value === "project-checks";

/** `value` n'accorde pas plus que `limit` (un booléen vrai exige un plafond vrai). */
const withinFlag = (value: unknown, limit: boolean): value is boolean =>
  typeof value === "boolean" && (!value || limit);

const withinPaths = (paths: unknown, reference: AgentToolPolicy, canWrite: boolean) =>
  Array.isArray(paths) &&
  (canWrite || paths.length === 0) &&
  paths.every(
    (path) => isSafeRelativePath(path) && reference.writablePaths.some((r) => isUnder(path, r)),
  );

/**
 * Copie gelée de `candidate`, lue une seule fois par champ, si elle n'accorde rien de plus que
 * la politique du rôle et n'a aucune clé inconnue ou manquante ; sinon `undefined`.
 */
export const snapshotToolPolicy = (
  role: AgentRole,
  candidate: unknown,
): AgentToolPolicy | undefined => {
  if (!isAgentRole(role) || !isRecord(candidate) || !hasOnlyPolicyKeys(candidate)) {
    return undefined;
  }
  const reference = ROLE_POLICIES[role];
  const { read, search, write, edit, shell, writablePaths, network, mcp } = candidate;
  const paths = Array.isArray(writablePaths) ? [...writablePaths] : writablePaths;
  const ok =
    read === true &&
    search === true &&
    network === "none" &&
    mcp === false &&
    withinFlag(write, reference.write) &&
    withinFlag(edit, reference.edit) &&
    isShell(shell) &&
    SHELL_RANK[shell] <= SHELL_RANK[reference.shell] &&
    withinPaths(paths, reference, write === true || edit === true);
  if (!ok) {
    return undefined;
  }
  return Object.freeze({
    read,
    search,
    write,
    edit,
    shell,
    writablePaths: Object.freeze(paths as string[]),
    network,
    mcp,
  }) as AgentToolPolicy;
};

/** Vrai si `policy` n'accorde rien de plus que `toolsForRole(role)` et n'a aucune clé inconnue. */
export const isWithinRolePolicy = (role: AgentRole, policy: unknown): boolean =>
  snapshotToolPolicy(role, policy) !== undefined;
