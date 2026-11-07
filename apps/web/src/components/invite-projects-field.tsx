"use client";

import { Field, FieldError, Input, Label } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { type Ref, useId, useState } from "react";
import { MEMBERS_COPY } from "../lib/members-labels.ts";
import { orpc } from "../lib/orpc.ts";

interface InviteProjectsFieldProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  error: string | undefined;
  /** Reçoit le focus quand aucun projet n'est choisi. */
  focusRef: Ref<HTMLInputElement>;
}

/** Projets d'un client ou d'un business : cases à cocher filtrables, au moins un (B98). */
export function InviteProjectsField({
  selected,
  onChange,
  disabled,
  error,
  focusRef,
}: InviteProjectsFieldProps) {
  const projects = useQuery(orpc.project.list.queryOptions());
  const [filter, setFilter] = useState("");
  const id = useId();
  const errorId = `${id}-error`;
  const all = projects.data ?? [];
  const shown = all.filter((project) => project.name.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (projectId: string) =>
    onChange(
      selected.includes(projectId)
        ? selected.filter((candidate) => candidate !== projectId)
        : [...selected, projectId],
    );

  if (projects.data && all.length === 0) {
    return <p className="text-meta text-muted-foreground">{MEMBERS_COPY.noProject}</p>;
  }
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      className="flex min-w-0 flex-col gap-2"
    >
      <legend className="text-sm font-medium">Projets</legend>
      <Field>
        <Label htmlFor={`${id}-filter`}>Filtrer les projets</Label>
        <Input
          id={`${id}-filter`}
          ref={focusRef}
          className="h-11 md:h-9"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </Field>
      <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border">
        {shown.map((project) => (
          <li key={project.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 md:min-h-9">
              <input
                type="checkbox"
                className="size-5 accent-primary md:size-4"
                checked={selected.includes(project.id)}
                disabled={disabled}
                onChange={() => toggle(project.id)}
              />
              <span>{project.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}
