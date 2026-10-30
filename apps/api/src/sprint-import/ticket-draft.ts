import {
  parseTicketPackage,
  type Sensitivity,
  TICKET_PACKAGES,
  type TicketPackage,
} from "@koklo/domain";
import type { ParsedCriterion, ParsedTicket } from "./parsed-sprint.ts";
import type { ReasonCode, Severity } from "./report.ts";

/** Ticket en cours de lecture : champs reçus tels quels, validés à la fermeture (`finalizeDraft`). */
export interface Draft {
  line: number;
  rawHead: string;
  key: string | null;
  title: string;
  checked: boolean;
  zoneIndex: number;
  status: "livrée" | "rouverte" | null;
  labels: string[] | null;
  depends: string[] | null;
  source: string | null;
  todo: string[] | null;
  criteria: ParsedCriterion[] | null;
  open: "todo" | "criteria" | null;
  seen: Set<string>;
}

export interface Problem {
  code: ReasonCode;
  severity: Severity;
  message: string;
}

export const TITLE_MAX = 300;
export const DESCRIPTION_MAX = 20_000;
export const STATEMENT_MAX = 2_000;

const isPackage = (value: string): value is TicketPackage =>
  (TICKET_PACKAGES as readonly string[]).includes(value);

/** Table fermée : paquet déduit du préfixe du titre quand le label `pkg:*` manque. */
export function inferPackage(title: string): TicketPackage | null {
  const scoped = /^(?:apps|packages)\/([a-z0-9-]+)/.exec(title)?.[1];
  if (scoped && isPackage(scoped)) return scoped;
  if (/^e2e\b/i.test(title)) return "e2e";
  if (/^web\s*:/i.test(title)) return "web";
  return null;
}

interface PackageChoice {
  pkg: TicketPackage | null;
  inferred: boolean;
  problem: Problem | null;
}

const failure = (message: string): Problem => ({
  code: "missing-package",
  severity: "error",
  message,
});

function choosePackage(labels: readonly string[], title: string): PackageChoice {
  const declared = labels.filter((l) => l.startsWith("pkg:")).map((l) => l.slice(4));
  if (declared.length === 0) {
    const pkg = inferPackage(title);
    const problem: Problem = pkg
      ? { code: "missing-package", severity: "warning", message: `paquet déduit du titre : ${pkg}` }
      : failure("aucun label pkg:* et paquet non déductible du titre");
    return { pkg, inferred: pkg !== null, problem };
  }
  if (declared.length > 1)
    return { pkg: null, inferred: false, problem: failure("plusieurs labels pkg:*") };
  try {
    return { pkg: parseTicketPackage(declared[0]), inferred: false, problem: null };
  } catch {
    return { pkg: null, inferred: false, problem: failure(`paquet inconnu : ${declared[0]}`) };
  }
}

function chooseSensitivity(labels: readonly string[]): Sensitivity | null {
  const found = new Set(labels.filter((l) => l === "safe" || l === "sensitive"));
  const [only] = [...found];
  return found.size === 1 ? (only as Sensitivity) : null;
}

function stateOf(draft: Draft): { state: "done" | "todo"; conflict: Problem | null } {
  const byBox = draft.checked ? "done" : "todo";
  const byStatus = draft.status === null ? byBox : draft.status === "livrée" ? "done" : "todo";
  const conflict: Problem | null =
    byStatus === byBox
      ? null
      : {
          code: "status-conflict",
          severity: "warning",
          message: `case ${draft.checked ? "cochée" : "vide"} mais statut « ${draft.status} » : le statut l'emporte`,
        };
  return { state: byStatus, conflict };
}

const describe = (draft: Draft): string => {
  const parts = [(draft.todo ?? []).join("\n"), draft.source ? `Source : ${draft.source}` : ""];
  return parts.filter((part) => part !== "").join("\n\n");
};

function sizeProblems(title: string, description: string, criteria: ParsedCriterion[]): Problem[] {
  const tooLong = (what: string): Problem => ({
    code: "unknown-line",
    severity: "error",
    message: `${what} trop long`,
  });
  return [
    ...(title.length > TITLE_MAX ? [tooLong("titre")] : []),
    ...(description.length > DESCRIPTION_MAX ? [tooLong("description")] : []),
    ...(criteria.some((c) => c.statement.length > STATEMENT_MAX) ? [tooLong("critère")] : []),
  ];
}

/** Valide un ticket lu : un ticket sans paquet ou sans sensibilité est rejeté, jamais défauté. */
export function finalizeDraft(draft: Draft): { ticket: ParsedTicket | null; problems: Problem[] } {
  const labels = draft.labels ?? [];
  const choice = choosePackage(labels, draft.title);
  const sensitivity = chooseSensitivity(labels);
  const { state, conflict } = stateOf(draft);
  const description = describe(draft);
  const criteria = draft.criteria ?? [];
  const problems = [
    ...(choice.problem ? [choice.problem] : []),
    ...(sensitivity ? [] : [sensitivityProblem(draft.labels)]),
    ...(conflict ? [conflict] : []),
    ...sizeProblems(draft.title, description, criteria),
  ];
  if (problems.some((p) => p.severity === "error") || !choice.pkg || !sensitivity || !draft.key) {
    return { ticket: null, problems };
  }
  const ticket: ParsedTicket = {
    key: draft.key,
    title: draft.title,
    line: draft.line,
    state,
    pkg: choice.pkg,
    packageInferred: choice.inferred,
    sensitivity,
    labels: labels.filter((l) => !l.startsWith("pkg:") && l !== "safe" && l !== "sensitive"),
    dependsOn: draft.depends ?? [],
    description,
    criteria,
  };
  return { ticket, problems };
}

const sensitivityProblem = (labels: string[] | null): Problem => ({
  code: "missing-sensitivity",
  severity: "error",
  message:
    labels === null ? "ligne Labels absente" : "sensibilité (safe ou sensitive) absente ou ambiguë",
});
