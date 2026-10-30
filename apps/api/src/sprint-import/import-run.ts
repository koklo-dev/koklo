import {
  addDependency,
  createDependencyGraph,
  DependencyCycleError,
  type DependencyGraph,
  parseTicketKey,
} from "@koklo/domain";
import type { TicketIdentity } from "../ticket/ticket.repository.ts";
import { toImported, validationError } from "./imported-ticket.ts";
import type { ParsedSprint, ParsedTicket } from "./parsed-sprint.ts";
import { clip, type ImportReport, type ReasonCode, type ReportLine, totalsOf } from "./report.ts";
import type { ImportStores } from "./sprint-import.repository.ts";

export interface ImportOptions {
  dryRun: boolean;
  /** Dates par défaut des sprints (les fichiers n'en portent pas), `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
}

interface SprintOutcome {
  parsed: ParsedSprint;
  id: string | null;
  created: boolean;
  /** Tous les tickets du fichier sont importés (créés ou appariés) et aucun n'est rejeté. */
  clean: boolean;
}

type TicketResult = "created" | "matched" | "conflict" | "rejected";

/**
 * Déroulé d'un import dans UNE transaction : sprints et tickets d'abord (appariement par clé,
 * jamais par titre, jamais de mise à jour d'un ticket existant), puis arêtes validées par le
 * domaine, puis fermeture des sprints soldés et relèvement des compteurs.
 */
export class ImportRun {
  readonly lines: ReportLine[] = [];
  private readonly counts = {
    sprints: { created: 0, matched: 0, conflicts: 0 },
    tickets: { created: 0, matched: 0, conflicts: 0, rejected: 0 },
    dependencies: { created: 0, present: 0, rejected: 0 },
  };
  private readonly usable = new Map<string, string>();
  private readonly corpusKeys = new Set<string>();

  constructor(
    private readonly stores: ImportStores,
    private readonly options: ImportOptions,
  ) {}

  async execute(parsed: readonly ParsedSprint[]): Promise<void> {
    for (const sprint of parsed) {
      this.counts.tickets.rejected += sprint.rejected.length;
      for (const rejected of sprint.rejected) if (rejected.key) this.corpusKeys.add(rejected.key);
      for (const ticket of sprint.tickets) this.corpusKeys.add(ticket.key);
    }
    const outcomes: SprintOutcome[] = [];
    for (const sprint of parsed) outcomes.push(await this.importSprint(sprint));
    await this.importEdges(parsed);
    await this.closeSoldSprints(outcomes);
    await this.raiseCounters(parsed);
  }

  report(parsed: readonly ParsedSprint[], dryRun: boolean): ImportReport {
    const lines = [...parsed.flatMap((sprint) => sprint.report), ...this.lines];
    return {
      dryRun,
      ok: lines.every((line) => line.severity !== "error"),
      files: parsed.length,
      ...structuredClone(this.counts),
      lines,
      totalsByCode: totalsOf(lines),
    };
  }

  private note(
    sprint: ParsedSprint,
    line: number,
    code: ReasonCode,
    text: string,
    key?: string,
  ): void {
    const entry: ReportLine = {
      file: sprint.fileName,
      line,
      text: clip(text),
      code,
      severity: "error",
    };
    this.lines.push(key === undefined ? entry : { ...entry, key });
  }

  private async importSprint(parsed: ParsedSprint): Promise<SprintOutcome> {
    const { sprints } = this.stores;
    if (parsed.goal === "") {
      this.counts.sprints.conflicts += 1;
      this.counts.tickets.rejected += parsed.tickets.length;
      return { parsed, id: null, created: false, clean: false };
    }
    const existing = await sprints.find(parsed.key);
    if (existing && existing.goal !== parsed.goal) {
      return this.sprintConflict(parsed);
    }
    let id = existing?.id ?? null;
    if (!existing) {
      const { startsOn, endsOn } = this.options;
      const record = await sprints.insert({
        number: parsed.number,
        goal: parsed.goal,
        startsOn,
        endsOn,
        definitionOfDone: parsed.definitionOfDone,
      });
      await sprints.audit("sprint.import", record.id);
      id = record.id;
    }
    this.counts.sprints[existing ? "matched" : "created"] += 1;
    const results = [];
    for (const ticket of parsed.tickets) results.push(await this.importTicket(parsed, ticket, id));
    const clean =
      parsed.rejected.length === 0 && results.every((r) => r === "created" || r === "matched");
    return { parsed, id, created: !existing, clean };
  }

  /** Sprint de même clé et d'objectif différent : jamais modifié ; ses tickets absents sont listés. */
  private async sprintConflict(parsed: ParsedSprint): Promise<SprintOutcome> {
    this.counts.sprints.conflicts += 1;
    const dropped: string[] = [];
    for (const ticket of parsed.tickets) {
      const result = await this.importTicket(parsed, ticket, null);
      if (result === "rejected") dropped.push(ticket.key);
    }
    const tail = dropped.length > 0 ? ` ; tickets non importés : ${dropped.join(", ")}` : "";
    this.note(
      parsed,
      parsed.goalLine,
      "sprint-conflict",
      `${parsed.key} existe avec un autre objectif${tail}`,
    );
    return { parsed, id: null, created: false, clean: false };
  }

