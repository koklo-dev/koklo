"use client";

import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

export type AgentComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  /** Flux en cours : « Arrêter » remplace « Envoyer » et Entrée n'envoie plus. */
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  className?: string;
};

const SEND_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-border-strong disabled:bg-surface disabled:text-muted-foreground";

/** Saisie de l'agent (maquette 06) : cadre rayon 10 qui porte le focus, 2 lignes sans bordure, Envoyer 32 px. */
export function AgentComposer({
  value,
  onValueChange,
  onSend,
  onStop,
  streaming = false,
  disabled = false,
  placeholder = "Répondre, ou demander « challenge ma proposition de valeur »",
  label = "Message à l'agent",
  className,
}: AgentComposerProps) {
  const id = useId();
  const blank = value.trim() === "";
  const field = useRef<HTMLTextAreaElement>(null);
  const wasStreaming = useRef(streaming);
  /** Le bouton cliqué s'éteint ou disparaît : le focus passe à la saisie (WCAG 2.4.3). */
  const afterClick = (action?: () => void) => {
    action?.();
    field.current?.focus();
  };
  // « Arrêter » disparaît à la fin du flux : le focus ne doit pas tomber sur <body> (WCAG 2.4.3), il revient à la saisie.
  useEffect(() => {
    const ended = wasStreaming.current && !streaming;
    wasStreaming.current = streaming;
    const active = document.activeElement;
    if (ended && (active === null || active === document.body)) field.current?.focus();
  }, [streaming]);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!streaming && !disabled && !blank) onSend();
  };
  return (
    <div
      data-slot="agent-composer-frame"
      className={cn(
        "flex items-end gap-2 rounded-[10px] border bg-background py-2 pr-2 pl-3 focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        ref={field}
        id={id}
        rows={2}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 resize-none border-0 bg-transparent text-sm leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      {streaming ? (
        <Button variant="outline" size="sm" icon="stop" onClick={() => afterClick(onStop)}>
          Arrêter
        </Button>
      ) : (
        <button
          type="button"
          aria-label="Envoyer"
          disabled={disabled || blank}
          onClick={() => afterClick(onSend)}
          className={SEND_CLASS}
        >
          <Icon name="arrow_upward" size={18} />
        </button>
      )}
    </div>
  );
}
