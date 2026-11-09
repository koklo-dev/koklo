"use client";

import {
  AvatarGroup,
  MaturityMeter,
  PageNavItem,
  PageStatus,
  type PageStatusValue,
  Prose,
  ProseInvite,
  ProsePath,
  ReorderableList,
  StatusLegend,
  SynthesisNavItem,
  TaskCheckbox,
  TaskItem,
  taskItemClassName,
} from "@koklo/ui";
import { useState } from "react";
import { DevUiFrame, DevUiRow, DevUiSection } from "./dev-ui-frame.tsx";

interface Demo {
  id: string;
  title: string;
  status: PageStatusValue;
  required: boolean;
}

const START: Demo[] = [
  { id: "vision", title: "00 · Vision", status: "stable", required: true },
  { id: "probleme", title: "01 · Problème", status: "review", required: true },
  { id: "perimetre", title: "02 · Périmètre", status: "draft", required: true },
  { id: "mesure", title: "03 · Mesure", status: "empty", required: false },
];

const PEOPLE = [
  { name: "Awa Koné (équipe)", initials: "AK" },
  { name: "Marie Lefèvre (client)", initials: "ML", isClient: true },
  { name: "Moussa Diallo (équipe)", initials: "MD" },
];

const STATUSES: PageStatusValue[] = ["stable", "review", "draft", "empty"];

/** Section « Espace Idée » de la galerie (TK-89, DESIGN.md §5.8) : liste réordonnable, états, légende, document, avatars. */
export function DevUiIdea() {
  const [items, setItems] = useState(START);
  const order = (ids: string[]) =>
    setItems((current) => ids.flatMap((id) => current.filter((item) => item.id === id)));
  return (
    <DevUiSection id="dev-ui-idea" title="12. Espace Idée">
      <DevUiFrame title="Liste réordonnable (Alt + flèches sur la poignée)">
        <nav aria-label="Pages de la démonstration" className="w-[264px] max-w-full">
          <ReorderableList
            items={items}
            onReorder={order}
            handleLabel={(item) => `Déplacer ${item.title}`}
            announce={(item, position, total) =>
              `${item.title.split(" · ")[1]} déplacée en position ${position} sur ${total}`
            }
            renderItem={(item, index) => (
              <PageNavItem
                href="/dev/ui#dev-ui-idea"
                title={item.title}
                status={item.status}
                required={item.required}
                current={index === 2}
              />
            )}
          />
          <StatusLegend />
        </nav>
      </DevUiFrame>
      <DevUiFrame title="États d'une page">
        <DevUiRow>
          {STATUSES.map((status) => (
            <PageStatus key={status} status={status} showLabel />
          ))}
        </DevUiRow>
        <DevUiRow>
          {STATUSES.map((status) => (
            <PageStatus key={status} status={status} pill />
          ))}
        </DevUiRow>
      </DevUiFrame>
      <DevUiFrame title="Jauge de maturité (crans qui passent à la ligne)">
        <DevUiRow>
          <MaturityMeter stable={3} total={10} />
        </DevUiRow>
        <DevUiRow>
          <MaturityMeter stable={1} total={10} />
          <MaturityMeter stable={10} total={10} />
        </DevUiRow>
        <div className="w-40 max-w-full">
          <MaturityMeter stable={4} total={16} />
        </div>
      </DevUiFrame>
      <DevUiFrame title="Ligne Synthèse (hors liste réordonnable)">
        <nav
          aria-label="Synthèse de la démonstration"
          className="flex w-[240px] max-w-full flex-col"
        >
          <SynthesisNavItem href="/dev/ui#dev-ui-idea" />
          <SynthesisNavItem href="/dev/ui#dev-ui-idea" current />
          <SynthesisNavItem href="/dev/ui#dev-ui-idea" tag={null} />
        </nav>
      </DevUiFrame>
      <DevUiFrame title="Pile d'avatars">
        <AvatarGroup label="Présents dans le dossier" people={PEOPLE} />
      </DevUiFrame>
      <DevUiFrame title="Document" wide>
        <Prose className="max-w-[680px]">
          <ProsePath>idea/perimetre.md</ProsePath>
          <h2 className="text-settings-title">Périmètre</h2>
          <p>Ce qui entre dans la première version du portail, et ce qui attend.</p>
          <h3 className="text-subsection-title">Première version</h3>
          <ul className="list-none pl-0">
            <TaskItem checked>Réserver un créneau en moins de deux minutes</TaskItem>
            <TaskItem checked={false}>Agenda du personnel synchronisé</TaskItem>
          </ul>
          <EditableTask />
          <ProseInvite />
        </Prose>
      </DevUiFrame>
    </DevUiSection>
  );
}

/** Tâche modifiable, comme dans l'éditeur : la case bascule et garde le nom de la tâche. */
function EditableTask() {
  const [checked, setChecked] = useState(false);
  const label = "Rappel par SMS la veille";
  return (
    <div className={taskItemClassName}>
      <TaskCheckbox checked={checked} label={label} onCheckedChange={setChecked} />
      <span>{label}</span>
    </div>
  );
}
