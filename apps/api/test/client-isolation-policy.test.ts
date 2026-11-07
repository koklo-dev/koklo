import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import {
  MANAGER_ROLES,
  PROJECT_CLIENT_ROLES,
  SPEC_READ_ROLES,
  STAFF_ROLES,
} from "../src/auth/roles.ts";
import type { AuthSession } from "../src/auth/session.ts";
import { isProjectScoped, type ProjectAccess } from "../src/project/project-access.ts";
import { inProject } from "../src/tracker/scope.ts";

/**
 * TK-55a : politique de cloisonnement, sans base. `isProjectScoped` est la règle FAIL-CLOSED
 * (rôle absent ou inconnu = cloisonné) ; `inProject` (point d'étranglement des procédures de
 * projet, TK-96 : plus de contexte de projet implicite) consulte le `ProjectAccess` avant tout travail.
 */
const PROJECT = "01900000-0000-7000-8000-0000000000aa";
const ORG = "01900000-0000-7000-8000-0000000000bb";
const USER = "01900000-0000-7000-8000-0000000000cc";

describe("constantes de rôles (TK-55a)", () => {
  it("STAFF_ROLES : les cinq rôles non client, liste fermée", () => {
    expect([...STAFF_ROLES].sort()).toEqual(["admin", "business", "designer", "dev", "owner"]);
  });

  it("PROJECT_CLIENT_ROLES = MANAGER_ROLES ; SPEC_READ_ROLES = STAFF_ROLES (client exclu)", () => {
    expect([...PROJECT_CLIENT_ROLES]).toEqual([...MANAGER_ROLES]);
    expect([...SPEC_READ_ROLES]).toEqual([...STAFF_ROLES]);
    expect(SPEC_READ_ROLES as readonly string[]).not.toContain("client");
  });
});

describe("isProjectScoped : fail-closed", () => {
  it.each(["client"])("le rôle %s est cloisonné", (role) => {
    expect(isProjectScoped(role)).toBe(true);
  });

  it.each([undefined, "", "member", "Owner", "OWNER", "client ", "superuser", "admin;"])(
    "le rôle absent ou inconnu %j est cloisonné",
    (role) => {
      expect(isProjectScoped(role)).toBe(true);
    },
  );

  it.each(["owner", "admin", "dev", "designer", "business"])(
    "le rôle d'équipe %s voit toute l'organisation",
    (role) => {
      expect(isProjectScoped(role)).toBe(false);
    },
  );
});

function requestOf(session: AuthSession | undefined): Request {
  return { kokloSession: session, headers: {} } as unknown as Request;
}

const notFound = () => new ORPCError("NOT_FOUND", { message: "Ressource introuvable" });
const internalErrors = { INTERNAL: () => new Error("INTERNAL") };

function accessFake(denied: boolean) {
  const calls: { session: AuthSession; projectId: string }[] = [];
  const access: ProjectAccess = {
    async assertAccessible(session, projectId) {
      calls.push({ session, projectId });
      if (denied) throw notFound();
    },
    async linkedProjectIds() {
      return null;
    },
  };
  return { access, calls };
}

const clientSession: AuthSession = { userId: USER, organizationId: ORG, role: "client" };

describe("inProject : contrôle d'accès central", () => {
  it("n'exécute pas le travail et lève NOT_FOUND quand l'accès est refusé", async () => {
    const { access } = accessFake(true);
    let ran = false;
    await expect(
      inProject(
        requestOf(clientSession),
        internalErrors,
        PROJECT,
        async () => {
          ran = true;
        },
        access,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(ran).toBe(false);
  });

  it("exécute le travail avec la portée quand l'accès est accordé", async () => {
    const { access, calls } = accessFake(false);
    const scope = await inProject(
      requestOf(clientSession),
      internalErrors,
      PROJECT,
      async (s) => s,
      access,
    );
    expect(scope).toEqual({ organizationId: ORG, userId: USER, projectId: PROJECT });
    expect(calls).toEqual([{ session: clientSession, projectId: PROJECT }]);
  });

  it("la session sans rôle est transmise telle quelle (le fail-closed est décidé par l'accès)", async () => {
    const { access, calls } = accessFake(false);
    const roleless: AuthSession = { userId: USER, organizationId: ORG };
    await inProject(requestOf(roleless), internalErrors, PROJECT, async () => 1, access);
    expect(calls[0]?.session).toEqual(roleless);
  });

  it("l'identifiant de projet de l'entrée est celui contrôlé (jamais un autre)", async () => {
    const { access, calls } = accessFake(false);
    await inProject(
      requestOf(clientSession),
      internalErrors,
      "autre-projet",
      async () => 1,
      access,
    );
    expect(calls.map((c) => c.projectId)).toEqual(["autre-projet"]);
  });
});
