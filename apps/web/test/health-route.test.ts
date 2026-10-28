import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/health/route.ts";

// TK-16 critère 4 : GET /api/health répond sans dépendre de l'api ni de la base.
describe("GET /api/health", () => {
  it("répond 200 avec { status: 'ok' } en JSON", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
