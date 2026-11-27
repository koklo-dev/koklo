"use client";

import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { Icon } from "../icons/icon.tsx";
import { Button } from "./button.tsx";
import { Textarea } from "./textarea.tsx";

export interface QuestionCardProps {
  title: string;
  placeholder?: string;
  value: string;
  maxLength?: number;
  pending?: boolean;
  /** La zone prend le focus à l'ouverture (défaut) ; `false` dans la galerie. */
  autoFocus?: boolean;
  /** Échec de l'envoi : le texte reste. */
  error?: string | undefined;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

/**
 * Question du client à l'équipe (DESIGN.md §5.28, maquette 15 l.212) : zone de 3 lignes au focus, « Envoyer » et
 * « Annuler » ; ⌘ ou Ctrl Entrée envoie, Échap annule.
 */
export function QuestionCard(props: QuestionCardProps) {
  const { title, placeholder, value, maxLength, pending = false, error } = props;
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const { autoFocus = true } = props;
  useEffect(() => {
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);
  const sendable = value.trim() !== "" && !pending;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onCancel();
    else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && sendable) props.onSend();
  };
  return (
    <section
      data-slot="question-card"
      aria-labelledby={id}
      className="flex flex-col gap-2 rounded-xl border border-primary px-4 py-3.5"
    >
      <h2 id={id} className="m-0 text-subsection-title">
        {title}
      </h2>
      <Textarea
        ref={area}
        rows={3}
        aria-labelledby={id}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {error ? (
        <p role="alert" className="m-0 text-meta text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-8 max-md:h-11"
          disabled={!sendable}
          onClick={props.onSend}
        >
          <Icon name="send" size={18} />
          Envoyer
        </Button>
        <Button type="button" variant="ghost" className="h-8 max-md:h-11" onClick={props.onCancel}>
          Annuler
        </Button>
      </div>
    </section>
  );
}
