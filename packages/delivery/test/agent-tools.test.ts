import { AGENT_ROLES, type AgentRole } from "@koklo/rules";
import { describe, expect, it } from "vitest";
import {
  AGENT_TOOL_POLICY_KEYS,
  InvalidAgentRequestError,
  isWithinRolePolicy,
  toolsForRole,
} from "../src/index.ts";
import { thrownBy } from "./agent-helpers.ts";

const READ_ONLY: AgentRole[] = ["product-owner", "analyst", "qa-reviewer", "tech-lead"];
const WRITERS: AgentRole[] = ["designer", "test-writer", "developer", "doc-writer"];

describe("toolsForRole", () => {
  it("couvre tous les roles de @koklo/rules", () => {
    expect([...READ_ONLY, ...WRITERS].sort()).toEqual([...AGENT_ROLES].sort());
  });

  it("fixe les cles de la politique (aucune option dangereuse representable)", () => {
    expect([...AGENT_TOOL_POLICY_KEYS].sort()).toEqual(
      ["edit", "mcp", "network", "read", "search", "shell", "write", "writablePaths"].sort(),
    );
  });

  it.each(READ_ONLY)("%s est en lecture seule", (role) => {
    expect(toolsForRole(role)).toEqual({
      read: true,
      search: true,
      write: false,
      edit: false,
      shell: "none",
      writablePaths: [],
      network: "none",
      mcp: false,
    });
  });

  it("le developpeur ecrit dans tout le worktree avec un shell borne", () => {
    expect(toolsForRole("developer")).toEqual({
      read: true,
      search: true,
      write: true,
      edit: true,
      shell: "project-checks",
      writablePaths: ["."],
      network: "none",
      mcp: false,
    });
  });

  it("la redaction ecrit seulement dans docs/ et README.md, sans shell", () => {
    expect(toolsForRole("doc-writer")).toMatchObject({
      write: true,
      edit: true,
      shell: "none",
      writablePaths: ["docs", "README.md"],
    });
  });

  it("le designer n'ecrit que dans design/, sans shell", () => {
    expect(toolsForRole("designer")).toMatchObject({
      write: true,
      shell: "none",
      writablePaths: ["design"],
    });
  });
});

describe("toolsForRole : invariants", () => {
  it.each([...AGENT_ROLES])("%s : jamais de reseau, de MCP ni de chemin hors worktree", (role) => {
    const policy = toolsForRole(role);
    expect(policy.network).toBe("none");
    expect(policy.mcp).toBe(false);
    for (const path of policy.writablePaths) {
      expect(path.startsWith("/")).toBe(false);
      expect(path.split("/")).not.toContain("..");
    }
    if (!policy.write && !policy.edit) {
      expect(policy.writablePaths).toEqual([]);
    }
  });

  it("retourne une valeur gelee en profondeur et stable", () => {
    const policy = toolsForRole("developer");
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.writablePaths)).toBe(true);
    expect(toolsForRole("developer")).toEqual(policy);
    expect(() => {
      (policy as { write: boolean }).write = false;
    }).toThrow(TypeError);
  });

  it("refuse un role inconnu avec une erreur typee", () => {
    const error = thrownBy(() => toolsForRole("root" as AgentRole));
    expect(error).toBeInstanceOf(InvalidAgentRequestError);
    expect((error as InvalidAgentRequestError).reason).toBe("role");
  });
});

describe("isWithinRolePolicy", () => {
  it("accepte la politique du role et toute restriction", () => {
    expect(isWithinRolePolicy("developer", toolsForRole("developer"))).toBe(true);
    expect(
      isWithinRolePolicy("developer", { ...toolsForRole("developer"), edit: false, shell: "none" }),
    ).toBe(true);
    expect(isWithinRolePolicy("qa-reviewer", toolsForRole("qa-reviewer"))).toBe(true);
  });

  it("refuse tout depassement du role", () => {
    const reviewer = toolsForRole("qa-reviewer");
    for (const extra of [
      { write: true },
      { edit: true },
      { shell: "project-checks" },
      { writablePaths: ["docs"] },
      { network: "allowlist" },
      { mcp: true },
      { dangerouslySkipPermissions: true },
    ]) {
      expect(
        isWithinRolePolicy("qa-reviewer", { ...reviewer, ...extra }),
        JSON.stringify(extra),
      ).toBe(false);
    }
    expect(
      isWithinRolePolicy("doc-writer", { ...toolsForRole("doc-writer"), writablePaths: ["src"] }),
    ).toBe(false);
  });

  it.each([undefined, null, "all", 5, []])("refuse %j", (value) => {
    expect(isWithinRolePolicy("developer", value)).toBe(false);
  });
});

describe("isWithinRolePolicy : chemins hostiles (injection de regle)", () => {
  const HOSTILE = [
    "docs/x),Bash(*",
    "docs/x,Bash",
    "docs/**",
    "docs/*",
    "docs/{a,b}",
    "docs/x y",
    "docs/x)",
    "docs/(x",
    "docs/~/x",
    "docs/-rf",
    "docs/\nBash",
    "docs/x\u0000",
    "docs/a:b",
    "docs/[a]",
    "docs/?x",
    "docs/x!",
    "docs/x#y",
    "docs/x$y",
    "docs/x\\y",
    "docs/é",
    "docs/",
  ];

  it.each(HOSTILE)("refuse %j pour doc-writer", (path) => {
    const policy = { ...toolsForRole("doc-writer"), writablePaths: [path] };
    expect(isWithinRolePolicy("doc-writer", policy)).toBe(false);
  });

  it.each(["~/docs", "-docs", "docs/~x", "docs/-x"])("refuse un segment en ~ ou - : %s", (path) => {
    const policy = { ...toolsForRole("developer"), writablePaths: [path] };
    expect(isWithinRolePolicy("developer", policy)).toBe(false);
  });

  it("accepte les chemins ordinaires", () => {
    for (const path of ["docs", "docs/guide", "docs/a.b_c-d/e.md", "README.md"]) {
      const policy = { ...toolsForRole("doc-writer"), writablePaths: [path] };
      expect(isWithinRolePolicy("doc-writer", policy), path).toBe(true);
    }
  });
});
