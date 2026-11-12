import type { FeatureDetail as Detail } from "@koklo/contract";
import { EntityChip, type EntityKind, ProposalDetailLines, ProposalDetailSection } from "@koklo/ui";
import { useId } from "react";
import { stepLabel } from "../lib/feature-labels.ts";

type Criterion = Detail["criteria"][number];

/** « AC-1 · Étant donné …, quand …, alors … » d'un trait (maquette 10 l.205 et 576) : le titre du critère n'a pas de ligne. */
function CriterionLine({ criterion }: { criterion: Criterion }) {
  const scenario = criterion.steps
    .map((step, index) => {
      const label = stepLabel(step.type);
      return `${index === 0 ? label : label.toLowerCase()} ${step.text}`;
    })
    .join(", ");
  return (
    <>
      {criterion.specId} · {scenario ? `${scenario}.` : criterion.title}
    </>
  );
}

function Criteria({ criteria }: { criteria: Criterion[] }) {
  if (criteria.length === 0) {
    return (
      <p className="text-meta text-muted-foreground">Aucun critère d'acceptation pour le moment.</p>
    );
  }
  return (
    <ProposalDetailLines
      plain
      ordered
      lines={criteria.map((criterion) => ({
        icon: "checklist" as const,
        key: criterion.specId,
        text: <CriterionLine criterion={criterion} />,
      }))}
    />
  );
}

interface Link {
  kind: EntityKind;
  value: string;
  /** Réservé à l'équipe : technique, jamais montré au client ni au business. */
  technical?: boolean;
}

function linksOf(detail: Detail): Link[] {
  return [
    ...detail.screens.map((value) => ({ kind: "screen" as const, value })),
    ...detail.roles.map((value) => ({ kind: "role" as const, value })),
    ...detail.rules.map((value) => ({ kind: "rule" as const, value })),
    ...detail.tables.map((value) => ({ kind: "table" as const, value, technical: true })),
    ...detail.endpoints.map((value) => ({ kind: "endpoint" as const, value, technical: true })),
    ...detail.nfr.map((value) => ({ kind: "nfr" as const, value, technical: true })),
  ];
}

/** « Liens » (maquette 10 l.206) : titre 12/600 en majuscules, une pastille par entité, sans groupes. */
function Links({ detail, team }: { detail: Detail; team: boolean }) {
  const links = linksOf(detail).filter((link) => team || !link.technical);
  const titleId = useId();
  if (links.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1.5">
      <span
        id={titleId}
        className="text-caption font-semibold uppercase tracking-[0.05em] text-muted-foreground"
      >
        Liens
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <li key={`${link.kind}:${link.value}`}>
            <EntityChip kind={link.kind} id={link.value} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pied de fiche (maquette 10 l.220) : l'équipe seulement, jamais de vocabulaire git pour le client. */
function Provenance({ detail }: { detail: Detail }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
      <p>
        Enregistrée dans la spec · <span className="font-mono">{detail.filePath}</span>
      </p>
    </div>
  );
}

/** Contenu de la fiche : description en texte brut, critères, liens et, pour l'équipe, la provenance. */
export function FeatureDetail({ detail, team }: { detail: Detail; team: boolean }) {
  return (
    <div className="flex flex-col gap-3.5">
      {detail.description ? (
        <p className="whitespace-pre-wrap text-body leading-relaxed">{detail.description}</p>
      ) : (
        <p className="text-meta text-muted-foreground">Aucune description.</p>
      )}
      <ProposalDetailSection title="Critères d'acceptation">
        <Criteria criteria={detail.criteria} />
      </ProposalDetailSection>
      <Links detail={detail} team={team} />
      {team ? <Provenance detail={detail} /> : null}
    </div>
  );
}
