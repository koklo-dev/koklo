import { describe, expect, it } from "vitest";
import { parseSprintFile } from "../src/sprint-import/parse-sprint-file.ts";
import { REASON_CODES } from "../src/sprint-import/report.ts";
import { fixtureSources } from "./helpers/sprint-import.ts";

/**
 * TK-34, critère 1 : la fixture est la copie réelle des 17 fichiers du vault. Le parseur est pur
 * (aucune E/S) : il classe chaque ligne de la zone `## ✅ Tasks`, sans jamais en perdre une.
 */
const parsed = fixtureSources().map((source) => parseSprintFile(source.fileName, source.text));
const tickets = parsed.flatMap((sprint) => sprint.tickets);
const byKey = (key: string) => {
  const ticket = tickets.find((candidate) => candidate.key === key);
  if (!ticket) {
    throw new Error(`ticket ${key} absent du résultat`);
  }
  return ticket;
};
const lines = parsed.flatMap((sprint) => sprint.report);

describe("fixture réelle : sprints et tickets", () => {
  it("lit 17 sprints SP-1..SP-17 et 86 tickets TK-1..TK-86 sans trou ni doublon", () => {
    expect(parsed.map((sprint) => sprint.key)).toEqual(
      Array.from({ length: 17 }, (_, i) => `SP-${i + 1}`),
    );
    expect(parsed.map((sprint) => sprint.number)).toEqual(
      Array.from({ length: 17 }, (_, i) => i + 1),
    );
    expect(tickets).toHaveLength(86);
    expect(
      tickets.map((ticket) => ticket.key).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))),
    ).toEqual(Array.from({ length: 86 }, (_, i) => `TK-${i + 1}`));
    expect(parsed.flatMap((sprint) => sprint.rejected)).toEqual([]);
  });

  it("le nombre de têtes de ticket détectées égale tickets lus + tickets rejetés, fichier par fichier", () => {
    for (const sprint of parsed) {
      expect(sprint.ticketHeads, sprint.fileName).toBe(
        sprint.tickets.length + sprint.rejected.length,
      );
    }
  });

  it("sprint-017 est un sprint sans ticket, importable, avec son objectif et sa DoD", () => {
    const last = parsed[16];
    expect(last?.tickets).toEqual([]);
    expect(last?.goal).toContain("trois tickets R6 consécutifs");
    expect(last?.definitionOfDone).toContain("Critère de bascule constaté");
    expect(lines.some((l) => l.file === "sprint-017.md" && l.code === "sprint-without-tasks")).toBe(
      true,
    );
  });
});

describe("fixture réelle : sprints et tickets (suite 2)", () => {
  it("conserve les titres libres tels quels (backticks, deux-points, barres)", () => {
    expect(byKey("TK-12").title).toBe("apps/worker : démarrage pg-boss et job noop");
    expect(byKey("TK-85").title).toBe(
      "apps/web : gabarit `sidebar-07` et connexion `login-05` (blocs shadcn/ui)",
    );
  });

  it("porte description (À faire) et critères (case cochée = prouvé)", () => {
    const worker = byKey("TK-12");
    expect(worker.description).toContain("Processus séparé, consommateur pg-boss");
    expect(worker.description).toContain("Job `noop` enregistré et traité");
    expect(worker.criteria).toEqual([
      {
        statement: "Test d'intégration : un job `noop` publié est consommé et marqué terminé",
        proven: true,
      },
    ]);
    expect(byKey("TK-34").criteria.every((criterion) => !criterion.proven)).toBe(true);
  });
});

describe("fixture réelle : paquet, sensibilité, état", () => {
  it("83 paquets explicites et 3 déduits (TK-10, TK-15, TK-85), consignés en avertissement", () => {
    const inferred = tickets.filter((ticket) => ticket.packageInferred).map((t) => t.key);
    expect(inferred.sort()).toEqual(["TK-10", "TK-15", "TK-85"]);
    expect(tickets.filter((ticket) => !ticket.packageInferred)).toHaveLength(83);
    expect([byKey("TK-10").pkg, byKey("TK-15").pkg, byKey("TK-85").pkg]).toEqual([
      "api",
      "e2e",
      "web",
    ]);
    const warned = lines
      .filter((l) => l.code === "missing-package")
      .map((l) => [l.key, l.severity]);
    expect(warned).toEqual([
      ["TK-10", "warning"],
      ["TK-15", "warning"],
      ["TK-85", "warning"],
    ]);
  });

  it("le paquet n'est jamais une étiquette ; l'étiquette de sensibilité n'en est pas une non plus", () => {
    for (const ticket of tickets) {
      expect(
        ticket.labels.filter(
          (label) => label.startsWith("pkg:") || label === "safe" || label === "sensitive",
        ),
      ).toEqual([]);
    }
  });

  it("12 tickets sensitive et 74 safe", () => {
    expect(tickets.filter((ticket) => ticket.sensitivity === "sensitive")).toHaveLength(12);
    expect(tickets.filter((ticket) => ticket.sensitivity === "safe")).toHaveLength(74);
  });
});

