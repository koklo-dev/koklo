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
  it("sert le document de generateOpenApi(), avec /health et /projects", async () => {
    const response = await request(app.getHttpServer()).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(JSON.parse(JSON.stringify(await generateOpenApi())));
    expect(Object.keys(response.body.paths).sort()).toEqual(["/health", "/projects"]);
  });
});
