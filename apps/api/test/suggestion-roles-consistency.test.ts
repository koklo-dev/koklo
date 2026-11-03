import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUGGESTION_CREATE_ROLES,
  SUGGESTION_DECIDE_ROLES,
  SUGGESTION_READ_ROLES,
} from "../src/auth/roles.ts";

/**
 * TK-55c : cohérence des constantes de rôles avec le contrôleur `suggestion` (calqué sur
 * `llm-credential-roles-consistency`), et garde structurelle : accept/reject sont des décisions
 * d'une session humaine seulement, aucun garde par jeton (agent, runner) n'y est monté.
 */
const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../src", path), "utf8");
const CONTROLLER = "suggestion/suggestion.controller.ts";

const sorted = (roles: readonly string[]) => [...roles].sort();

describe("constantes de rôles des procédures suggestion.*", () => {
  it("SUGGESTION_CREATE_ROLES : owner, admin, dev, designer, client (le business lit seulement)", () => {
    expect(sorted(SUGGESTION_CREATE_ROLES)).toEqual(
      ["admin", "client", "designer", "dev", "owner"].sort(),
    );
  });

  it("SUGGESTION_DECIDE_ROLES : owner, admin, dev (D4 : designer et client exclus)", () => {
    expect(sorted(SUGGESTION_DECIDE_ROLES)).toEqual(["admin", "dev", "owner"]);
  });

  it("SUGGESTION_READ_ROLES : les six rôles (le client est cloisonné par projet, pas par rôle)", () => {
    expect(sorted(SUGGESTION_READ_ROLES)).toEqual(
      ["admin", "business", "client", "designer", "dev", "owner"].sort(),
    );
  });
});

describe("décorateurs du contrôleur", () => {
  const decorators = (name: string) => {
    const source = read(CONTROLLER);
    const at = source.indexOf(`@Implement(contract.suggestion.${name})`);
    expect(at, `@Implement(contract.suggestion.${name}) absent du contrôleur`).toBeGreaterThan(-1);
    return source.slice(Math.max(0, at - 200), at);
  };

  it.each([
    ["create", "SUGGESTION_CREATE_ROLES"],
    ["withdraw", "SUGGESTION_CREATE_ROLES"],
    ["list", "SUGGESTION_READ_ROLES"],
    ["accept", "SUGGESTION_DECIDE_ROLES"],
    ["reject", "SUGGESTION_DECIDE_ROLES"],
  ])("%s : session, garde de rôle et %s", (name, constant) => {
    const before = decorators(name);
    expect(before).toContain("@UseGuards(SessionGuard, RoleGuard)");
    expect(before).toContain(`@Roles(...${constant})`);
  });

  it("aucun rôle nommé en dur, cinq gardes de rôle, cloisonnement central injecté", () => {
    const source = read(CONTROLLER);
    expect(source.match(/@Roles\(/g) ?? []).toHaveLength(5);
    expect(source).not.toMatch(/@Roles\(\s*"/);
    expect(source).toContain("PROJECT_ACCESS");
  });
});

describe("garde structurelle : décisions humaines seulement", () => {
  it("le contrôleur n'utilise que SessionGuard et RoleGuard (aucun garde par jeton)", () => {
    const guards = new Set(read(CONTROLLER).match(/\b\w*Guard\b/g) ?? []);
    expect([...guards].sort()).toEqual(["RoleGuard", "SessionGuard"]);
  });

  it("le module n'exporte pas le service : aucun autre module n'appelle accept ni reject", () => {
    const module = read("suggestion/suggestion.module.ts");
    expect(module).not.toMatch(/exports:\s*\[[^\]]*Suggestion/);
  });
});

describe("émetteur de notifications unique", () => {
  it("le module de notification exporte NotificationEmitter", () => {
    expect(read("notification/notification.module.ts")).toMatch(
      /exports:\s*\[[^\]]*NotificationEmitter/,
    );
  });

  it("seul le dossier notification écrit dans la table des notifications", () => {
    const sources = [
      "suggestion/suggestion.service.ts",
      "suggestion/prisma-suggestion.repository.ts",
    ];
    for (const file of sources) {
      expect(existsSync(resolve(import.meta.dirname, "../src", file)), `${file} manquant`).toBe(
        true,
      );
      const source = read(file);
      expect(source, file).not.toMatch(/\.notification\.(create|createMany|upsert|update)/);
      expect(source, file).toContain("NotificationEmitter");
    }
  });
});
