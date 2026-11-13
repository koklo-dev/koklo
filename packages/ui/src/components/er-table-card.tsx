import { type CSSProperties, useId } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Pill } from "./pill.tsx";

/** Rôle d'un champ dans la table : clé primaire, référence vers une autre table, donnée personnelle, autre. */
export type ErFieldKind = "primary" | "reference" | "personal" | "plain";

export interface ErTableField {
  name: string;
  /** Type du format de spec : `uuid`, `texte(80)`, `ref(T-client)`… */
  type: string;
  kind?: ErFieldKind | undefined;
}

/** `review` : proposée par l'agent, pas encore enregistrée ; `rejected` : écartée à la relecture. */
export type ErTableState = "review" | "rejected";

export interface ErTableCardProps {
  id: string;
  name: string;
  fields: readonly ErTableField[];
  state?: ErTableState | undefined;
  /** Table sélectionnée (le lecteur de diagramme n'en garde qu'une) : bordure 2, en-tête et ombre `--primary`. */
  selected?: boolean | undefined;
  onSelect?: (() => void) | undefined;
  /** Zoom sous 60 % : seuls les noms restent. Le nom accessible garde « N champs ». */
  compact?: boolean | undefined;
  style?: CSSProperties | undefined;
  className?: string;
}

const HEADER_HEIGHT = 36;
const FIELD_HEIGHT = 22;
const FOOT_HEIGHT = 6;

/** Hauteur de la carte pour le placement du lecteur : en-tête 36, 22 par champ, pied 6 (maquette 11 l.376-388). */
export function erTableHeight(fieldCount: number): number {
  return HEADER_HEIGHT + FIELD_HEIGHT * fieldCount + FOOT_HEIGHT;
}

const KIND_ICON: Record<Exclude<ErFieldKind, "plain">, { icon: IconName; className: string }> = {
  primary: { icon: "key", className: "text-status-pending-icon" },
  reference: { icon: "link", className: "text-primary" },
  personal: { icon: "shield", className: "text-muted-foreground" },
};

const STATE_LABEL: Record<ErTableState, string> = { review: "À relire", rejected: "Rejetée" };

/** `ref(T-client)` se lit `→T-client` (maquette 11 l.409) ; les autres types restent tels quels. */
export function erTypeLabel(type: string): string {
  const match = /^ref\((T-[^)]+)\)$/.exec(type);
  return match ? `→${match[1]}` : type;
}

function FieldRow({ field }: { field: ErTableField }) {
  const kind = field.kind ?? "plain";
  const marker = kind === "plain" ? null : KIND_ICON[kind];
  return (
    <span
      data-slot="er-field"
      data-kind={kind}
      className="flex h-[22px] items-center gap-1.5 px-2.5 text-caption"
    >
      {marker ? (
        <Icon
          name={marker.icon}
          size={14}
          fill={kind === "primary"}
          className={marker.className}
          aria-hidden="true"
        />
      ) : (
        <span aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-left font-mono">{field.name}</span>
      <span className="shrink-0 font-mono text-code-sm text-muted-foreground">
        {erTypeLabel(field.type)}
      </span>
    </span>
  );
}

/**
 * Carte d'une table du diagramme entité-relation (DESIGN.md §5.18 et §5.19, maquette 11 l.404-412) : nom et
 * identifiant, puis une ligne par champ. Un `button` `aria-pressed` vide la recouvre (le lecteur de diagramme y pose sa
 * sélection) : son nom ne répète pas le texte visible, masqué aux lecteurs d'écran. L'état « à relire » est doublé d'une pastille texte, jamais
 * porté par la seule bordure. « Rejetée » s'estompe par les jetons (fond `--surface`, texte `--muted-foreground`, nom
 * barré) et non par l'opacité : un texte à 40 % ne passe pas le contraste AA (axe).
 */
export function ErTableCard({
  id,
  name,
  fields,
  state,
  selected = false,
  onSelect,
  compact = false,
  style,
  className,
}: ErTableCardProps) {
  const count = fields.length;
  const rejected = state === "rejected";
  const stateId = useId();
  return (
    <div
      data-slot="er-table-card"
      data-spec-id={id}
      style={style}
      className={cn(
        "relative mb-0 flex w-[230px] max-w-full flex-col overflow-hidden rounded-[10px] border bg-background pb-1.5 text-left text-foreground",
        state === "review" ? "border-dashed border-border" : "border-border",
        rejected && "bg-surface text-muted-foreground",
        selected && "border-2 border-primary shadow-floating",
        className,
      )}
    >
      {/* Le `button` est vide et recouvre la carte : son nom (« Table X, N champs ») ne double pas le texte visible,
          masqué aux lecteurs d'écran (WCAG 2.5.3, label in name). */}
      <button
        type="button"
        aria-pressed={selected}
        aria-describedby={state ? stateId : undefined}
        aria-label={`Table ${name}, ${count} ${count >= 2 ? "champs" : "champ"}`}
        onClick={onSelect}
        className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <span aria-hidden="true" className="contents">
        <span
          data-slot="er-header"
          className={cn(
            "flex items-center gap-2 border-b border-border px-2.5 py-2",
            rejected
              ? "bg-surface text-muted-foreground"
              : "bg-secondary text-secondary-foreground",
            selected && "bg-primary text-primary-foreground",
          )}
        >
          <Icon name="table" size={16} aria-hidden="true" />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left text-meta font-semibold",
              rejected && "line-through",
            )}
          >
            {name}
          </span>
          <span className={cn("font-mono text-[10px]", !rejected && "opacity-80")}>{id}</span>
        </span>
        {state ? (
          <span className="px-2.5 pt-1.5">
            <Pill id={stateId} size="xs" tone={state === "review" ? "soft" : "outline"}>
              {STATE_LABEL[state]}
            </Pill>
          </span>
        ) : null}
        {compact ? null : fields.map((field) => <FieldRow key={field.name} field={field} />)}
      </span>
    </div>
  );
}