  private async importTicket(
    sprint: ParsedSprint,
    ticket: ParsedTicket,
    sprintId: string | null,
  ): Promise<TicketResult> {
    const existing = await this.stores.tickets.findIncludingDeleted(ticket.key);
    if (existing) return this.matchExisting(sprint, ticket, existing);
    if (sprintId === null)
      return this.reject(sprint, ticket, "sprint non importé (conflit)", false);
    const invalid = validationError(ticket);
    if (invalid) return this.reject(sprint, ticket, invalid, true);
    const record = await this.stores.tickets.insertImported(toImported(ticket, sprintId));
    await this.stores.tickets.audit("ticket.import", record.id);
    this.usable.set(ticket.key, record.id);
    this.counts.tickets.created += 1;
    return "created";
  }

  private reject(
    sprint: ParsedSprint,
    ticket: ParsedTicket,
    why: string,
    report: boolean,
  ): TicketResult {
    this.counts.tickets.rejected += 1;
    if (report)
      this.note(sprint, ticket.line, "unknown-line", `${ticket.key} : ${why}`, ticket.key);
    return "rejected";
  }

  private matchExisting(
    sprint: ParsedSprint,
    ticket: ParsedTicket,
    found: TicketIdentity,
  ): TicketResult {
    if (found.deleted) {
      this.counts.tickets.conflicts += 1;
      this.note(
        sprint,
        ticket.line,
        "deleted-ticket-conflict",
        `${ticket.key} : clé occupée par un ticket supprimé`,
        ticket.key,
      );
      return "conflict";
    }
    if (found.title !== ticket.title) {
      this.counts.tickets.conflicts += 1;
      this.note(
        sprint,
        ticket.line,
        "title-conflict",
        `${ticket.key} existe avec un autre titre : « ${found.title} »`,
        ticket.key,
      );
      return "conflict";
    }
    this.usable.set(ticket.key, found.id);
    this.counts.tickets.matched += 1;
    return "matched";
  }

  private async importEdges(parsed: readonly ParsedSprint[]): Promise<void> {
    let graph = createDependencyGraph(await this.stores.tickets.projectEdges());
    for (const sprint of parsed) {
      for (const ticket of sprint.tickets) {
        const sourceId = this.usable.get(ticket.key);
        if (sourceId === undefined) continue;
        for (const target of ticket.dependsOn) {
          graph = await this.importEdge(graph, sprint, ticket, sourceId, target);
        }
      }
    }
  }

  private async targetId(key: string): Promise<string | null> {
    const known = this.usable.get(key);
    if (known !== undefined) return known;
    if (this.corpusKeys.has(key)) return null;
    return (await this.stores.tickets.find(key))?.id ?? null;
  }

  private async importEdge(
    graph: DependencyGraph,
    sprint: ParsedSprint,
    ticket: ParsedTicket,
    sourceId: string,
    target: string,
  ): Promise<DependencyGraph> {
    const targetId = await this.targetId(target);
    if (targetId === null) {
      return this.rejectEdge(
        graph,
        sprint,
        ticket,
        "dependency-target-missing",
        `${ticket.key} dépend de ${target} : ticket introuvable ou non importé`,
      );
    }
    let next: DependencyGraph;
    try {
      next = addDependency(graph, { ticket: ticket.key, dependsOn: target, type: "blocks" });
    } catch (error) {
      if (!(error instanceof DependencyCycleError)) throw error;
      return this.rejectEdge(
        graph,
        sprint,
        ticket,
        "dependency-cycle",
        `${ticket.key} dépend de ${target} : cycle refusé`,
      );
    }
    if (next === graph) {
      this.counts.dependencies.present += 1;
      return graph;
    }
    await this.stores.tickets.addEdge(sourceId, targetId, "blocks");
    await this.stores.tickets.audit("dependency.import", sourceId);
    this.counts.dependencies.created += 1;
    return next;
  }

  private rejectEdge(
    graph: DependencyGraph,
    sprint: ParsedSprint,
    ticket: ParsedTicket,
    code: ReasonCode,
    text: string,
  ): DependencyGraph {
    this.counts.dependencies.rejected += 1;
    this.note(sprint, ticket.line, code, text, ticket.key);
    return graph;
  }

  private async closeSoldSprints(outcomes: readonly SprintOutcome[]): Promise<void> {
    for (const { parsed, id, created, clean } of outcomes) {
      const sold = parsed.tickets.length > 0 && parsed.tickets.every((t) => t.state === "done");
      if (created && clean && sold && id !== null) {
        await this.stores.sprints.update(id, { status: "closed" });
      }
    }
  }

  private async raiseCounters(parsed: readonly ParsedSprint[]): Promise<void> {
    const ticketMax = Math.max(
      0,
      ...parsed.flatMap((s) => s.tickets.map((t) => parseTicketKey(t.key))),
    );
    const sprintMax = Math.max(0, ...parsed.map((s) => s.number));
    if (ticketMax > 0) await this.stores.tickets.raiseCounter(ticketMax);
    if (sprintMax > 0) await this.stores.sprints.raiseCounter(sprintMax);
  }
}
