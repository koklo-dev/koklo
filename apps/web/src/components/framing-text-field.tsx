import { Icon, Label, Textarea } from "@koklo/ui";
import type { ReactNode } from "react";
import { thousands } from "../lib/framing-labels.ts";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  help?: string | undefined;
  /** Limite de caractères : affiche le compteur « n / max ». */
  max?: number | undefined;
  error?: string | undefined;
  /** Pastille « Proposé par l'IA » à côté du libellé. */
  badge?: ReactNode;
  className?: string | undefined;
  maxLength?: number | undefined;
}

/** Champ multiligne accessible : libellé visible, aide, compteur et erreur reliés par `aria-describedby` (erreur en dernier). */
export function FramingTextField(props: Props) {
  const { id, label, value, onChange, rows = 4, help, max, error, badge, className } = props;
  const { maxLength } = props;
  const ids = {
    help: help ? `${id}-help` : null,
    counter: max ? `${id}-counter` : null,
    error: error ? `${id}-error` : null,
  };
  const describedBy = [ids.help, ids.counter, ids.error].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {badge}
      </div>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        className={className}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? (
        <p id={ids.help ?? undefined} className="text-[13px] text-muted-foreground">
          {help}
        </p>
      ) : null}
      {max ? (
        <p id={ids.counter ?? undefined} className="text-[13px] text-muted-foreground">
          {`${thousands(value.length)} / ${thousands(max)}`}
        </p>
      ) : null}
      {error ? (
        <p
          id={ids.error ?? undefined}
          className="flex items-start gap-1 text-[13px] text-destructive"
        >
          <Icon name="warning" size={16} className="mt-0.5" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
