import { generateOpenApi } from "@koklo/contract";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";

let app: INestApplication;

beforeAll(async () => {
  app = await createApp({ databaseUrl: UNREACHABLE_DATABASE_URL });
});

afterAll(async () => {
  await app?.close();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("GET /openapi.json (C3.1)", () => {
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
  it("sert le document de generateOpenApi(), avec toutes les routes du contrat", async () => {
    const response = await request(app.getHttpServer()).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(JSON.parse(JSON.stringify(await generateOpenApi())));
    expect(Object.keys(response.body.paths).sort()).toEqual([
      "/client-space/projects",
      "/client-space/projects/{projectId}/features",
      "/client-space/projects/{projectId}/features/{featureId}",
      "/health",
      "/llm-credentials",
      "/llm-credentials/{provider}",
      "/llm-credentials/{provider}/invalidate",
      "/llm-credentials/{provider}/verify",
      "/members",
      "/members/invitations",
      "/members/{memberId}/role",
      "/organizations",
      "/project-visits",
      "/projects",
      "/projects/{projectId}/ai/brief",
      "/projects/{projectId}/ai/criteria",
      "/projects/{projectId}/ai/features",
      "/projects/{projectId}/audit",
      "/projects/{projectId}/clients",
      "/projects/{projectId}/clients/{memberId}",
      "/projects/{projectId}/comments",
      "/projects/{projectId}/comments/{id}",
      "/projects/{projectId}/project-state",
      "/projects/{projectId}/repos",
      "/projects/{projectId}/reviews",
      "/projects/{projectId}/shell",
      "/projects/{projectId}/spec",
      "/projects/{projectId}/spec-repo",
      "/projects/{projectId}/spec/batches",
      "/projects/{projectId}/spec/batches/{batchId}",
      "/projects/{projectId}/spec/features",
      "/projects/{projectId}/spec/features/{specId}",
      "/projects/{projectId}/sprints",
      "/projects/{projectId}/sprints/{key}",
      "/projects/{projectId}/sprints/{key}/activate",
      "/projects/{projectId}/sprints/{key}/close",
      "/projects/{projectId}/suggestions",
      "/projects/{projectId}/suggestions/{id}/accept",
      "/projects/{projectId}/suggestions/{id}/reject",
      "/projects/{projectId}/suggestions/{id}/withdraw",
      "/projects/{projectId}/tickets",
      "/projects/{projectId}/tickets/{key}",
      "/projects/{projectId}/tickets/{key}/dependencies",
      "/projects/{projectId}/tickets/{key}/dependencies/{dependsOn}",
      "/projects/{projectId}/tickets/{key}/lease",
      "/projects/{projectId}/tickets/{key}/lease/heartbeat",
      "/projects/{projectId}/tickets/{key}/transition",
      "/projects/{projectId}/visit",
      "/provider/installations",
      "/provider/installations/start",
      "/search",
    ]);
  });
});
