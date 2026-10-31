import { describe, expect, it } from "vitest";
import { canWriteSpec } from "../src/lib/roles.ts";

/** TK-48 / 48e : `SPEC_BATCH_ROLES` (docs/api-contract.md) = owner, admin, dev, designer. */
describe("canWriteSpec", () => {
  it.each(["owner", "admin", "dev", "designer"])("%s écrit dans la spec", (role) => {
    expect(canWriteSpec(role)).toBe(true);
  });

  it.each(["client", "business", "visiteur", "OWNER", "", undefined])(
    "%j n'écrit pas (client, business, rôle inconnu ou rôle pas encore connu)",
    (role) => {
      expect(canWriteSpec(role)).toBe(false);
    },
  );
});
