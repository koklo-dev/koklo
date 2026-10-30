import type { ParsedTicket, ZoneEntry } from "./parsed-sprint.ts";
import type { ReasonCode, ReportLine } from "./report.ts";
import { type MarkedLine, reportLine } from "./sprint-lines.ts";
import { type Draft, finalizeDraft } from "./ticket-draft.ts";

const HEAD = /^- \[([ xX])\] \*\*\[(TK-[1-9][0-9]*)\]\*\* (\S.*)$/;
const LOOSE_HEAD = /^- \[.?\]/;
const WITHOUT_TASKS = /^Aucune tâche/;
const FIELD =
  /^ {2}- (Statut|Labels|Agent|Workflow|Dépend de|Source|À faire|Critères d'acceptation) ?:(.*)$/;
const ITEM = /^( {4,})- (.*)$/;
const CRITERION = /^\[([ xX])\] (\S.*)$/;
const STATUS = /^(?:✅|🔁)\s*\*\*(livrée|rouverte)\*\*/;
const KEY = /^TK-[1-9][0-9]*$/;

type FieldHandler = (parser: TaskZoneParser, draft: Draft, value: string, line: MarkedLine) => void;

/**
 * Classe CHAQUE ligne de la zone `## ✅ Tasks` (reconnue, ignorée avec raison, ou erreur) : le
 * parseur ne saute jamais une ligne sans la consigner (incident 21).
 */
export class TaskZoneParser {
  readonly zone: ZoneEntry[] = [];
  readonly report: ReportLine[] = [];
  readonly tickets: ParsedTicket[] = [];
  readonly rejected: { line: number; key: string | null }[] = [];
  heads = 0;
  private draft: Draft | null = null;

  constructor(private readonly file: string) {}

  get hasWithoutTasksNotice(): boolean {
    return this.report.some((entry) => entry.code === "sprint-without-tasks");
  }

  feed(line: MarkedLine): void {
    if (line.mark === "comment") {
      this.ignore(line, "comment");
      return;
    }
    if (line.mark === "progress") {
      this.ignore(line, "section-not-imported");
      return;
    }
    if (line.raw.trim() === "") {
      this.ignore(line, "blank");
      return;
    }
    if (line.raw.startsWith(" ")) {
      this.indented(line);
      return;
    }
    this.topLevel(line);
  }

  finish(): void {
    this.closeDraft();
  }

  ignore(line: MarkedLine, code: ReasonCode): void {
    this.report.push(reportLine(this.file, line, code, "ignored"));
    this.zone.push({ line: line.n, kind: "ignored", code });
  }

  recognize(line: MarkedLine): void {
    this.zone.push({ line: line.n, kind: "recognized" });
  }

  warn(line: MarkedLine, code: ReasonCode, text: string): void {
    this.report.push(reportLine(this.file, line, code, "warning", { text }));
    this.recognize(line);
  }

  fail(line: MarkedLine, message: string): void {
    this.report.push(
      reportLine(this.file, line, "unknown-line", "error", {
        text: `${line.raw.trim()} (${message})`,
      }),
    );
    this.zone.push({ line: line.n, kind: "error", code: "unknown-line" });
  }

  private topLevel(line: MarkedLine): void {
    const head = HEAD.exec(line.raw);
    if (head) {
      this.startDraft(line, head[2] ?? null, head[1] !== " ", head[3] ?? "");
      return;
    }
    if (LOOSE_HEAD.test(line.raw)) {
      this.startDraft(line, null, false, "");
      this.fail(line, "tête de ticket mal formée, attendu : - [ ] **[TK-n]** titre");
      return;
    }
    if (WITHOUT_TASKS.test(line.raw)) {
      this.ignore(line, "sprint-without-tasks");
      return;
    }
    this.fail(line, "ligne inattendue dans la zone des tâches");
  }

  private startDraft(line: MarkedLine, key: string | null, checked: boolean, title: string): void {
    this.closeDraft();
    this.heads += 1;
    this.draft = {
      line: line.n,
      rawHead: line.raw,
      key,
      title: title.trim(),
      checked,
      zoneIndex: this.zone.length,
      status: null,
      labels: null,
      depends: null,
      source: null,
      todo: null,
      criteria: null,
      open: null,
      seen: new Set(),
    };
    if (key !== null) this.recognize(line);
  }

  private indented(line: MarkedLine): void {
    const draft = this.draft;
    if (!draft) {
      this.fail(line, "ligne indentée hors d'un ticket");
      return;
    }
    const field = FIELD.exec(line.raw);
    if (field) {
      this.field(draft, line, field[1] ?? "", (field[2] ?? "").trim());
      return;
    }
    const item = ITEM.exec(line.raw);
    if (item) {
      this.item(draft, line, item[1]?.length ?? 0, item[2] ?? "");
      return;
    }
    this.fail(line, "ligne non reconnue dans un ticket");
  }

  private field(draft: Draft, line: MarkedLine, name: string, value: string): void {
    if (draft.seen.has(name)) {
      this.fail(line, `champ « ${name} » en double`);
      return;
    }
    draft.seen.add(name);
    draft.open = null;
    FIELD_HANDLERS[name]?.(this, draft, value, line);
  }

  private item(draft: Draft, line: MarkedLine, indent: number, content: string): void {
    if (draft.open === "todo") {
      draft.todo = [...(draft.todo ?? []), `${" ".repeat(indent - 4)}- ${content}`];
      this.recognize(line);
      return;
    }
    if (draft.open === "criteria") {
      this.criterion(draft, line, indent, content);
      return;
    }
    this.fail(line, "puce hors d'une liste À faire ou Critères");
  }

  private criterion(draft: Draft, line: MarkedLine, indent: number, content: string): void {
    const list = draft.criteria ?? [];
    draft.criteria = list;
    const last = list.at(-1);
    if (indent > 4 && last) {
      last.statement = `${last.statement} ${content.trim()}`;
      this.recognize(line);
      return;
    }
    const match = CRITERION.exec(content);
    if (!match || indent > 4) {
      this.fail(line, "critère sans case à cocher");
      return;
    }
    list.push({ statement: (match[2] ?? "").trim(), proven: match[1] !== " " });
    this.recognize(line);
  }

  private closeDraft(): void {
    const draft = this.draft;
    this.draft = null;
    if (!draft) return;
    if (draft.key === null) {
      this.rejected.push({ line: draft.line, key: null });
      return;
    }
    const { ticket, problems } = finalizeDraft(draft);
    const head = { n: draft.line, raw: draft.rawHead };
    for (const problem of problems) {
      this.report.push(
        reportLine(this.file, head, problem.code, problem.severity, {
          key: draft.key,
          text: `${draft.rawHead.trim()} (${problem.message})`,
        }),
      );
    }
    if (ticket) {
      this.tickets.push(ticket);
      return;
    }
    this.rejected.push({ line: draft.line, key: draft.key });
    const code = problems.find((p) => p.severity === "error")?.code ?? "unknown-line";
    this.zone[draft.zoneIndex] = { line: draft.line, kind: "error", code };
  }
}

const startList =
  (kind: "todo" | "criteria"): FieldHandler =>
  (parser, draft, value, line) => {
    draft.open = kind;
    if (kind === "todo") {
      draft.todo = value ? [`- ${value}`] : [];
    } else {
      draft.criteria = [];
    }
    if (kind === "criteria" && value) {
      parser.fail(line, "texte inattendu après le titre de la liste");
    } else {
      parser.recognize(line);
    }
  };

function readDepends(parser: TaskZoneParser, draft: Draft, value: string, line: MarkedLine): void {
  if (/^aucune$/i.test(value)) {
    draft.depends = [];
    parser.recognize(line);
    return;
  }
  const keys = value.split(",").map((part) => part.trim());
  draft.depends = [];
  if (!keys.every((key) => KEY.test(key))) {
    parser.fail(line, "dépendances mal formées");
    return;
  }
  draft.depends = [...new Set(keys)];
  parser.recognize(line);
}

const FIELD_HANDLERS: Record<string, FieldHandler> = {
  Statut: (parser, draft, value, line) => {
    const status = STATUS.exec(value)?.[1];
    if (status === "livrée" || status === "rouverte") {
      draft.status = status;
      parser.recognize(line);
      return;
    }
    parser.warn(line, "status-line-unparsable", line.raw.trim());
  },
  Labels: (parser, draft, value, line) => {
    draft.labels = value
      .split(",")
      .map((label) => label.trim())
      .filter((label) => label !== "");
    parser.recognize(line);
  },
  Agent: (parser, _draft, _value, line) => parser.ignore(line, "field-not-imported"),
  Workflow: (parser, _draft, _value, line) => parser.ignore(line, "field-not-imported"),
  "Dépend de": readDepends,
  Source: (parser, draft, value, line) => {
    draft.source = value;
    parser.recognize(line);
  },
  "À faire": startList("todo"),
  "Critères d'acceptation": startList("criteria"),
};
