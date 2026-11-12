"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";
import { Textarea } from "./textarea.tsx";

export const VALIDATION_COMMENT_MAX = 2000;

export interface ValidationPromptProps {
  /** `bar` : barre en pied d'onglet ; `inline` : sous une carte ou une fiche, filet en haut. */
  variant: "bar" | "inline";
  /** Question posée au client (« Ces 24 règles décrivent-elles bien votre activité ? ») ; facultative. */
  question?: string;
  /** Libellé de « Valider … ». */
  validateLabel: string;
  /** Titre du formulaire (« Que faut-il changer ? »). */
  askLabel?: string;
  placeholder?: string;
  onValidate: () => void;
  /** Appelé avec le texte nettoyé (1 à 2000 caractères). */
  onRequestChange: (comment: string) => void;
  /** Décision en cours : les boutons attendent. */
  pending?: boolean;
  /** Refus ou échec du dernier envoi, lu par les lecteurs d'écran. */
  error?: string | undefined;
  /** Note sous les boutons (« Votre validation porte sur la version du … »). */
  note?: ReactNode;
  /** Hauteur du champ du formulaire (3 par défaut ; 2 pour un parcours, maquette 10 l.299). */
  rows?: number;
  className?: string;
}

const BUTTON = "h-11 md:h-10";

/** Écarts de la rangée de boutons (maquette 10 l.215, 304, 321). */
const ROW_GAP = {
  bar: "gap-x-3.5 gap-y-2.5",
  inline: "gap-2",
  inlineAsking: "gap-x-3 gap-y-2",
} as const;

const FRAME: Record<ValidationPromptProps["variant"], string> = {
  bar: "rounded-xl border border-border bg-surface px-4 py-3.5",
  inline: "border-t border-border pt-3",
};

function AskForm({
  askLabel,
  placeholder,
  pending,
  rows,
  onSend,
  onCancel,
}: {
  askLabel: string;
  rows: number;
  placeholder: string | undefined;
  pending: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  useEffect(() => field.current?.focus(), []);
  const clean = text.trim();
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onCancel();
  };
  return (
    <form
      className="flex flex-col gap-2"
      onKeyDown={onKey}
      onSubmit={(event) => {
        event.preventDefault();
        if (clean) onSend(clean);
      }}
    >
      <label htmlFor={id} className="text-[13px] font-semibold">
        {askLabel}
      </label>
      <Textarea
        id={id}
        ref={field}
        rows={rows}
        maxLength={VALIDATION_COMMENT_MAX}
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" className={BUTTON} disabled={!clean || pending}>
          Envoyer à l'équipe
        </Button>
        <Button type="button" variant="ghost" className={cn(BUTTON, "px-3.5")} onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/**
 * Décision du client (DESIGN.md §5.17, maquette 10 l.211-217, 296-306, 320-324) : « Valider … » (principal, 40 px,
 * icône `check`) et « Demander un changement » qui ouvre « Que faut-il changer ? ». Échap referme le formulaire et rend
 * le focus au bouton. 44 px sous 768 px.
 */
export function ValidationPrompt({
  variant,
  question,
  validateLabel,
  askLabel = "Que faut-il changer ?",
  placeholder,
  onValidate,
  onRequestChange,
  pending = false,
  error,
  note,
  rows = 3,
  className,
}: ValidationPromptProps) {
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => {
    setAsking(false);
    requestAnimationFrame(() => opener.current?.focus());
  };
  return (
    <div
      data-slot="validation-prompt"
      data-variant={variant}
      className={cn("flex flex-col gap-2", FRAME[variant], className)}
    >
      {asking ? (
        <AskForm
          askLabel={askLabel}
          placeholder={placeholder}
          pending={pending}
          rows={rows}
          onCancel={close}
          onSend={onRequestChange}
        />
      ) : (
        <>
          <div
            className={cn(
              "flex flex-wrap items-center",
              ROW_GAP[variant === "bar" ? "bar" : question ? "inlineAsking" : "inline"],
            )}
          >
            {question ? <span className="min-w-0 flex-[1_1_260px] text-sm">{question}</span> : null}
            <Button
              type="button"
              size="lg"
              className="gap-1.5 pl-3 max-md:h-11"
              disabled={pending}
              onClick={onValidate}
            >
              <Icon name="check" size={20} />
              {validateLabel}
            </Button>
            <Button
              ref={opener}
              type="button"
              variant="outline"
              className={BUTTON}
              disabled={pending}
              onClick={() => setAsking(true)}
            >
              Demander un changement
            </Button>
          </div>
          {note ? <span className="text-caption text-muted-foreground">{note}</span> : null}
        </>
      )}
      {error ? (
        <p role="alert" className="text-meta text-alert-error-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
