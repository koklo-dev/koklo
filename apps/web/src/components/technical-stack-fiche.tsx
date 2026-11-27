"use client";

import type { StackSummary } from "@koklo/contract";
import {
  Button,
  ComparisonTable,
  EntityChip,
  type EntityKind,
  Icon,
  IdTag,
  InlineAlert,
  Pill,
  SegmentedControl,
  STACK_STATUS_PILL,
  StackFicheTitle,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "../lib/orpc.ts";
import { OPEN_CHOICE, openChoiceText } from "../lib/technical-labels.ts";
import { TechnicalYaml } from "./technical-source.tsx";

/** Ce que la fiche lit d'un choix : le vocabulaire commun à l'équipe et au client. */
export type StackFicheChoice = Omit<StackSummary, "filePath">;

type View = "fiche" | "yaml";
const VIEWS = [
  { value: "fiche", label: "Fiche" },
  { value: "yaml", label: "YAML" },
] as const;

const LABEL = "text-caption font-semibold uppercase tracking-[0.05em] text-muted-foreground";

export interface StackFicheProps {
  projectId: string;
  choice: StackFicheChoice;
  /** Vue client : « En clair », sans YAML ni écriture. */
  client?: boolean;
  /** « Modifier » (équipe qui écrit). */
  onEdit?: (() => void) | undefined;
  /** « Commenter » (client seulement). */
  onComment?: (() => void) | undefined;
  /** « Choisir <option> » d'un choix ouvert (équipe qui écrit). */
  onChoose?: ((option: string) => void) | undefined;
  choosing?: boolean;
}

/** Colonne mise en avant : l'option retenue (ou celle que son nom contient), sinon la recommandée. */
function highlightOf({ status, choice, recommended, options }: StackFicheChoice) {
  const wanted = status === "open" ? recommended : choice;
  if (!wanted) return undefined;
  const option =
    options.find((item) => item === wanted) ?? options.find((item) => wanted.includes(item));
  if (!option) return undefined;
  return { option, tag: status === "open" ? ("Recommandé" as const) : ("Choisi" as const) };
}

function ChooseButtons({
  choice,
  onChoose,
  busy,
}: {
  choice: StackFicheChoice;
  onChoose: (option: string) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {choice.options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={option === choice.recommended ? "default" : "outline"}
          className="h-auto min-h-8 max-w-full whitespace-normal py-1 max-md:min-h-11"
          disabled={busy}
          onClick={() => onChoose(option)}
        >
          {`Choisir ${option}`}
        </Button>
      ))}
    </div>
  );
}

function Groups({ choice }: { choice: StackFicheChoice }) {
  const groups: ReadonlyArray<[string, EntityKind, readonly string[]]> = [
    ["Pour les composants", "component", choice.components],
    ["Exigences visées", "nfr", choice.requirements],
    ["Décisions", "decision", choice.decisions],
  ];
  return (
    <>
      {groups
        .filter(([, , ids]) => ids.length > 0)
        .map(([label, kind, ids]) => (
          <div key={label} className="flex flex-col gap-1.5">
            <span className={LABEL}>{label}</span>
            <div className="flex flex-wrap gap-1.5">
              {ids.map((id) => (
                <EntityChip key={id} kind={kind} id={id} />
              ))}
            </div>
          </div>
        ))}
    </>
  );
}

function Details({ choice, client, onChoose, choosing = false }: StackFicheProps) {
  const open = choice.status === "open";
  return (
    <>
      <p className="m-0 break-words text-body leading-[1.55]">
        {client ? (choice.plain ?? choice.why) : choice.why}
      </p>
      {open ? (
        <InlineAlert variant="warning" icon="help" role="note">
          {openChoiceText(choice.options.length)}
        </InlineAlert>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>Options comparées</span>
        <ComparisonTable
          options={choice.options}
          criteria={choice.criteria}
          highlight={highlightOf(choice)}
        />
        {open && onChoose ? (
          <ChooseButtons choice={choice} onChoose={onChoose} busy={choosing} />
        ) : null}
      </div>
      <Groups choice={choice} />
    </>
  );
}

/** Vue YAML d'un choix. */
function StackYaml({ projectId, id }: { projectId: string; id: string }) {
  const source = useQuery(
    orpc.spec.technical.stack.source.queryOptions({ input: { projectId, id } }),
  );
  return (
    <TechnicalYaml
      query={source}
      label="YAML du choix"
      fallback="Le fichier du choix n'a pas pu être lu."
    />
  );
}

function FicheHeader({ choice, onEdit, onComment }: StackFicheProps) {
  const pill = STACK_STATUS_PILL[choice.status];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IdTag truncate>{choice.specId}</IdTag>
      <Pill tone={pill.tone}>{pill.label}</Pill>
      <span className="flex-1" />
      {onEdit ? (
        <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={onEdit}>
          Modifier
        </Button>
      ) : null}
      {onComment ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11"
          onClick={onComment}
        >
          <Icon name="add_comment" size={16} />
          Commenter
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Fiche d'un choix technique (maquette 14 l.188-220) : identifiant, statut, rôle, choix, Fiche · YAML puis la vue ; le
 * client lit « En clair », sans YAML.
 */
export function StackFiche(props: StackFicheProps) {
  const { choice, client = false, projectId } = props;
  const [view, setView] = useState<View>("fiche");
  const shown = client ? "fiche" : view;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FicheHeader {...props} />
      <span className="text-caption font-normal text-muted-foreground">{choice.role}</span>
      <div className="-mt-1.5">
        <StackFicheTitle>{choice.choice ?? OPEN_CHOICE}</StackFicheTitle>
      </div>
      {client ? null : (
        <SegmentedControl<View>
          aria-label="Affichage du choix"
          options={VIEWS}
          value={view}
          onValueChange={setView}
          className="self-start"
        />
      )}
      {shown === "yaml" ? (
        <StackYaml projectId={projectId} id={choice.specId} />
      ) : (
        <Details {...props} />
      )}
    </div>
  );
}
