import { describe, expect, it } from "vitest";
import { createTicket, InvalidTicketError, TICKET_PRIORITIES, TICKET_TYPES } from "../src/index.ts";
import { baseInput, makeTicket } from "./helpers.ts";

const fieldOf = (override: Record<string, unknown>) => {
  try {
    makeTicket(override);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidTicketError);
    return (error as InvalidTicketError).field;
  }
  return "ok";
};

describe("E1 validation de createTicket", () => {
  it("crée un ticket complet avec valeurs par défaut explicites", () => {
    const ticket = makeTicket();
    expect(ticket).toEqual({
      key: "TK-1",
      title: "Domaine : ticket",
      description: "",
      type: "feature",
      status: "backlog",
      priority: "medium",
      sprint: null,
      assignee: null,
      pkg: "domain",
      labels: [],
      sensitivity: "safe",
      estimateHours: null,
      linkedFeatures: [],
      branch: null,
      pullRequest: null,
      attempts: 0,
      reviewRounds: 0,
    });
  });

  it("conserve les champs optionnels fournis", () => {
    const ticket = makeTicket({
      description: "d",
      sprint: "sprint-006",
      assignee: "agent-1",
      labels: ["pkg:domain", "safe"],
      estimateHours: 4,
      linkedFeatures: ["F-1"],
      branch: "feat/tk-25",
      pullRequest: "13",
    });
    expect(ticket).toMatchObject({
      description: "d",
      sprint: "sprint-006",
      assignee: "agent-1",
      labels: ["pkg:domain", "safe"],
      estimateHours: 4,
      linkedFeatures: ["F-1"],
      branch: "feat/tk-25",
      pullRequest: "13",
    });
  });

  it("types et priorités : listes fermées", () => {
    expect([...TICKET_TYPES]).toEqual(["feature", "bug", "task", "chore"]);
    expect([...TICKET_PRIORITIES]).toEqual(["low", "medium", "high", "critical"]);
    for (const type of TICKET_TYPES) expect(makeTicket({ type }).type).toBe(type);
    for (const priority of TICKET_PRIORITIES)
      expect(makeTicket({ priority }).priority).toBe(priority);
  });
});

describe("E1 champs invalides", () => {
  it("nomme le champ invalide", () => {
    expect(fieldOf({ title: "" })).toBe("title");
    expect(fieldOf({ title: "   " })).toBe("title");
    expect(fieldOf({ title: 3 })).toBe("title");
    expect(fieldOf({ type: "epic" })).toBe("type");
    expect(fieldOf({ priority: "urgent" })).toBe("priority");
    expect(fieldOf({ estimateHours: -1 })).toBe("estimateHours");
    expect(fieldOf({ estimateHours: Number.NaN })).toBe("estimateHours");
    expect(fieldOf({ key: "TK-0" })).toBe("key");
    expect(fieldOf({ labels: "safe" })).toBe("labels");
    expect(fieldOf({ labels: [1] })).toBe("labels");
    expect(fieldOf({ linkedFeatures: "F-1" })).toBe("linkedFeatures");
    expect(fieldOf({ pkg: "mobile" })).toBe("pkg");
    expect(fieldOf({ pkg: undefined })).toBe("pkg");
    expect(fieldOf({ sensitivity: "maybe" })).toBe("sensitivity");
    expect(fieldOf({ description: 3 })).toBe("description");
    expect(fieldOf({ branch: 3 })).toBe("branch");
    expect(fieldOf({ estimateHours: 0 })).toBe("ok");
  });

  it("S3 la sensibilité est obligatoire, sans défaut silencieux ni déduction du pkg", () => {
    const { sensitivity: _omit, ...withoutSensitivity } = baseInput;
    expect(() => createTicket(withoutSensitivity as never)).toThrow(
      expect.objectContaining({ field: "sensitivity" }),
    );
    expect(makeTicket({ pkg: "db", sensitivity: "safe" }).sensitivity).toBe("safe");
    expect(makeTicket({ pkg: "web", sensitivity: "sensitive" }).sensitivity).toBe("sensitive");
  });
});

describe("E2 statut initial", () => {
  it("vaut backlog par défaut, todo autorisé, le reste refusé", () => {
    expect(makeTicket().status).toBe("backlog");
    expect(makeTicket({ status: "todo" }).status).toBe("todo");
    for (const status of ["in_progress", "in_review", "blocked", "done", "cancelled", "review"]) {
      expect(fieldOf({ status })).toBe("status");
    }
  });
});

describe("E3 immutabilité", () => {
  it("gèle le ticket et ses tableaux, sans aliaser l'entrée", () => {
    const labels = ["safe"];
    const linked = ["F-1"];
    const ticket = makeTicket({ labels, linkedFeatures: linked });
    expect(Object.isFrozen(ticket)).toBe(true);
    expect(Object.isFrozen(ticket.labels)).toBe(true);
    expect(Object.isFrozen(ticket.linkedFeatures)).toBe(true);
    labels.push("mutated");
    linked.push("F-2");
    expect(ticket.labels).toEqual(["safe"]);
    expect(ticket.linkedFeatures).toEqual(["F-1"]);
    expect(() => {
      (ticket as { title: string }).title = "x";
    }).toThrow(TypeError);
  });
});
