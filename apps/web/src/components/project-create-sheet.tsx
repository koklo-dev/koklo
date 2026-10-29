"use client";

import { projectCreateInputSchema } from "@koklo/contract";
import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@koklo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { errorCode } from "../lib/api-error.ts";
import { fieldErrors, NAME_TOO_LONG, RETRY_LATER } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";

const NAME_MESSAGES = {
  name: {
    too_small: "Saisissez le nom du projet.",
    too_big: NAME_TOO_LONG,
    default: NAME_TOO_LONG,
  },
};

interface FormProps {
  onCreated: (name: string) => void;
}

function CreateFailure({ error }: { error: unknown }) {
  if (errorCode(error) === "FORBIDDEN") {
    return (
      <ErrorNotice icon="lock">
        Vous n'avez pas le droit de créer un projet. Demandez à un propriétaire ou à un
        administrateur.
      </ErrorNotice>
    );
  }
  return <ErrorNotice title="Le projet n'a pas pu être créé">{RETRY_LATER}</ErrorNotice>;
}

function ProjectCreateForm({ onCreated }: FormProps) {
  const queryClient = useQueryClient();
  const create = useMutation(orpc.project.create.mutationOptions());
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();

  function submit(event: FormEvent): void {
    event.preventDefault();
    const parsed = projectCreateInputSchema.safeParse({ name: name.trim() });
    const error = parsed.success ? undefined : fieldErrors(parsed.error.issues, NAME_MESSAGES).name;
    setNameError(error);
    if (!parsed.success) {
      input.current?.focus();
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: async (project) => {
        await queryClient.invalidateQueries({ queryKey: orpc.project.list.key() });
        onCreated(project.name);
      },
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4">
      {create.isError ? <CreateFailure error={create.error} /> : null}
      <FormField
        ref={input}
        label="Nom du projet"
        value={name}
        onChange={(event) => setName(event.target.value)}
        readOnly={create.isPending}
        error={nameError}
        autoComplete="off"
      />
      <SheetFooter>
        <Button
          type="submit"
          className="h-11 md:h-9"
          disabled={create.isPending}
          aria-busy={create.isPending}
        >
          {create.isPending ? "Création…" : "Créer le projet"}
        </Button>
        <SheetClose asChild>
          <Button variant="outline" className="h-11 md:h-9">
            Annuler
          </Button>
        </SheetClose>
      </SheetFooter>
    </form>
  );
}

interface SheetProps extends FormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rend le focus au bouton déclencheur, même si la liste l'a remplacé entre-temps. */
  onReturnFocus: () => void;
}

/** Panneau « Créer un projet » (`Sheet`, 400 px) ; le formulaire est démonté à la fermeture. */
export function ProjectCreateSheet({ open, onOpenChange, onCreated, onReturnFocus }: SheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="create-project-sheet"
        aria-describedby={undefined}
        className="sm:max-w-[400px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnFocus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Créer un projet</SheetTitle>
        </SheetHeader>
        <ProjectCreateForm onCreated={onCreated} />
      </SheetContent>
    </Sheet>
  );
}
