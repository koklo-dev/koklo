import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  type IconName,
} from "@koklo/ui";
import { useState } from "react";
import { stepLabel } from "../lib/feature-labels.ts";
import type { ProposalStatus, ProposedFeature } from "../lib/framing-types.ts";

const STATUS: Record<ProposalStatus, { label: string; icon: IconName; fill: boolean }> = {
  to_review: { label: "À relire", icon: "schedule", fill: false },
  accepted: { label: "Acceptée", icon: "check_circle", fill: true },
  rejected: { label: "Rejetée", icon: "cancel", fill: false },
};

/** Description repliée à 3 lignes au-delà de 3 retours à la ligne ou d'une longueur qui dépasse 3 lignes. */
const isLong = (text: string): boolean => text.split("\n").length > 3 || text.length > 240;

export function StatusBadge({ status }: { status: ProposalStatus }) {
  const { label, icon, fill } = STATUS[status];
  return (
    <Badge variant="outline" data-slot="badge" className="gap-1">
      <Icon name={icon} size={16} fill={fill} />
      <span>{label}</span>
    </Badge>
  );
}

export function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = isLong(text);
  if (!text) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={`whitespace-pre-wrap break-words text-sm ${long && !open ? "line-clamp-3" : ""}`}
      >
        {text}
      </p>
      {long ? (
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-2 md:h-9"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Réduire" : "Afficher la suite"}
        </Button>
      ) : null}
    </div>
  );
}

export function Criteria({ criteria }: { criteria: ProposedFeature["criteria"] }) {
  const count = criteria.length;
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="h-11 px-2 md:h-9">
          <Icon name="keyboard_arrow_down" size={20} />
          {`${count} ${count > 1 ? "critères" : "critère"} d'acceptation`}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="flex flex-col gap-3 pt-2 text-sm">
          {criteria.map((criterion, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: critères ordonnés, sans identifiant propre
            <li key={index} className="flex flex-col gap-1">
              <span className="break-words font-medium">{criterion.title}</span>
              <ul className="flex list-none flex-col gap-0.5">
                {criterion.steps.map((step, position) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: étapes ordonnées, sans identifiant propre
                  <li key={position} className="whitespace-pre-wrap break-words">
                    <strong className="font-semibold">{stepLabel(step.type)}</strong> {step.text}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Duplicate({ projectId, specId }: { projectId: string; specId: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
      <Icon name="warning" size={16} />
      <span>{`Titre déjà présent : ${specId}`}</span>
      <a
        href={`/projects/${projectId}/features?feature=${specId}`}
        className="underline underline-offset-4"
      >
        {`Voir ${specId}`}
      </a>
    </p>
  );
}

/** Pastille « Proposé par l'IA » : icône + texte. */
export function AiBadge() {
  return (
    <Badge variant="outline" data-slot="badge" className="gap-1">
      <Icon name="smart_toy" size={16} />
      <span>Proposé par l'IA</span>
    </Badge>
  );
}
