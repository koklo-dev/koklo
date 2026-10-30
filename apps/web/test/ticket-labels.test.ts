import { describe, expect, it } from "vitest";
import {
  PRIORITY_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  STATUS_ORDER,
} from "../src/lib/ticket-labels.ts";

describe("ticket-labels (libellés français des statuts et priorités)", () => {
  it("ordonne les 7 statuts selon le cycle de vie", () => {
    expect(STATUS_ORDER).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "blocked",
      "done",
      "cancelled",
    ]);
  });

  it("donne le libellé français de chaque statut", () => {
    expect(STATUS_LABELS).toEqual({
      backlog: "Backlog",
      todo: "À faire",
      in_progress: "En cours",
      in_review: "En revue",
      blocked: "Bloqué",
      done: "Terminé",
      cancelled: "Annulé",
    });
  });

  it("associe une icône distincte à chaque statut (DESIGN S-kanban §3)", () => {
    expect(STATUS_ICONS).toEqual({
      backlog: "inbox",
      todo: "radio_button_unchecked",
      in_progress: "play_circle",
      in_review: "fact_check",
      blocked: "block",
      done: "check_circle",
      cancelled: "cancel",
    });
  });

  it("donne le libellé textuel de chaque priorité", () => {
    expect(PRIORITY_LABELS).toEqual({
      low: "Priorité basse",
      medium: "Priorité moyenne",
      high: "Priorité haute",
      critical: "Priorité critique",
    });
  });
});
