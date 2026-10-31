import { describe, expect, it } from "vitest";
import { canMoveTickets, canReadRepos } from "../src/lib/roles.ts";

/** TK-48 / 48d : `repo.list` est réservé à l'équipe (owner, admin, dev, designer). */
describe("canReadRepos", () => {
  it.each(["owner", "admin", "dev", "designer"] as const)("%s lit les dépôts", (role) => {
    expect(canReadRepos(role)).toBe(true);
  });

  it.each(["client", "business"] as const)("%s ne lit pas les dépôts", (role) => {
    expect(canReadRepos(role)).toBe(false);
  });

  it("rôle inconnu (pas encore chargé) : faux, donc aucun appel", () => {
    expect(canReadRepos(undefined)).toBe(false);
  });

  it("coïncide avec canMoveTickets pour chaque rôle", () => {
    for (const role of ["owner", "admin", "dev", "designer", "client", "business"] as const) {
      expect(canReadRepos(role)).toBe(canMoveTickets(role));
    }
  });
});
