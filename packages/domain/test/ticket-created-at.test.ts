import { describe, expect, it } from "vitest";
import { createTicket } from "../src/index.ts";
import { baseInput, makeTicket } from "./helpers.ts";

const fieldOf = (override: Record<string, unknown>) => {
  try {
    makeTicket(override);
  } catch (error) {
    return (error as { field?: string }).field ?? "autre";
  }
  return "ok";
};

describe("H1 createdAt obligatoire (ancienneté)", () => {
  it("conserve l'instant ISO-8601 UTC fourni", () => {
    expect(makeTicket({ createdAt: "2026-03-04T05:06:07.000Z" }).createdAt).toBe(
      "2026-03-04T05:06:07.000Z",
    );
    expect(makeTicket({ createdAt: "2026-03-04T05:06:07Z" }).createdAt).toBe(
      "2026-03-04T05:06:07Z",
    );
  });

  it("est obligatoire : omis ou null, InvalidTicketError sur le champ createdAt", () => {
    const { createdAt: _omit, ...without } = baseInput;
    expect(() => createTicket(without as never)).toThrow(
      expect.objectContaining({ name: "InvalidTicketError", field: "createdAt" }),
    );
    expect(fieldOf({ createdAt: null })).toBe("createdAt");
  });

  it("refuse les valeurs qui ne sont pas un instant ISO-8601 UTC valide", () => {
    for (const bad of [
      "",
      "hier",
      "2026-13-01T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-01-01",
      1767225600000,
      new Date(0),
    ]) {
      expect(fieldOf({ createdAt: bad })).toBe("createdAt");
    }
  });
});
