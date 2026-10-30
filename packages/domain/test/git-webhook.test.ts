import { describe, expect, it } from "vitest";
import { WEBHOOK_EVENTS } from "../src/index.ts";

describe("CA7 WEBHOOK_EVENTS", () => {
  it("contient exactement les 8 événements du §8.1, dans l'ordre", () => {
    expect([...WEBHOOK_EVENTS]).toEqual([
      "installation",
      "push",
      "pull_request",
      "pull_request_review",
      "check_suite",
      "check_run",
      "workflow_run",
      "deployment_status",
    ]);
  });
  it("est gelé", () => {
    expect(Object.isFrozen(WEBHOOK_EVENTS)).toBe(true);
  });
});
