import { describe, expect, it } from "vitest";
import {
  DELIVERABLE_DEPENDENCIES,
  type DeliverableKey,
  type DeliverableStatus,
  deliverableAfterOf,
  deliverableConditionOf,
  deliverablesAvailabilityOf,
} from "../src/index.ts";

/**
 * TK-100 lot A (B1, B325 i) : disponibilité des sept livrables, règle pure. Fonctionnel dès `idea-v1` (ou des
 * fonctionnalités déjà indexées) ; Données et Design dès que le Fonctionnel contient une entité ; Architecture,
 * Technique, Sécurité et Qualité quand chaque amont est « Validé ». Un forçage ouvre sans rien valider.
 */
const KEYS = Object.keys(DELIVERABLE_DEPENDENCIES) as DeliverableKey[];
const ALL_TODO = Object.fromEntries(KEYS.map((key) => [key, "todo"])) as Record<
  DeliverableKey,
  DeliverableStatus
>;
const facts = (over: {
  ideaFrozen?: boolean;
  functionalHasEntity?: boolean;
  validated?: DeliverableKey[];
  forced?: DeliverableKey[];
  statuses?: Partial<Record<DeliverableKey, DeliverableStatus>>;
}) => ({
  ideaFrozen: over.ideaFrozen ?? true,
  functionalHasEntity: over.functionalHasEntity ?? false,
  statuses: {
    ...ALL_TODO,
    ...Object.fromEntries((over.validated ?? []).map((key) => [key, "validated"])),
    ...over.statuses,
  },
  forced: over.forced ?? [],
});
const availableOf = (over: Parameters<typeof facts>[0]) =>
  Object.fromEntries(
    deliverablesAvailabilityOf(facts(over)).map(({ key, available }) => [key, available]),
  );

describe("TK-100 A graphe B1", () => {
  it("sept livrables dans l'ordre de rédaction, Sécurité en 5e", () => {
    expect(KEYS).toEqual([
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]);
  });

  it("amont de chaque livrable (B1, B325 h)", () => {
    expect(DELIVERABLE_DEPENDENCIES).toEqual({
      functional: [],
      data: ["functional"],
      architecture: ["data"],
      technical: ["architecture"],
      security: ["technical"],
      design: ["functional"],
      quality: ["technical", "security", "design"],
    });
  });

  it("le texte « après » est repris du serveur actuel ; Fonctionnel attend l'idée", () => {
    expect(deliverableAfterOf("data")).toBe("le fonctionnel");
    expect(deliverableAfterOf("architecture")).toBe("les données");
    expect(deliverableAfterOf("technical")).toBe("l'architecture");
    expect(deliverableAfterOf("security")).toBe("le technique");
    expect(deliverableAfterOf("quality")).toBe("le technique, la sécurité et le design");
    expect(deliverableAfterOf("functional")).toBe("la première version de l'idée");
  });
});

describe("TK-100 A disponibilité : table de vérité", () => {
  it("Fonctionnel : fermé sans idée figée, ouvert avec idea-v1", () => {
    expect(availableOf({ ideaFrozen: false }).functional).toBe(false);
    expect(availableOf({ ideaFrozen: true }).functional).toBe(true);
  });

  it("Fonctionnel : ouvert pour un projet qui a déjà des fonctionnalités, même sans idée figée", () => {
    expect(availableOf({ ideaFrozen: false, functionalHasEntity: true }).functional).toBe(true);
  });

  it.each(["data", "design"] as const)(
    "%s : ouvert dès que le Fonctionnel contient une entité, sans qu'il soit validé",
    (key) => {
      expect(availableOf({ functionalHasEntity: false })[key]).toBe(false);
      expect(availableOf({ functionalHasEntity: true })[key]).toBe(true);
    },
  );

  it.each([
    ["architecture", ["data"]],
    ["technical", ["architecture"]],
    ["security", ["technical"]],
    ["quality", ["technical", "security", "design"]],
  ] as const)(
    "%s : ouvert quand tout son amont est validé, fermé dès qu'un amont ne l'est pas",
    (key, upstream) => {
      expect(availableOf({ validated: [...upstream] })[key]).toBe(true);
      for (const missing of upstream) {
        const validated = upstream.filter((other) => other !== missing);
        expect(availableOf({ validated: [...validated] })[key], `sans ${missing}`).toBe(false);
      }
      for (const status of ["todo", "pending", "revise"] as const) {
        const statuses = Object.fromEntries(upstream.map((u) => [u, status]));
        expect(availableOf({ statuses })[key], status).toBe(false);
      }
    },
  );

  it("un Fonctionnel validé sans entité n'ouvre pas Données (l'entité compte, pas le statut)", () => {
    expect(availableOf({ validated: ["functional"], functionalHasEntity: false }).data).toBe(false);
  });
});

describe("TK-100 A forçage et condition", () => {
  it("un forçage ouvre le livrable sans toucher aux autres ni au statut", () => {
    const result = deliverablesAvailabilityOf(facts({ ideaFrozen: false, forced: ["technical"] }));
    const byKey = Object.fromEntries(result.map((r) => [r.key, r]));
    expect(byKey.technical).toMatchObject({ available: true, forced: true });
    expect(byKey.security).toMatchObject({ available: false, forced: false });
    expect(byKey.technical?.status).toBe("todo");
  });

  it("forcer un livrable déjà ouvert le marque forcé sans changer sa disponibilité", () => {
    const [functional] = deliverablesAvailabilityOf(facts({ forced: ["functional"] }));
    expect(functional).toMatchObject({ key: "functional", available: true, forced: true });
  });

  it("condition : « Disponible après … » tant que le livrable est fermé, null sinon", () => {
    expect(deliverableConditionOf("data")).toBe("Disponible après le fonctionnel");
    const result = deliverablesAvailabilityOf(facts({ functionalHasEntity: true }));
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.condition]));
    expect(byKey.data).toBeNull();
    expect(byKey.architecture).toBe("Disponible après les données");
    expect(byKey.quality).toBe("Disponible après le technique, la sécurité et le design");
  });

  it("sort les sept entrées dans l'ordre, avec le statut fourni", () => {
    const result = deliverablesAvailabilityOf(facts({ statuses: { functional: "pending" } }));
    expect(result.map((r) => r.key)).toEqual(KEYS);
    expect(result[0]?.status).toBe("pending");
  });
});
