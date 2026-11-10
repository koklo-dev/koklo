import { describe, expect, it, vi } from "vitest";
import type { ProjectRepository } from "./project.repository.ts";
import { ProjectService } from "./project.service.ts";

describe("ProjectService (C1.8)", () => {
  it("délègue au port avec l'organizationId reçu et projette { id, name }", async () => {
    const listByOrganization = vi.fn<ProjectRepository["listByOrganization"]>(async () => [
      {
        id: "01900000-0000-7000-8000-000000000006",
        name: "Projet de démo",
        organizationId: "org-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    const service = new ProjectService({ listByOrganization });

    const result = await service.list("org-1");

    expect(listByOrganization).toHaveBeenCalledExactlyOnceWith("org-1");
    expect(result).toEqual([
      { id: "01900000-0000-7000-8000-000000000006", name: "Projet de démo" },
    ]);
  });

  it("laisse remonter l'erreur du port (aucune erreur avalée)", async () => {
    const service = new ProjectService({
      listByOrganization: async () => {
        throw new Error("boom");
      },
    });
    await expect(service.list("org-1")).rejects.toThrow("boom");
  });
});
