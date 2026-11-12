"use client";

import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { FieldError } from "./field.tsx";

export type TagSuggestion = { id: string; title?: string };

export type TagInputProps = {
  /** Nom du champ : « Liens » nomme la liste, « Liens : ajouter » la saisie. */
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  /** Propositions de l'autocomplétion (20 au plus, déjà filtrées par l'appelant). */
  suggestions?: TagSuggestion[];
  /** Appelé à chaque frappe ; l'anti-rebond est à la charge de l'appelant. */
  onQueryChange?: (query: string) => void;
  /** Refuse une valeur saisie : renvoie le message, ou `null` si elle est acceptée. */
  validate?: (value: string) => string | null;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

const CHIP =
  "inline-flex h-6 items-center gap-1 rounded-md bg-secondary pl-2 font-mono text-code text-secondary-foreground";

function Chip({
  tag,
  disabled,
  onRemove,
}: {
  tag: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <span className={CHIP}>
      {tag}
      <button
        type="button"
        aria-label={`Retirer ${tag}`}
        disabled={disabled}
        onClick={onRemove}
        className="inline-flex size-6 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="close" size={16} />
      </button>
    </span>
  );
}

/** État de la saisie : texte, option active, liste ouverte, message de refus. */
function useTagEntry({
  value,
  onChange,
  suggestions = [],
  onQueryChange,
  validate,
}: TagInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [refusal, setRefusal] = useState<string | null>(null);
  const options = suggestions.filter((suggestion) => !value.includes(suggestion.id));
  const shown = open && options.length > 0;

  const reset = () => {
    setQuery("");
    setActive(-1);
    setOpen(false);
    onQueryChange?.("");
  };
  const add = (raw: string): void => {
    const next = raw.trim();
    if (!next) return;
    const message = validate?.(next) ?? null;
    setRefusal(message);
    if (message) return;
    if (!value.includes(next)) onChange([...value, next]);
    reset();
  };
  const type = (text: string): void => {
    setQuery(text);
    setRefusal(null);
    setActive(-1);
    setOpen(true);
    onQueryChange?.(text);
  };
  const move = (delta: number): void => {
    setOpen(true);
    setActive((index) =>
      options.length === 0 ? -1 : (index + delta + options.length) % options.length,
    );
  };
  return { query, shown, active, refusal, options, open, setOpen, add, type, move };
}

type Entry = ReturnType<typeof useTagEntry>;

/** Touche pressée dans le champ : ajouter, parcourir, fermer la liste seule, retirer la dernière puce. */
function handleKey(
  event: KeyboardEvent<HTMLInputElement>,
  entry: Entry,
  props: TagInputProps,
): void {
  const { key } = event;
  const { value, onChange } = props;
  if (key === "Enter" || key === ",") {
    event.preventDefault();
    entry.add(entry.active >= 0 ? (entry.options[entry.active]?.id ?? "") : entry.query);
  } else if (key === "ArrowDown" || key === "ArrowUp") {
    event.preventDefault();
    entry.move(key === "ArrowDown" ? 1 : -1);
  } else if (key === "Escape" && entry.shown) {
    event.preventDefault();
    event.stopPropagation();
    entry.setOpen(false);
  } else if (key === "Backspace" && entry.query === "" && value.length > 0) {
    onChange(value.slice(0, -1));
  }
}

const optionId = (listId: string, index: number) => `${listId}-option-${index}`;

/** Liste de propositions : le focus reste dans le champ (`aria-activedescendant`), la souris ne le lui prend pas. */
function Suggestions({ listId, label, entry }: { listId: string; label: string; entry: Entry }) {
  return (
    <div
      id={listId}
      role="listbox"
      aria-label={`${label} : propositions`}
      className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-raised p-1 shadow-floating"
    >
      {entry.options.map((option, index) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: le clavier passe par le champ (flèches, Entrée)
        <div
          key={option.id}
          id={optionId(listId, index)}
          role="option"
          tabIndex={-1}
          aria-selected={index === entry.active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => entry.add(option.id)}
          className="flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 text-meta aria-selected:bg-accent max-md:min-h-11"
        >
          <span className="font-mono text-code">{option.id}</span>
          {option.title ? (
            <span className="truncate text-muted-foreground">{option.title}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ResultsStatus({ entry }: { entry: Entry }) {
  const count = entry.options.length;
  return (
    <span aria-live="polite" className="sr-only">
      {entry.shown ? `${count} résultat${count > 1 ? "s" : ""}` : ""}
    </span>
  );
}

/**
 * Saisie de références en puces (maquette 16 l.89) : puces mono 24 px avec ✕ « Retirer X », champ « Ajouter… » en
 * combobox. Entrée ou virgule ajoute ; ↑ ↓ parcourent les propositions ; Échap ferme la liste seule ; Retour arrière
 * dans le champ vide retire la dernière puce.
 */
export function TagInput(props: TagInputProps) {
  const { label, value, onChange, placeholder = "Ajouter…", invalid, disabled = false } = props;
  const entry = useTagEntry(props);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const flagged = invalid || entry.refusal !== null;
  return (
    <div data-slot="tag-input" className={cn("relative flex flex-col gap-1.5", props.className)}>
      {/* biome-ignore lint/a11y/useSemanticElements: groupe nommé de puces, pas un fieldset */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: le champ est atteignable au clavier */}
      <div
        role="group"
        aria-label={label}
        onClick={() => input.current?.focus()}
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 max-md:min-h-11",
          flagged && "border-destructive",
          disabled && "border-dashed border-border-strong bg-surface",
        )}
      >
        {value.map((tag) => (
          <Chip
            key={tag}
            tag={tag}
            disabled={disabled}
            onRemove={() => onChange(value.filter((other) => other !== tag))}
          />
        ))}
        <input
          ref={input}
          id={props.id}
          role="combobox"
          aria-label={`${label} : ajouter`}
          aria-expanded={entry.shown}
          aria-controls={entry.shown ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            entry.shown && entry.active >= 0 ? optionId(listId, entry.active) : undefined
          }
          aria-describedby={props["aria-describedby"]}
          aria-invalid={flagged || undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={entry.query}
          onChange={(event) => entry.type(event.target.value)}
          onKeyDown={(event) => handleKey(event, entry, props)}
          onBlur={() => entry.setOpen(false)}
          className="h-7 min-w-[120px] flex-1 bg-transparent text-meta text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>
      {entry.shown ? <Suggestions listId={listId} label={label} entry={entry} /> : null}
      <ResultsStatus entry={entry} />
      {entry.refusal ? <FieldError>{entry.refusal}</FieldError> : null}
    </div>
  );
}
