import type { OverviewStat } from "@koklo/contract";
import type { ProjectPhase } from "../project/project-shell.ts";
import type { FunctionalState } from "./overview-deliverables.ts";
import { DELIVERABLE_TOTAL, formatDay, plural } from "./overview-texts.ts";

export interface StatsFacts {
  phase: ProjectPhase;
  audience: "team" | "client";
  /** Projet neuf : tout est vide, aucune carte (03 §10). */
  fresh: boolean;
  maturity: { stable: number; total: number };
  pendingProposals: number;
  /** Messages du client cette semaine ; `null` sans client lié (source absente). */
  clientMessages: number | null;
  ideaVersion: { number: number; tag: string; frozenAt: Date } | null;
  validatedDeliverables: number;
  functional: FunctionalState;
  hasClient: boolean;
  suggestions: { open: number; first: { key: string; body: string } | null };
  head: { shortSha: string; indexedAt: Date; versions: number } | null;
  sprint: { key: string; done: number; total: number } | null;
}

const NONE_PENDING = "Aucune en attente";
const SUGGESTION_NOTE_MAX = 60;

const stat = (
  key: string,
  icon: string,
  label: string,
  value: string | number,
  note: string,
  gauge?: { done: number; total: number },
): OverviewStat => ({ key, icon, label, value: String(value), ...(gauge ? { gauge } : {}), note });

const clip = (text: string): string =>
  text.length > SUGGESTION_NOTE_MAX ? `${text.slice(0, SUGGESTION_NOTE_MAX - 1)}…` : text;

function ideaStats(f: StatsFacts): OverviewStat[] {
  const client = f.audience === "client";
  const stats = [
    stat(
      "maturity",
      "lightbulb",
      "Maturité du dossier",
      `${f.maturity.stable} sur ${f.maturity.total}`,
      "pages stables",
      {
        done: f.maturity.stable,
        total: f.maturity.total,
      },
    ),
    stat(
      "proposals",
      "rate_review",
      "Propositions à relire",
      f.pendingProposals,
      f.pendingProposals === 0 ? NONE_PENDING : "de l'agent",
    ),
  ];
  if (f.clientMessages !== null) {
    stats.push(
      client
        ? stat("exchanges", "forum", "Vos échanges", f.clientMessages, "messages cette semaine")
        : stat(
            "exchanges",
            "forum",
            "Échanges avec le client",
            f.clientMessages,
            "messages du client cette semaine",
          ),
    );
  }
  if (f.ideaVersion) {
    const when = `figée le ${formatDay(f.ideaVersion.frozenAt)}`;
    stats.push(
      client
        ? stat(
            "version",
            "cloud_done",
            "Dernière mise à jour",
            `Version ${f.ideaVersion.number}`,
            when,
          )
        : stat("version", "cloud_done", "Dernière version", f.ideaVersion.tag, when),
    );
  }
  return stats;
}

function clientCards(f: StatsFacts): OverviewStat[] {
  const client = f.audience === "client";
  const first = f.suggestions.first;
  const suggestionNote =
    f.suggestions.open === 0 || !first ? NONE_PENDING : `${first.key} · ${clip(first.body)}`;
  return [
    stat(
      "validations",
      "person",
      client ? "À valider par vous" : "Validations client attendues",
      f.functional.pending,
      client ? "fonctionnalités du cahier fonctionnel" : "fonctionnel, obligatoire",
    ),
    stat(
      "suggestions",
      "chat_bubble",
      client ? "Vos suggestions" : "Suggestions du client",
      f.suggestions.open,
      suggestionNote,
    ),
  ];
}

function specVersionStat(f: StatsFacts, head: NonNullable<StatsFacts["head"]>): OverviewStat {
  if (f.audience === "client") {
    return stat(
      "spec_version",
      "commit",
      "Dernière mise à jour",
      formatDay(head.indexedAt),
      "de la spec",
    );
  }
  const versions = `${head.versions} ${plural(head.versions, "version", "versions")}`;
  return stat(
    "spec_version",
    "commit",
    "Version de la spec",
    head.shortSha,
    `${versions} depuis le début`,
  );
}

function framingStats(f: StatsFacts): OverviewStat[] {
  const validated = f.validatedDeliverables;
  const deliverables = stat(
    "deliverables",
    "inventory_2",
    "Livrables validés",
    `${validated} sur ${DELIVERABLE_TOTAL}`,
    "livrables du cadrage",
    { done: validated, total: DELIVERABLE_TOTAL },
  );
  return [
    deliverables,
    ...(f.hasClient ? clientCards(f) : []),
    ...(f.head ? [specVersionStat(f, f.head)] : []),
  ];
}

function sprintStats({ sprint }: StatsFacts): OverviewStat[] {
  return sprint
    ? [
        stat(
          "sprint",
          "flag",
          `Sprint ${sprint.key}`,
          `${sprint.done} sur ${sprint.total}`,
          "tickets terminés",
          {
            done: sprint.done,
            total: sprint.total,
          },
        ),
      ]
    : [];
}

/** Indicateurs de la phase : un zéro mesuré s'affiche, une source absente retire la carte (B275). */
export function statsOf(facts: StatsFacts): OverviewStat[] {
  if (facts.fresh) return [];
  if (facts.phase === "idea") return ideaStats(facts);
  return facts.phase === "framing" ? framingStats(facts) : sprintStats(facts);
}
