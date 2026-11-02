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

describe("GET /openapi.json (C3.1)", () => {
  it("sert le document de generateOpenApi(), avec toutes les routes du contrat", async () => {
    const response = await request(app.getHttpServer()).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(JSON.parse(JSON.stringify(await generateOpenApi())));
    expect(Object.keys(response.body.paths).sort()).toEqual([
      "/audit",
      "/comments",
      "/comments/{id}",
      "/health",
      "/llm-credentials",
      "/llm-credentials/{provider}",
      "/llm-credentials/{provider}/invalidate",
      "/llm-credentials/{provider}/verify",
      "/members",
      "/members/invitations",
      "/members/{memberId}/role",
      "/organizations",
      "/project-state",
      "/projects",
      "/projects/{projectId}/ai/brief",
      "/projects/{projectId}/ai/criteria",
      "/projects/{projectId}/ai/features",
      "/projects/{projectId}/clients",
      "/projects/{projectId}/clients/{memberId}",
      "/projects/{projectId}/repos",
      "/projects/{projectId}/spec",
      "/projects/{projectId}/spec-repo",
      "/projects/{projectId}/spec/batches",
      "/projects/{projectId}/spec/batches/{batchId}",
      "/projects/{projectId}/spec/features",
      "/projects/{projectId}/spec/features/{specId}",
      "/provider/installations",
      "/provider/installations/start",
      "/sprints",
      "/sprints/{key}",
      "/sprints/{key}/activate",
      "/sprints/{key}/close",
      "/tickets",
      "/tickets/{key}",
      "/tickets/{key}/dependencies",
      "/tickets/{key}/dependencies/{dependsOn}",
      "/tickets/{key}/lease",
      "/tickets/{key}/lease/heartbeat",
      "/tickets/{key}/transition",
    ]);
  });
});
