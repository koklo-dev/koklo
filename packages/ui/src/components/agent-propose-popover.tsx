"use client";

import { type ReactNode, useId, useRef } from "react";
import { Icon } from "../icons/icon.tsx";
import { Button } from "./button.tsx";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./dialog.tsx";
import { IconTile } from "./icon-tile.tsx";
import { Pill } from "./pill.tsx";
import { RadioCard, RadioGroup } from "./radio-group.tsx";
import { Skeleton } from "./skeleton.tsx";
import { Textarea } from "./textarea.tsx";

/** Longueur maximale de la consigne : celle du serveur (`PROPOSAL_INSTRUCTION_MAX`). */
export const AGENT_PROPOSE_INSTRUCTION_MAX = 500;

export interface AgentProposeOption {
  id: string;
  title: string;
  description?: string;
  /** Compte calculé par le serveur : un compte nul masque le choix. */
  count?: number;
  /** Texte de la pastille de compte (« 3 critères ») ; à défaut, le compte seul. */
  countLabel?: string;
}

export interface AgentProposePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Livrable concerné (« Fonctionnel »), sous le titre. */
  subtitle: string;
  options: readonly AgentProposeOption[];
  value: string;
  onValueChange: (id: string) => void;
  instruction: string;
  onInstructionChange: (text: string) => void;
  instructionMax?: number;
  instructionPlaceholder?: string;
  /** Ce que l'agent reçoit en contexte (« L'agent lit »). */
  reads: readonly string[];
  onLaunch: () => void;
  /** Choix en cours de chargement : squelette, « Lancer » inactif. */
  loading?: boolean;
  launchDisabled?: boolean;
  /** Message d'erreur ou d'état sous les puces (le parent y met son notice). */
  notice?: ReactNode;
}

const CHOICE_LABEL = "Ce que l'agent va faire";

function OptionCards({ options }: { options: readonly AgentProposeOption[] }) {
  return options.map((option, index) => {
    const countText = option.countLabel ?? (option.count ? String(option.count) : undefined);
    return (
      <RadioCard
        key={option.id}
        value={option.id}
        density="compact"
        title={option.title}
        description={option.description}
        tags={
          <>
            {index === 0 ? (
              <Pill size="xs" tone="primary">
                Recommandé
              </Pill>
            ) : null}
            {countText ? (
              <Pill size="xs" tone="soft">
                {countText}
              </Pill>
            ) : null}
          </>
        }
      />
    );
  });
}

function Choices(
  props: Pick<AgentProposePopoverProps, "options" | "value" | "onValueChange" | "loading">,
) {
  if (props.loading) {
    return (
      <fieldset
        aria-label={CHOICE_LABEL}
        aria-busy="true"
        className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
      >
        {["a", "b", "c"].map((key) => (
          <Skeleton key={key} className="h-[62px] rounded-card" />
        ))}
      </fieldset>
    );
  }
  const visible = props.options.filter((option) => option.count !== 0);
  return (
    <RadioGroup
      aria-label={CHOICE_LABEL}
      value={props.value}
      onValueChange={props.onValueChange}
      className="gap-1.5"
    >
      <OptionCards options={visible} />
    </RadioGroup>
  );
}

function Instruction(
  props: Pick<
    AgentProposePopoverProps,
    "instruction" | "onInstructionChange" | "instructionMax" | "instructionPlaceholder"
  >,
) {
  const max = props.instructionMax ?? AGENT_PROPOSE_INSTRUCTION_MAX;
  const fieldId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-meta font-semibold">
        Consigne <span className="font-normal text-muted-foreground">(facultatif)</span>
      </label>
      <Textarea
        id={fieldId}
        rows={2}
        maxLength={max}
        value={props.instruction}
        placeholder={props.instructionPlaceholder}
        onChange={(event) => props.onInstructionChange(event.target.value)}
        className="min-h-[52px] resize-y rounded-lg px-2.5 py-2 text-meta font-normal"
      />
    </div>
  );
}

function Reads({ reads }: { reads: readonly string[] }) {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span id={labelId} className="text-caption font-normal text-muted-foreground">
        L'agent lit
      </span>
      <ul aria-labelledby={labelId} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {reads.map((read) => (
          <li
            key={read}
            className="inline-flex h-[22px] items-center rounded-md border px-2 text-caption font-normal"
          >
            {read}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Modale « Proposer avec l'agent » (DESIGN.md §5.13, maquette 21 l.57-68, maquette 10 l.388-419) : `Dialog` centré,
 * focus piégé puis rendu au bouton, choix en cartes radio, consigne, sources lues, pied « Rien n'est enregistré
 * sans votre relecture. ». Le premier choix visible est le recommandé.
 */
export function AgentProposePopover(props: AgentProposePopoverProps) {
  const { open, onOpenChange, subtitle, reads, onLaunch, loading = false, notice } = props;
  // Pas de `DialogTrigger` ici : le focus revient à l'élément qui avait le focus à l'ouverture (le bouton).
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-modal="true"
        className="max-h-[calc(100%-48px)]"
        closeClassName="top-[15px]"
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        {/* Rangée tuile 34 + titre + sous-titre (maquette 10 l.391-394) : pas `DialogHeader`, dont le corps est une colonne. */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <IconTile icon="wand_stars" size={34} tone="primary" />
          <div className="flex min-w-0 flex-1 flex-col pr-9 leading-snug">
            <DialogTitle className="text-card-title">Proposer avec l'agent</DialogTitle>
            <DialogDescription className="text-caption font-normal">{subtitle}</DialogDescription>
          </div>
        </div>
        <DialogBody className="gap-3 px-4 py-3.5">
          <span className="text-caption font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {CHOICE_LABEL}
          </span>
          <Choices {...props} />
          <Instruction {...props} />
          <Reads reads={reads} />
          {notice}
        </DialogBody>
        <DialogFooter className="items-center px-4 py-3">
          <p className="flex basis-full items-center gap-1.5 text-caption font-normal text-muted-foreground">
            <Icon name="rate_review" size={16} />
            Rien n'est enregistré sans votre relecture.
          </p>
          <DialogClose asChild>
            <Button variant="outline" className="h-11 px-3 text-meta md:h-[34px]">
              Annuler
            </Button>
          </DialogClose>
          <Button
            icon="wand_stars"
            className="h-11 gap-1.5 pl-2.5 text-meta md:h-[34px]"
            disabled={loading || props.launchDisabled}
            onClick={onLaunch}
          >
            Lancer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
