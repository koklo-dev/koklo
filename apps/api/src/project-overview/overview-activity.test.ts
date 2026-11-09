import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ACTIONS,
  type ActivityRow,
  activityItemOf,
  CLIENT_ACTIVITY_ACTIONS,
} from "./overview-activity.ts";

const AT = new Date("2026-11-09T10:00:00Z");
const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  action: "review.approve",
  occurredAt: AT,
  actorKind: "human",
  actorName: "Marie Lefèvre",
  actorRole: "client",
  target: "F-001 Réserver un créneau",
  ...over,
});

describe("listes fermées d'événements (B279)", () => {
  it("l'équipe lit dix événements, le client trois familles seulement", () => {
    expect([...ACTIVITY_ACTIONS].sort()).toEqual(
      [
        "idea.freeze",
        "idea.proposal.accept",
        "project.create",
        "project_client.add",
        "review.approve",
        "review.request_changes",
        "spec.batch.submit",
        "sprint.activate",
        "sprint.close",
        "suggestion.create",
      ].sort(),
    );
    expect([...CLIENT_ACTIVITY_ACTIONS].sort()).toEqual(
      ["idea.freeze", "review.approve", "review.request_changes", "suggestion.create"].sort(),
    );
  });
});

describe("activityItemOf : phrases complètes, jamais un identifiant seul", () => {
  it.each([
    ["review.approve", "Marie Lefèvre a validé F-001 Réserver un créneau"],
    [
      "review.request_changes",
      "Marie Lefèvre a demandé des changements sur F-001 Réserver un créneau",
    ],
    ["suggestion.create", "Marie Lefèvre a ajouté la suggestion SG-3"],
    ["idea.freeze", "Marie Lefèvre a publié une version du dossier d'idée"],
    ["idea.proposal.accept", "Marie Lefèvre a accepté une proposition de l'agent"],
    ["sprint.activate", "Marie Lefèvre a démarré le sprint SP-7"],
    ["sprint.close", "Marie Lefèvre a clos le sprint SP-7"],
    ["spec.batch.submit", "Marie Lefèvre a enregistré des modifications de la spec"],
    ["project.create", "Marie Lefèvre a créé le projet"],
    ["project_client.add", "Marie Lefèvre a donné accès au projet à un client"],
  ])("%s", (action, text) => {
    const target = {
      "suggestion.create": "SG-3",
      "sprint.activate": "SP-7",
      "sprint.close": "SP-7",
    }[action];
    const item = activityItemOf(row({ action, ...(target ? { target } : {}) }));
    expect(item.text).toBe(text);
    expect(item.at).toBe(AT.toISOString());
  });

  it("trois types d'acteurs : client, équipe, agent", () => {
    expect(activityItemOf(row()).actor).toEqual({
      kind: "client",
      name: "Marie Lefèvre",
      initials: "ML",
    });
    expect(activityItemOf(row({ actorRole: "business" })).actor.kind).toBe("client");
    expect(activityItemOf(row({ actorRole: "owner" })).actor.kind).toBe("team");
    const agent = activityItemOf(row({ actorKind: "agent", actorName: null, actorRole: null }));
    expect(agent.actor).toEqual({ kind: "agent", name: "L'agent", initials: "IA" });
    expect(agent.text).toBe("L'agent a validé F-001 Réserver un créneau");
    expect(activityItemOf(row({ actorKind: "runner", actorName: null })).actor.kind).toBe("agent");
  });

  it("un acteur supprimé ne casse pas la phrase", () => {
    const item = activityItemOf(row({ actorName: null, actorRole: null }));
    expect(item.text).toBe("Un ancien membre a validé F-001 Réserver un créneau");
    expect(item.actor).toEqual({ kind: "team", name: "Un ancien membre", initials: "?" });
  });

  it("une cible disparue donne une formulation sans identifiant", () => {
    expect(activityItemOf(row({ target: null })).text).toBe(
      "Marie Lefèvre a validé une fonctionnalité",
    );
    expect(activityItemOf(row({ action: "sprint.close", target: null })).text).toBe(
      "Marie Lefèvre a clos un sprint",
    );
    expect(activityItemOf(row({ action: "suggestion.create", target: null })).text).toBe(
      "Marie Lefèvre a ajouté une suggestion",
    );
  });
});
