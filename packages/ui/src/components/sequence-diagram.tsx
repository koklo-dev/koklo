import { type ReactNode, useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { ARCH_NODE_LABELS, type ArchNodeKind } from "./arch-node-card.tsx";

export interface SequenceParticipant {
  id: string;
  name: string;
  type: ArchNodeKind;
}

export interface SequenceMessage {
  from: string;
  to: string;
  text: string;
  /** Retour de l'appel : flèche pointillée en sens inverse. */
  reply?: string | undefined;
  /** Échec de l'appel : flèche pointillée rouge en sens inverse. */
  error?: string | undefined;
}

export type SequenceItem =
  | ({ kind: "message" } & SequenceMessage)
  | { kind: "alt"; label: string; messages: readonly SequenceMessage[] }
  | { kind: "separator"; label: string };

export interface SequenceDiagramProps {
  /** Titre du flux, repris dans le nom accessible : « Diagramme de séquence <titre>, N messages ». */
  title: string;
  participants: readonly SequenceParticipant[];
  items: readonly SequenceItem[];
  className?: string | undefined;
}

type ArrowKind = "call" | "reply" | "error";
interface Arrow {
  n: number;
  kind: ArrowKind;
  from: number;
  to: number;
  y: number;
  text: string;
}
interface Note {
  text: string;
  y: number;
  kind: "alt" | "separator";
}
interface Frame {
  y: number;
  height: number;
}
interface Plan {
  arrows: Arrow[];
  notes: Note[];
  frames: Frame[];
  height: number;
}

const WIDTH = 820;
const MARGIN = 60;
const HEAD_WIDTH = 112;
const FIRST_Y = 78;
const ROW = 40;
const ALT_HEADER = 18;

const HEAD_ICONS: Record<ArchNodeKind, IconName> = {
  actor: "person",
  app: "desktop_windows",
  service: "hub",
  store: "database",
  queue: "lists",
  ext: "cloud",
};

const columnX = (index: number, count: number): number =>
  count < 2 ? WIDTH / 2 : MARGIN + (index * (WIDTH - 2 * MARGIN)) / (count - 1);

/** Flèches d'un message : l'appel, puis son retour et son échec en sens inverse. */
function arrowsOf(message: SequenceMessage, ids: readonly string[], start: number, y: number) {
  const from = Math.max(0, ids.indexOf(message.from));
  const to = Math.max(0, ids.indexOf(message.to));
  const parts: Array<[ArrowKind, number, number, string]> = [["call", from, to, message.text]];
  if (message.reply !== undefined) parts.push(["reply", to, from, message.reply]);
  if (message.error !== undefined) parts.push(["error", to, from, message.error]);
  return parts.map(([kind, a, b, text], index) => ({
    n: start + index,
    kind,
    from: a,
    to: b,
    y: y + index * ROW,
    text,
  }));
}

/** Positions des flèches, notes et cadres `alt` : une ligne de 40 px par flèche, 40 par séparateur (maquette 13 l.814-835). */
function planOf(items: readonly SequenceItem[], ids: readonly string[]): Plan {
  const plan: Plan = { arrows: [], notes: [], frames: [], height: 0 };
  let y = FIRST_Y;
  const add = (message: SequenceMessage) => {
    const arrows = arrowsOf(message, ids, plan.arrows.length + 1, y);
    plan.arrows.push(...arrows);
    y += arrows.length * ROW;
  };
  for (const item of items) {
    if (item.kind === "message") {
      add(item);
    } else if (item.kind === "separator") {
      plan.notes.push({ text: item.label, y: y - 12, kind: "separator" });
      y += ROW;
    } else {
      const top = y - 22;
      plan.notes.push({ text: item.label, y: y - 18, kind: "alt" });
      y += ALT_HEADER;
      for (const message of item.messages) add(message);
      plan.frames.push({ y: top, height: y - top - 16 });
    }
  }
  plan.height = y + 10;
  return plan;
}

const STROKE: Record<ArrowKind, string> = {
  call: "stroke-foreground",
  reply: "stroke-muted-foreground",
  error: "stroke-destructive",
};
const FILL: Record<ArrowKind, string> = {
  call: "fill-foreground",
  reply: "fill-muted-foreground",
  error: "fill-destructive",
};
const TEXT: Record<ArrowKind, string> = {
  call: "text-foreground",
  reply: "text-muted-foreground",
  error: "text-destructive",
};

/** Un message est lu « de A vers B » : l'alternative textuelle du schéma, sans la position ni le trait. */
function readable(arrow: Arrow, names: readonly string[]): string {
  const kind = arrow.kind === "error" ? "Échec : " : arrow.kind === "reply" ? "Retour : " : "";
  return `${names[arrow.from]} vers ${names[arrow.to]} : ${kind}${arrow.text}`;
}

function Heads({ participants }: { participants: readonly SequenceParticipant[] }) {
  return participants.map((participant, index) => (
    <span
      key={participant.id}
      data-slot="sequence-head"
      style={{
        left: columnX(index, participants.length) - HEAD_WIDTH / 2,
        width: HEAD_WIDTH,
        height: 36,
      }}
      className={cn(
        "absolute top-3 box-border flex items-center justify-center gap-1.5 border bg-background px-2 text-caption font-semibold text-foreground",
        participant.type === "actor" ? "rounded-full" : "rounded-lg",
        participant.type === "ext" && "border-dashed",
      )}
    >
      <Icon
        name={HEAD_ICONS[participant.type]}
        size={16}
        className="shrink-0 text-secondary-foreground"
      />
      <span
        className="min-w-0 truncate"
        title={`${ARCH_NODE_LABELS[participant.type]} ${participant.name}`}
      >
        {participant.name}
      </span>
    </span>
  ));
}

/** Notes : libellé d'un bloc `alt` (pastille rouge pâle) et séparateur sur toute la largeur. */
function Notes({ notes }: { notes: readonly Note[] }): ReactNode {
  return notes.map((note) =>
    note.kind === "separator" ? (
      <span
        key={`${note.y}-${note.text}`}
        data-slot="sequence-separator"
        style={{ top: note.y }}
        className="absolute right-6 left-6 flex h-6 items-center justify-center border-border-strong border-y border-dashed bg-background text-caption font-semibold text-muted-foreground"
      >
        {note.text}
      </span>
    ) : (
      <span
        key={`${note.y}-${note.text}`}
        data-slot="sequence-alt"
        style={{ top: note.y }}
        className="absolute left-[30px] rounded-[5px] bg-destructive/10 px-2 py-px text-[11px] font-semibold text-destructive"
      >
        {note.text}
      </span>
    ),
  );
}

function Markers({ id }: { id: string }) {
  return (
    <defs>
      {(Object.keys(FILL) as ArrowKind[]).map((kind) => (
        <marker
          key={kind}
          id={`${id}-${kind}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className={FILL[kind]} />
        </marker>
      ))}
    </defs>
  );
}

/** Cadres des blocs `alt` et lignes de vie : le fond du dessin. */
function Frame({ plan, count }: { plan: Plan; count: number }) {
  return (
    <>
      {plan.frames.map((frame) => (
        <rect
          key={frame.y}
          x={24}
          y={frame.y}
          width={WIDTH - 48}
          height={frame.height}
          rx={8}
          strokeDasharray="4 3"
          className="fill-destructive/10 stroke-destructive"
        />
      ))}
      {Array.from({ length: count }, (_, index) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: une ligne de vie par colonne, sans identité propre
          key={index}
          x1={columnX(index, count)}
          y1={52}
          x2={columnX(index, count)}
          y2={plan.height - 10}
          strokeWidth={1.5}
          strokeDasharray="3 4"
          className="stroke-border-strong"
        />
      ))}
    </>
  );
}

/** Flèches : appel plein, retour et échec pointillés, pointe au bout. */
function Arrows({ plan, count, markerId }: { plan: Plan; count: number; markerId: string }) {
  return plan.arrows.map((arrow) => {
    const a = columnX(arrow.from, count);
    const b = columnX(arrow.to, count);
    return (
      <line
        key={arrow.n}
        data-arrow={arrow.kind}
        x1={a + (b > a ? 4 : -4)}
        y1={arrow.y}
        x2={b + (b > a ? -6 : 6)}
        y2={arrow.y}
        strokeWidth={1.5}
        strokeDasharray={arrow.kind === "call" ? undefined : "5 4"}
        markerEnd={`url(#${markerId}-${arrow.kind})`}
        className={STROKE[arrow.kind]}
      />
    );
  });
}

/** Texte de chaque message, numéroté, posé au-dessus de sa flèche. */
function ArrowLabels({ plan, count }: { plan: Plan; count: number }) {
  return plan.arrows.map((arrow) => {
    const a = columnX(arrow.from, count);
    const b = columnX(arrow.to, count);
    return (
      <span
        key={arrow.n}
        style={{ left: Math.min(a, b), width: Math.abs(b - a), top: arrow.y - 20 }}
        className={cn(
          "absolute whitespace-nowrap text-center text-caption font-normal leading-4",
          TEXT[arrow.kind],
        )}
      >
        <span className="mr-1 font-mono text-[10px] text-muted-foreground">{`${arrow.n}.`}</span>
        {arrow.text}
      </span>
    );
  });
}

/**
 * Diagramme de séquence d'un flux (DESIGN.md §5.23, maquette 13 l.814-835) : en-têtes de 112 × 36 (pilule pour
 * l'acteur, pointillé pour l'externe), lignes de vie, appels pleins, retours pointillés, échecs en rouge, bloc `alt`
 * encadré et séparateur. Le dessin est une image nommée « Diagramme de séquence X, N messages » ; la liste numérotée
 * « Lire les messages » en est l'alternative textuelle. Tout texte est rendu en texte brut. Le cadre défile à
 * l'horizontale (focusable) sous 820 px.
 */
export function SequenceDiagram({ title, participants, items, className }: SequenceDiagramProps) {
  const markerId = useId().replace(/:/g, "");
  const names = participants.map((participant) => participant.name);
  const plan = planOf(
    items,
    participants.map((participant) => participant.id),
  );
  const count = participants.length;
  const label = `Diagramme de séquence ${title}, ${plan.arrows.length} ${plan.arrows.length > 1 ? "messages" : "message"}`;
  return (
    <div data-slot="sequence-diagram" className={cn("flex flex-col gap-2", className)}>
      <section
        aria-label={`${label}, défilement horizontal`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante, atteignable au clavier
        tabIndex={0}
        className="overflow-auto rounded-xl border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          role="img"
          aria-label={label}
          style={{ width: WIDTH, height: plan.height }}
          className="relative"
        >
          <svg aria-hidden="true" width={WIDTH} height={plan.height} className="absolute inset-0">
            <Markers id={markerId} />
            <Frame plan={plan} count={count} />
            <Arrows plan={plan} count={count} markerId={markerId} />
          </svg>
          <Heads participants={participants} />
          <ArrowLabels plan={plan} count={count} />
          <Notes notes={plan.notes} />
        </div>
      </section>
      <details className="text-meta">
        <summary className="cursor-pointer rounded-md py-1 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Lire les messages
        </summary>
        <ol className="m-0 mt-1 flex list-decimal flex-col gap-1 pl-6">
          {plan.arrows.map((arrow) => (
            <li key={arrow.n} className={arrow.kind === "error" ? "text-destructive" : undefined}>
              {readable(arrow, names)}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
