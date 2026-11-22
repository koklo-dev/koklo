import { revealTrusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { COVERAGE_INSTRUCTIONS, coveragePrompt } from "./prompts-coverage.ts";

/**
 * TK-114b (B622) : l'appel de couverture lit une consigne constante ; les trous, les composants connus (identifiant, nom, zone,
 * type), les rôles, les identifiants des décisions et la consigne de l'équipe entrent en blocs `Untrusted`. Jamais la
 * responsabilité ni les liens d'un composant indexé.
 */
const NONCE = "cd".repeat(24);
const input = {
  packet: {
    features: [{ specId: "F-007", title: "Exporter les factures" }],
    flows: [{ specId: "P-payer", title: "Payer une commande" }],
    components: [{ specId: "C-seul", title: "Isolé", zone: "Bord", type: "store" }],
    roles: [
      { specId: "RL-invite", title: "Invité", calls: ["C-api", "C-base"] },
      { specId: "RL-seul", title: "Seul", calls: [] },
    ],
  },
  components: [{ specId: "C-api", title: "API", zone: "Noyau", type: "service" }],
  roles: [{ specId: "RL-client", title: "Client" }],
  decisions: ["ADR-001"],
  instruction: "Privilégier les composants existants",
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("coveragePrompt", () => {
  it("consigne constante dans system, sans aucune donnée interpolée", () => {
    const prompt = coveragePrompt(NONCE, input);
    expect(prompt.system).toContain(revealTrusted(COVERAGE_INSTRUCTIONS));
    expect(prompt.system).toContain("assignments");
    expect(prompt.system).toContain("links array");
    expect(prompt.system).toContain("must never form a cycle");
    for (const data of [
      "C-seul",
      "Isolé",
      "F-007",
      "Exporter",
      "P-payer",
      "C-api",
      "RL-client",
      "ADR-001",
      "Privilégier",
    ]) {
      expect(prompt.system, data).not.toContain(data);
    }
  });

  it("trous, composants connus, rôles, décisions et consigne de l'équipe en blocs délimités par le nonce", () => {
    const { user } = coveragePrompt(NONCE, input);
    expect(user).toContain("F-007 | Exporter les factures");
    expect(user).toContain("P-payer | Payer une commande");
    expect(user).toContain("C-api | API | Noyau | service");
    expect(user).toContain("RL-client | Client");
    expect(user).toContain("ADR-001");
    expect(user).toContain("origin=user-input");
    expect(user).toContain("Components without any dependency\nC-seul | Isolé | Bord | store");
    expect(user.match(new RegExp(`nonce=${NONCE}>>>`, "g"))?.length).toBeGreaterThanOrEqual(9);
  });

  it("TK-114d (B653) : consigne rôle → application d'abord, entries et actors ; rôles sans application en donnée", () => {
    const { system, user } = coveragePrompt(NONCE, input);
    expect(system).toContain("an entries array");
    expect(system).toContain("an actors array");
    expect(system).toContain("a role must first reach an application");
    expect(system).toContain("one application may gather several roles");
    for (const data of ["RL-invite", "Invité", "C-base"]) expect(system, data).not.toContain(data);
    expect(user).toContain(
      "Roles without an entry application\nRL-invite | Invité | C-api, C-base\nRL-seul | Seul | none",
    );
  });

  it("la responsabilité et les liens d'un composant indexé n'entrent jamais ; sans consigne : pas de bloc user-input", () => {
    const indexed = {
      ...input,
      instruction: null,
      components: [
        {
          specId: "C-api",
          title: "API",
          zone: null,
          type: "service",
          responsibility: "SECRET-RESP",
          owns: ["T-secret"],
          serves: ["F-secret"],
          dependsOn: [{ to: "C-secret", via: "VIA-SECRET" }],
        },
      ],
      packet: {
        ...input.packet,
        components: [
          {
            specId: "C-seul",
            title: "Isolé",
            zone: null,
            type: "store",
            responsibility: "SECRET-RESP-2",
          },
        ],
      },
    };
    const { user } = coveragePrompt(NONCE, indexed);
    expect(user).toContain("C-api | API | none | service");
    expect(user).toContain("C-seul | Isolé | none | store");
    for (const absent of [
      "SECRET-RESP",
      "T-secret",
      "F-secret",
      "C-secret",
      "VIA-SECRET",
      "origin=user-input",
    ]) {
      expect(user, absent).not.toContain(absent);
    }
  });
});
