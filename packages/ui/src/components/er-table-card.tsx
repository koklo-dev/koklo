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
  className?: string;
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
    <div
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
    </div>
  );
}

/**
 * Carte d'une table du diagramme entité-relation (DESIGN.md §5.18, maquette 11 l.404-412) : nom et identifiant, puis
 * une ligne par champ. Élément de liste : à poser dans un `ul`. L'état « à relire » est doublé d'une pastille texte,
 * jamais porté par la seule bordure. « Rejetée » s'estompe par les jetons (fond `--surface`, texte `--muted-foreground`,
 * nom barré) et non par l'opacité : un texte à 40 % ne passe pas le contraste AA (axe).
 */
export function ErTableCard({ id, name, fields, state, className }: ErTableCardProps) {
  const count = fields.length;
  return (
    <li
      data-slot="er-table-card"
      data-spec-id={id}
      aria-label={`Table ${name}, ${count} ${count >= 2 ? "champs" : "champ"}`}
      className={cn(
        "mb-0 flex w-[230px] max-w-full flex-col overflow-hidden rounded-[10px] border bg-background pb-1.5 text-foreground",
        state === "review" ? "border-dashed border-border" : "border-border",
        state === "rejected" && "bg-surface text-muted-foreground",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-2.5 py-2",
          state === "rejected"
            ? "bg-surface text-muted-foreground"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        <Icon name="table" size={16} aria-hidden="true" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left text-meta font-semibold",
            state === "rejected" && "line-through",
          )}
        >
          {name}
        </span>
        <span className={cn("font-mono text-[10px]", state !== "rejected" && "opacity-80")}>
          {id}
        </span>
      </div>
      {state ? (
        <div className="px-2.5 pt-1.5">
          <Pill size="xs" tone={state === "review" ? "soft" : "outline"}>
            {STATE_LABEL[state]}
          </Pill>
        </div>
      ) : null}
      {fields.map((field) => (
        <FieldRow key={field.name} field={field} />
      ))}
    </li>
  );
}
