"use client";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  RadioPill,
  RadioPillGroup,
  SpecItemSheet,
  TagInput,
  Textarea,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiSection } from "./dev-ui-frame.tsx";

type Mode = "create" | "filled" | "edit" | "err";

const MODES = [
  { value: "create", label: "Création" },
  { value: "filled", label: "Préremplie par l'agent" },
  { value: "edit", label: "Modification" },
  { value: "err", label: "Erreurs" },
] as const;

const PRIORITIES = ["Indispensable", "Importante", "Souhaitable", "Reportée"];

/** Valeurs de la maquette 16 (l.133-138), type Fonctionnalité. */
const FILLED = {
  title: "Liste d'attente",
  priority: "Importante",
  description:
    "Quand aucun créneau n'est libre, le client laisse son téléphone et il est prévenu par SMS dès qu'un créneau se libère.",
  links: ["R-001", "S-reservation"],
};
const EDIT = {
  title: "Annuler ou déplacer",
  priority: "Importante",
  description:
    "Le client annule ou déplace sa réservation depuis le lien reçu par SMS, jusqu'à 2 h avant le rendez-vous.",
  links: ["R-002", "S-annulation"],
};
const EMPTY = { title: "", priority: "", description: "", links: [] as string[] };

const noop = () => undefined;

function valuesOf(mode: Mode) {
  if (mode === "filled") return FILLED;
  return mode === "edit" ? EDIT : EMPTY;
}

/** Corps de démonstration du formulaire Fonctionnalité (sans logique d'envoi). */
function DemoFields({ mode }: { mode: Mode }) {
  const initial = valuesOf(mode);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [priority, setPriority] = useState(initial.priority);
  const [links, setLinks] = useState(initial.links);
  const agent = mode === "filled";
  const err = mode === "err";
  return (
    <>
      <Field agentFilled={agent}>
        <FieldLabel htmlFor="demo-title" required>
          Titre
        </FieldLabel>
        <Input
          id="demo-title"
          value={title}
          aria-invalid={err && !title ? true : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        {err && !title ? <FieldError>Obligatoire</FieldError> : null}
      </Field>
      <Field agentFilled={agent}>
        <FieldLabel id="demo-priority-label" required>
          Priorité
        </FieldLabel>
        <RadioPillGroup
          aria-labelledby="demo-priority-label"
          value={priority}
          onValueChange={setPriority}
        >
          {PRIORITIES.map((label) => (
            <RadioPill key={label} value={label} aria-invalid={err && !priority ? true : undefined}>
              {label}
            </RadioPill>
          ))}
        </RadioPillGroup>
        {err && !priority ? <FieldError>Obligatoire</FieldError> : null}
      </Field>
      <Field agentFilled={agent}>
        <FieldLabel htmlFor="demo-description" required>
          Description
        </FieldLabel>
        <Textarea
          id="demo-description"
          rows={3}
          value={description}
          aria-invalid={err && !description ? true : undefined}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FieldDescription>
          Ce que l'utilisateur peut faire, en une ou deux phrases.
        </FieldDescription>
        {err && !description ? <FieldError>Obligatoire</FieldError> : null}
      </Field>
      <Field agentFilled={agent}>
        <FieldLabel htmlFor="demo-links">Liens</FieldLabel>
        <TagInput
          id="demo-links"
          label="Liens"
          value={links}
          onChange={setLinks}
          suggestions={[
            { id: "R-087", title: "Acompte des longues prestations" },
            { id: "S-liste-attente", title: "Liste d'attente" },
          ]}
        />
        <FieldDescription>Règles, rôles, écrans, parcours.</FieldDescription>
      </Field>
    </>
  );
}

function Demo({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const edit = mode === "edit";
  const [phrase, setPhrase] = useState("");
  return (
    <SpecItemSheet
      open
      mode={edit ? "edit" : "create"}
      icon="task_alt"
      title={edit ? "Modifier la fonctionnalité" : "Nouvelle fonctionnalité"}
      subtitle={`Fonctionnel · ${edit ? "F-002" : "identifiant attribué à l'enregistrement"}`}
      {...(edit ? { idTag: "F-002" } : {})}
      closeLabel="Fermer le panneau d'exemple"
      dirty={mode === "filled"}
      file={edit ? "features/F-002-annuler-deplacer.md" : "features/F-249-liste-attente.md"}
      commitNote={edit ? "un commit, relu dans l'historique" : "un commit à l'enregistrement"}
      saveLabel={edit ? "Enregistrer les modifications" : "Enregistrer dans la spec"}
      {...(mode === "create" || mode === "err"
        ? {
            assist: {
              hint: "ex. « le client s'inscrit sur liste d'attente quand tout est complet »",
              value: phrase,
              onChange: setPhrase,
              onPrefill: noop,
            },
          }
        : {})}
      {...(mode === "filled" ? { filled: { onClear: noop } } : {})}
      {...(edit
        ? {
            warning:
              "Ce livrable est validé : enregistrer cette modification annule sa validation, qui devra être reposée sur la nouvelle version.",
            onDelete: noop,
          }
        : {})}
      {...(mode === "err"
        ? { errorSummary: "3 champs obligatoires sont vides : Titre, Priorité, Description." }
        : {})}
      onSave={onClose}
      onClose={onClose}
    >
      <DemoFields key={mode} mode={mode} />
    </SpecItemSheet>
  );
}

/** Section « 16. Panneau d'édition » de la galerie (TK-101, DESIGN.md §5.14) : les 4 modes de la maquette 16. */
export function DevUiSpecItemSheet() {
  const [mode, setMode] = useState<Mode>("create");
  const [open, setOpen] = useState(false);
  return (
    <DevUiSection id="dev-ui-spec-item-sheet" title="17. Panneau d'édition">
      <DevUiFrame title="SpecItemSheet : Création, Préremplie, Modification, Erreurs" wide>
        <RadioPillGroup
          aria-label="Mode du panneau d'exemple"
          value={mode}
          onValueChange={(next) => setMode(next as Mode)}
        >
          {MODES.map((option) => (
            <RadioPill key={option.value} value={option.value}>
              {option.label}
            </RadioPill>
          ))}
        </RadioPillGroup>
        <div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Ouvrir le panneau d'exemple
          </Button>
        </div>
        {open ? <Demo mode={mode} onClose={() => setOpen(false)} /> : null}
      </DevUiFrame>
    </DevUiSection>
  );
}
