import { describe, expect, it } from "vitest";
import {
  AGENT_LAUNCH_STALE_MS,
  AGENT_LAUNCH_STATUSES,
  AGENT_PROPOSAL_KINDS,
  AGENT_PROPOSE_LIMITS,
  AGENT_PROPOSE_QUEUE,
  AGENT_READS,
  agentProposeSingletonKey,
  DELIVERABLES,
  FUNCTIONAL_MODES,
  isActiveLaunch,
  isStaleLaunch,
  LAUNCH_DISCARD_REASONS,
  LAUNCH_STOP_REASONS,
  PROPOSAL_NOTIFY_AFTER_MS,
} from "../src/index.ts";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-99a constantes et règles du lancement d'agent", () => {
  it("file `agent-propose`, singleton par lancement", () => {
    expect(AGENT_PROPOSE_QUEUE).toBe("agent-propose");
    expect(agentProposeSingletonKey("abc")).toBe("abc");
  });

  it("sept livrables dans l'ordre de rédaction", () => {
    expect([...DELIVERABLES]).toEqual([
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]);
  });

  it("modes du Fonctionnel, statuts, types et plafonds de la fiche", () => {
    expect([...FUNCTIONAL_MODES]).toEqual(["complete", "criteria", "update", "all"]);
    expect([...AGENT_LAUNCH_STATUSES]).toEqual(["queued", "running", "done", "failed", "canceled"]);
    expect([...AGENT_PROPOSAL_KINDS]).toEqual([
      "feature",
      "criteria",
      "rule",
      "role",
      "flow",
      "table",
      "relations",
      "fixtures",
      "component",
      "archflow",
      "adr",
      "doc_section",
    ]);
    expect(AGENT_PROPOSE_LIMITS).toEqual({
      zones: 12,
      perZone: 25,
      perLaunch: 500,
      instruction: 500,
      segments: 8,
      links: 200,
      coverage: { features: 15, flows: 5, components: 10, calls: 30 },
    });
  });

  it("TK-114b : motifs fermés de zone écartée et d'arrêt du lancement (B618)", () => {
    expect([...LAUNCH_DISCARD_REASONS]).toEqual([
      "truncated",
      "output_invalid",
      "prompt_rejected",
      "refused",
    ]);
    expect([...LAUNCH_STOP_REASONS]).toEqual(["completed", "cap", "deadline", "cancelled"]);
  });

  it("L'agent lit, pour le Fonctionnel : dossier figé, Synthèse, risques, cahier actuel", () => {
    expect([...AGENT_READS.functional]).toEqual([
      "idea.frozen",
      "idea.synthesis",
      "idea.risks",
      "functional.current",
    ]);
  });

  it("L'agent lit, pour les Données : cahier fonctionnel, règles, rôles, parcours, modèle actuel (TK-107)", () => {
    expect([...AGENT_READS.data]).toEqual([
      "functional.features",
      "functional.rules",
      "functional.roles",
      "functional.flows",
      "data.current",
    ]);
  });

  it("L'agent lit, pour l'Architecture : Fonctionnel, tables, architecture actuelle, exigences connues (TK-111)", () => {
    expect([...AGENT_READS.architecture]).toEqual([
      "functional.features",
      "functional.rules",
      "functional.roles",
      "functional.flows",
      "data.tables",
      "architecture.current",
      "nfr.known",
    ]);
  });

  it("un lancement actif est en file ou en cours ; périmé après 5 minutes sans signal", () => {
    expect(isActiveLaunch("queued")).toBe(true);
    expect(isActiveLaunch("running")).toBe(true);
    expect(isActiveLaunch("done")).toBe(false);
    expect(AGENT_LAUNCH_STALE_MS).toBe(300_000);
    const now = new Date("2026-11-11T10:00:00Z");
    expect(isStaleLaunch("running", new Date(now.getTime() - 300_001), now)).toBe(true);
    expect(isStaleLaunch("running", new Date(now.getTime() - 299_000), now)).toBe(false);
    expect(isStaleLaunch("queued", new Date(now.getTime() - 400_000), now)).toBe(false);
    expect(isStaleLaunch("done", new Date(now.getTime() - 400_000), now)).toBe(false);
  });

  it("l'utilisateur est parti après 30 secondes sans lecture", () => {
    expect(PROPOSAL_NOTIFY_AFTER_MS).toBe(30_000);
  });
});
