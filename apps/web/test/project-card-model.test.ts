import { describe, expect, it } from "vitest";
import { cardPropsOf, countLabel, shortAgeOf } from "../src/lib/project-card-model.ts";
import { projectCard } from "./support/web-mocks.ts";

const NOW = Date.parse("2026-11-09T12:00:00.000Z");
const card = (over: Record<string, unknown> = {}) =>
  projectCard(over) as Parameters<typeof cardPropsOf>[0];

/** TK-93 lot B : projection d'une carte du serveur vers `ProjectCard` (maquette 08 l.202-218). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("cardPropsOf", () => {
  it("lien, tuile, phase, avancement tels que le serveur les donne", () => {
    const props = cardPropsOf(
      card({
        id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02",
        name: "Portail de réservation",
        initials: "PR",
        colorKey: 3,
        phase: "framing",
        progress: { label: "Livrables validés", done: 2, total: 7, valueLabel: "2 sur 7" },
      }),
      "team",
      NOW,
    );
    expect(props).toMatchObject({
      href: "/projects/7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02",
      name: "Portail de réservation",
      initials: "PR",
      colorKey: 3,
      phase: "framing",
      progress: { label: "Livrables validés", valueLabel: "2 sur 7", done: 2, total: 7 },
    });
  });

  it("équipe : contact du client, sinon « Aucun client invité »", () => {
    expect(cardPropsOf(card({ clientContact: "Marie Lefèvre" }), "team", NOW).client).toBe(
      "Marie Lefèvre",
    );
    expect(cardPropsOf(card(), "team", NOW).client).toBe("Aucun client invité");
  });

  it("client : aucune ligne de client", () => {
    expect(cardPropsOf(card(), "client", NOW).client).toBeNull();
  });

  it("prochaine étape : titre et attention du serveur, sinon null", () => {
    expect(
      cardPropsOf(card({ nextAction: { title: "À relire", attention: true } }), "team", NOW).next,
    ).toEqual({ title: "À relire", attention: true });
    expect(cardPropsOf(card(), "team", NOW).next).toBeNull();
  });

  it("personnes : le client porte « (client) » dans son nom et le ton client", () => {
    const { people } = cardPropsOf(
      card({
        people: [
          { initials: "ML", name: "Marie Lefèvre", client: true },
          { initials: "AK", name: "Awa Koné", client: false },
        ],
      }),
      "team",
      NOW,
    );
    expect(people).toEqual([
      { initials: "ML", name: "Marie Lefèvre (client)", isClient: true },
      { initials: "AK", name: "Awa Koné", isClient: false },
    ]);
  });

  it("activité : « acteur, date relative », ou la date seule, ou rien", () => {
    const at = "2026-11-09T10:00:00.000Z";
    expect(cardPropsOf(card({ lastActivity: { actor: "Marie", at } }), "team", NOW).activity).toBe(
      "Marie, il y a 2 h",
    );
    expect(cardPropsOf(card({ lastActivity: { actor: null, at } }), "team", NOW).activity).toBe(
      "il y a 2 h",
    );
    expect(cardPropsOf(card(), "team", NOW).activity).toBeNull();
  });
});

describe("shortAgeOf", () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  it.each([
    [20 * 60_000, "il y a 20 min"],
    [2 * 3_600_000, "il y a 2 h"],
    [30 * 3_600_000, "hier"],
    [3 * 86_400_000, "il y a 3 j"],
    [10_000, "à l'instant"],
  ])("%i ms → %s", (ms, expected) => {
    expect(shortAgeOf(ago(ms), NOW)).toBe(expected);
  });
});

describe("countLabel", () => {
  it.each([
    [5, 3, "5 projets · 3 attendent une action"],
    [1, 1, "1 projet · 1 attend une action"],
    [4, 0, "4 projets"],
    [0, 0, "Aucun projet"],
  ])("%i projets, %i à traiter : « %s »", (total, attention, text) => {
    expect(countLabel(total, attention)).toBe(text);
  });
});