describe("fixture réelle : paquet, sensibilité, état (suite 2)", () => {
  it("TK-85 (rouverte, case vide) est todo ; TK-4 (livrée par doublon) est done", () => {
    expect(byKey("TK-85").state).toBe("todo");
    expect(byKey("TK-4").state).toBe("done");
    expect(tickets.filter((ticket) => ticket.state === "done")).toHaveLength(35);
    expect(tickets.filter((ticket) => ticket.state === "todo")).toHaveLength(51);
  });
});

describe("fixture réelle : dépendances", () => {
  it("lit la dépendance en avant TK-14 -> TK-84 et les dépendances inter-sprints", () => {
    expect(byKey("TK-14").dependsOn).toEqual(["TK-11", "TK-84"]);
    expect(byKey("TK-30").dependsOn).toEqual(["TK-26", "TK-28", "TK-29"]);
    expect(byKey("TK-12").dependsOn).toEqual(["TK-7"]);
  });

  it("« aucune » donne une liste vide et toute cible existe dans le corpus", () => {
    const known = new Set(tickets.map((ticket) => ticket.key));
    for (const ticket of tickets) {
      expect(
        ticket.dependsOn.every((target) => known.has(target)),
        ticket.key,
      ).toBe(true);
    }
    expect(tickets.some((ticket) => ticket.dependsOn.length === 0)).toBe(true);
  });
});

describe("fixture réelle : rapport des lignes", () => {
  it("0 ligne unknown-line et 0 erreur", () => {
    expect(lines.filter((l) => l.code === "unknown-line")).toEqual([]);
    expect(lines.filter((l) => l.severity === "error")).toEqual([]);
  });

  it("chaque ligne du rapport porte fichier, numéro, texte et un code de la liste fermée", () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(REASON_CODES).toContain(l.code);
      expect(l.file).toMatch(/^sprint-[0-9]{3}\.md$/);
      expect(l.line).toBeGreaterThan(0);
      expect(typeof l.text).toBe("string");
      expect(["ignored", "warning", "error"]).toContain(l.severity);
    }
  });

  it("la liste fermée des codes est exactement celle du ticket", () => {
    expect([...REASON_CODES].sort()).toEqual(
      [
        "blank",
        "comment",
        "dependency-cycle",
        "dependency-target-missing",
        "deleted-ticket-conflict",
        "field-not-imported",
        "human-action",
        "missing-package",
        "missing-sensitivity",
        "section-not-imported",
        "sprint-conflict",
        "sprint-dod",
        "sprint-without-tasks",
        "status-conflict",
        "status-line-unparsable",
        "title-conflict",
        "unknown-line",
      ].sort(),
    );
  });
});

describe("fixture réelle : rapport des lignes (suite 2)", () => {
  it("les actions humaines et champs Agent/Workflow sont ignorés avec leur raison, jamais perdus", () => {
    expect(
      lines.filter((l) => l.file === "sprint-017.md" && l.code === "human-action"),
    ).toHaveLength(6);
    const agents = lines.filter((l) => l.code === "field-not-imported");
    expect(agents.length).toBeGreaterThanOrEqual(2 * 86);
    expect(agents.every((l) => l.severity === "ignored")).toBe(true);
  });

  it("compte de lignes classées = compte de lignes de la zone Tasks, pour chaque fichier", () => {
    for (const source of fixtureSources()) {
      const sprint = parseSprintFile(source.fileName, source.text);
      const all = source.text.split("\n");
      const start = all.findIndex((l) => l.startsWith("## ✅ Tasks"));
      const next = all.findIndex((l, i) => i > start && l.startsWith("## "));
      const zone = all.slice(start + 1, next === -1 ? undefined : next);
      expect(sprint.taskZone.length, source.fileName).toBe(zone.length);
      for (const classified of sprint.taskZone) {
        expect(["recognized", "ignored", "error"]).toContain(classified.kind);
        if (classified.kind !== "recognized") {
          expect(REASON_CODES).toContain(classified.code);
        }
      }
    }
  });

  it("le parseur est pur et déterministe", () => {
    const source = fixtureSources()[2];
    expect(parseSprintFile(source?.fileName ?? "", source?.text ?? "")).toEqual(
      parseSprintFile(source?.fileName ?? "", source?.text ?? ""),
    );
  });
});
