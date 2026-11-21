import { describe, expect, it } from "vitest";
import { isArchitectureKind } from "../src/lib/proposal-architecture.ts";
import { MODE_TEXTS, modeTextsOf, refOf, subtitleOf } from "../src/lib/proposal-labels.ts";
import { isSavable, operationsOf, planBatches } from "../src/lib/proposal-operations.ts";
import { fake } from "./support/proposals.tsx";

/** TK-111 lot C : opérations, références et sous-lignes des propositions `component`, `archflow`, `adr`, `doc_section`. */
const component = (n: number, over: Record<string, unknown> = {}, status = "accepted") =>
  fake(n, {
    kind: "component" as never,
    zone: "Prise de rendez-vous",
    title: "API",
    status: status as "accepted",
    content: {
      name: "API",
      type: "service",
      zone: "Prise de rendez-vous",
      responsibility: "Cœur du produit.",
      owns: ["T-reservation"],
      serves: ["F-001"],
      dependsOn: [{ to: "C-db", via: "SQL" }],
      decisions: ["ADR-001"],
      ...over,
    },
  });

describe("component -> component.create", () => {
  it("reprend nom, type, zone, responsabilité et liens ; omet ce qui est vide", () => {
    expect(operationsOf(component(1))).toEqual([
      {
        kind: "component.create",
        name: "API",
        type: "service",
        zone: "Prise de rendez-vous",
        responsibility: "Cœur du produit.",
        owns: ["T-reservation"],
        serves: ["F-001"],
        dependsOn: [{ to: "C-db", via: "SQL" }],
        decisions: ["ADR-001"],
      },
    ]);
    const [bare] = operationsOf(
      component(2, { owns: [], serves: [], dependsOn: [], decisions: [] }),
    );
    expect(bare).toEqual({
      kind: "component.create",
      name: "API",
      type: "service",
      zone: "Prise de rendez-vous",
      responsibility: "Cœur du produit.",
    });
  });

  it("la zone de la proposition prime sur celle du contenu, rognée à 120 caractères", () => {
    const [op] = operationsOf({ ...component(1), zone: "Z".repeat(200) });
    expect((op as { zone: string }).zone).toHaveLength(120);
  });

  it("les dépendances asynchrones gardent `async: true`", () => {
    const [op] = operationsOf(
      component(1, { dependsOn: [{ to: "C-queue", via: "planifie", async: true }] }),
    );
    expect(op).toMatchObject({ dependsOn: [{ to: "C-queue", via: "planifie", async: true }] });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("archflow, adr, doc_section", () => {
  it("archflow -> archflow.create avec le P- du parcours", () => {
    const messages = [{ from: "C-web", to: "C-api", text: "réserve" }];
    const [op] = operationsOf(
      fake(1, {
        kind: "archflow" as never,
        status: "accepted",
        content: { flow: "P-reserver", participants: ["C-web", "C-api"], messages, features: [] },
      }),
    );
    expect(op).toEqual({
      kind: "archflow.create",
      flow: "P-reserver",
      participants: ["C-web", "C-api"],
      messages,
    });
  });

  it("adr -> adr.create : contexte, décision, conséquences, alternatives, en clair, liens", () => {
    const [op] = operationsOf(
      fake(1, {
        kind: "adr" as never,
        status: "accepted",
        content: {
          title: "PostgreSQL plutôt que MongoDB",
          context: "Les données sont relationnelles.",
          decision: "Une base relationnelle.",
          positives: ["Transactions"],
          accepted: [],
          alternatives: [{ name: "MongoDB", reason: "Pas de jointures" }],
          plain: "On range les données dans un tableau.",
          links: ["T-client"],
        },
      }),
    );
    expect(op).toEqual({
      kind: "adr.create",
      title: "PostgreSQL plutôt que MongoDB",
      context: "Les données sont relationnelles.",
      decision: "Une base relationnelle.",
      positives: ["Transactions"],
      alternatives: [{ name: "MongoDB", reason: "Pas de jointures" }],
      plain: "On range les données dans un tableau.",
      links: ["T-client"],
    });
  });

  it("doc_section -> doc.section.create à relire (l'agent l'a écrite, l'équipe la relit)", () => {
    const [op] = operationsOf(
      fake(1, {
        kind: "doc_section" as never,
        status: "accepted",
        content: { title: "Observabilité", markdown: "Alerte en moins de 5 min." },
      }),
    );
    expect(op).toEqual({
      kind: "doc.section.create",
      title: "Observabilité",
      markdown: "Alerte en moins de 5 min.",
      status: "a_relire",
    });
  });

  it("une proposition acceptée de l'architecture est enregistrable ; en attente, non", () => {
    expect(isSavable(component(1))).toBe(true);
    expect(isSavable(component(2, {}, "pending"))).toBe(false);
  });

  it("un lot mêle les quatre types, un seul lot sous 200 opérations", () => {
    const plans = planBatches("launch", [
      component(1),
      fake(2, {
        kind: "doc_section" as never,
        status: "accepted",
        content: { title: "A", markdown: "B" },
      }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.operations.map((op) => op.kind)).toEqual([
      "component.create",
      "doc.section.create",
    ]);
  });
});

describe("références, sous-lignes et modes", () => {
  it("référence lisible : C-<slug du nom>, P- du parcours, ADR-<rang>, DOC-<slug du titre>", () => {
    expect(refOf(component(1, { name: "Passerelle SMS" }))).toBe("C-passerelle-sms");
    expect(refOf(fake(1, { kind: "archflow" as never, content: { flow: "P-reserver" } }))).toBe(
      "P-reserver",
    );
    expect(refOf(fake(3, { kind: "adr" as never, content: { title: "x" } }))).toBe("ADR-003");
    expect(
      refOf(fake(1, { kind: "doc_section" as never, content: { title: "Sécurité et données" } })),
    ).toBe("DOC-securite-et-donnees");
  });

  it("sous-lignes : « Service · zone Paiement », « Flux · 3 messages », « Décision », « Section du document »", () => {
    expect(subtitleOf(component(1, { zone: "Paiement", type: "service" }))).toBe(
      "Service · zone Prise de rendez-vous",
    );
    expect(subtitleOf(component(1, { type: "ext" }))).toBe("Externe · zone Prise de rendez-vous");
    expect(
      subtitleOf(
        fake(1, {
          kind: "archflow" as never,
          content: {
            messages: [
              { from: "a", to: "b", text: "x" },
              { block: "separator", label: "y" },
              { block: "alt", label: "z", messages: [{ from: "a", to: "b", text: "t" }] },
            ],
          },
        }),
      ),
    ).toBe("Flux · 2 messages");
    expect(subtitleOf(fake(1, { kind: "adr" as never, content: { alternatives: [{}, {}] } }))).toBe(
      "Décision · 2 alternatives écartées",
    );
    expect(subtitleOf(fake(1, { kind: "doc_section" as never, content: {} }))).toBe(
      "Section du document",
    );
  });

  it("les quatre modes de l'architecture ont leur texte, jamais ceux du cahier fonctionnel", () => {
    const texts = modeTextsOf("architecture");
    expect(Object.keys(texts)).toEqual(["complete", "decision", "document", "all"]);
    expect(texts.complete?.title).toBe("Compléter l'architecture");
    expect(texts.decision?.title).toBe("Proposer une décision");
    expect(texts.document?.title).toBe("Rédiger le document");
    expect(texts.all?.title).toBe("Tout reproposer");
    expect(MODE_TEXTS.decision).toBeUndefined();
  });

  it("isArchitectureKind", () => {
    expect(["component", "archflow", "adr", "doc_section"].every(isArchitectureKind)).toBe(true);
    expect(isArchitectureKind("table")).toBe(false);
  });
});
