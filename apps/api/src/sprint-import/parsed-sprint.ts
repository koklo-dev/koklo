import type { Sensitivity, TicketPackage } from "@koklo/domain";
import type { ReasonCode, ReportLine } from "./report.ts";

export interface ParsedCriterion {
  statement: string;
  proven: boolean;
}

export interface ParsedTicket {
  key: string;
  title: string;
  /** Ligne de la tête du ticket dans le fichier. */
  line: number;
  state: "done" | "todo";
  pkg: TicketPackage;
  packageInferred: boolean;
  sensitivity: Sensitivity;
  /** Étiquettes hors `pkg:*` et hors sensibilité. */
  labels: string[];
  dependsOn: string[];
  description: string;
  criteria: ParsedCriterion[];
}

/** Classe d'une ligne de la zone `## ✅ Tasks` : reconnue, ignorée avec raison, ou erreur. */
export type ZoneEntry =
  | { line: number; kind: "recognized" }
  | { line: number; kind: "ignored" | "error"; code: ReasonCode };

export interface ParsedSprint {
  fileName: string;
  number: number;
  key: string;
  goal: string;
  /** Ligne du titre `## 🎯 Sprint Goal` (position du conflit d'objectif). */
  goalLine: number;
  definitionOfDone: string;
  tickets: ParsedTicket[];
  /** Têtes de ticket lues mais non importables : rapportées, jamais perdues. */
  rejected: { line: number; key: string | null }[];
  ticketHeads: number;
  taskZone: ZoneEntry[];
  report: ReportLine[];
}

/** Ligne du fichier : numéro (base 1) et texte sans fin de ligne. */
export interface SourceLine {
  n: number;
  raw: string;
}
