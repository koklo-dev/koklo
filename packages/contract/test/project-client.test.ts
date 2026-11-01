import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, INSTANT, input, isValid, output, parsed, proc, UUID, UUID2 } from "./support.ts";

/**
 * TK-55a (contrat 0.10.0) : groupe `projectClient` (lier un membre `client` à un projet). Trois
 * procédures réservées aux gestionnaires (le contrôle est côté API). Aucun champ d'organisation,
 * d'auteur ou d'identifiant de ligne en entrée : ils viennent de la session.
 */
const NAMES = ["add", "list", "remove"];
const ITEM = {
  memberId: UUID,
  userId: UUID2,
  name: "Claire Cliente",
  email: "claire@example.test",
  createdAt: INSTANT,
};

type Doc = {
  info: { version: string };
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("PC1 surface : exactement list, add, remove", () => {
  it("le routeur expose le groupe projectClient et rien d'autre dans ce groupe", () => {
    const group = (api.contract as unknown as Record<string, object>).projectClient;
    expect(group).toBeDefined();
    expect(Object.keys(group ?? {}).sort()).toEqual(NAMES);
  });

  it.each([
    ["projectClient.list", "get", "/projects/{projectId}/clients"],
    ["projectClient.add", "post", "/projects/{projectId}/clients"],
    ["projectClient.remove", "delete", "/projects/{projectId}/clients/{memberId}"],
  ])("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    expect(proc(name)).toBeDefined();
    const d = await doc();
    expect(d.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("la version du contrat est 0.10.0 (0.9.0 est réservée à TK-54)", async () => {
    expect(api.CONTRACT_VERSION).toBe("0.10.0");
    expect((await doc()).info.version).toBe("0.10.0");
  });
});

describe("PC2 entrées : identifiants UUID, rien d'autre", () => {
  it("list : projectId UUID requis", async () => {
    expect(await isValid(input("projectClient.list"), { projectId: UUID })).toBe(true);
    for (const projectId of ["", "pas-un-uuid", "1", undefined]) {
      expect(await isValid(input("projectClient.list"), { projectId }), String(projectId)).toBe(
        false,
      );
    }
  });

  it("add : projectId et memberId UUID requis", async () => {
    expect(await isValid(input("projectClient.add"), { projectId: UUID, memberId: UUID2 })).toBe(
      true,
    );
    expect(await isValid(input("projectClient.add"), { projectId: UUID })).toBe(false);
    expect(await isValid(input("projectClient.add"), { projectId: UUID, memberId: "x" })).toBe(
      false,
    );
  });

  it("add : une organisation, un utilisateur ou un auteur ajoutés ne sont jamais conservés", async () => {
    const value = await parsed(input("projectClient.add"), {
      projectId: UUID,
      memberId: UUID2,
      organizationId: UUID,
      userId: UUID,
      createdByUserId: UUID,
      id: UUID,
    });
    expect(value).toEqual({ projectId: UUID, memberId: UUID2 });
  });

  it("remove : projectId et memberId UUID requis", async () => {
    expect(await isValid(input("projectClient.remove"), { projectId: UUID, memberId: UUID2 })).toBe(
      true,
    );
    expect(await isValid(input("projectClient.remove"), { projectId: UUID })).toBe(false);
  });
});

describe("PC3 sorties", () => {
  it("add et list renvoient des clients : memberId, userId, name, email, createdAt", async () => {
    expect(await isValid(output("projectClient.add"), ITEM)).toBe(true);
    expect(await isValid(output("projectClient.list"), [ITEM, ITEM])).toBe(true);
    expect(await isValid(output("projectClient.list"), [])).toBe(true);
    expect(await isValid(output("projectClient.add"), { ...ITEM, email: undefined })).toBe(false);
    expect(await isValid(output("projectClient.add"), { ...ITEM, createdAt: "hier" })).toBe(false);
  });

  it("aucun champ en plus n'est conservé (pas d'identifiant de ligne, de rôle ni de créateur)", async () => {
    const value = await parsed(output("projectClient.add"), {
      ...ITEM,
      id: UUID,
      role: "client",
      organizationId: UUID,
      createdByUserId: UUID,
    });
    expect(Object.keys(value ?? {}).sort()).toEqual([
      "createdAt",
      "email",
      "memberId",
      "name",
      "userId",
    ]);
  });

  it("remove renvoie { removed: boolean }", async () => {
    expect(await isValid(output("projectClient.remove"), { removed: true })).toBe(true);
    expect(await isValid(output("projectClient.remove"), { removed: false })).toBe(true);
    expect(await isValid(output("projectClient.remove"), {})).toBe(false);
    expect(await isValid(output("projectClient.remove"), { removed: "oui" })).toBe(false);
  });
});

describe("PC4 erreurs typées", () => {
  it.each(["list", "add", "remove"])(
    "projectClient.%s : INTERNAL, UNAUTHORIZED, FORBIDDEN et NOT_FOUND",
    (name) => {
      const codes = Object.keys(errors(`projectClient.${name}`));
      for (const code of ["INTERNAL", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]) {
        expect(codes, `${name} ${code}`).toContain(code);
      }
    },
  );

  it("add expose VALIDATION (422) ; list et remove non", () => {
    expect(errors("projectClient.add").VALIDATION?.status).toBe(422);
    expect(errors("projectClient.list").VALIDATION).toBeUndefined();
    expect(errors("projectClient.remove").VALIDATION).toBeUndefined();
  });

  it("NOT_FOUND est 404 sans donnée : aucun oracle d'existence", () => {
    for (const name of ["list", "add", "remove"]) {
      const notFound = errors(`projectClient.${name}`).NOT_FOUND;
      expect(notFound?.status, name).toBe(404);
      expect(notFound?.data, name).toBeUndefined();
    }
  });

  it("OpenAPI : 403 et 404 documentés sur chaque route", async () => {
    const d = await doc();
    const routes = [
      ["/projects/{projectId}/clients", "get"],
      ["/projects/{projectId}/clients", "post"],
      ["/projects/{projectId}/clients/{memberId}", "delete"],
    ] as const;
    for (const [path, method] of routes) {
      const codes = Object.keys(d.paths[path]?.[method]?.responses ?? {});
      expect(codes, `${method} ${path}`).toEqual(expect.arrayContaining(["403", "404"]));
    }
  });
});
