import { describe, expect, it } from "vitest";
import { authClient } from "../src/lib/auth-client.ts";

describe("authClient", () => {
  it("expose la connexion sociale", () => {
    expect(typeof authClient.signIn.social).toBe("function");
  });
});
