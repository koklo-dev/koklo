import { IdTag, ProposalDetailLines, ProposalDetailSection, WorkflowStates } from "@koklo/ui";
import type { ProposalOutput } from "../lib/proposal-types.ts";

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] =>
  list(value).filter((item): item is string => typeof item === "string");
const records = (value: unknown): Array<Record<string, unknown>> =>
  list(value).filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
  );

const RULE_TYPES: Record<string, string> = {
  contrainte: "contrainte",
  calcul: "calcul",
  workflow: "workflow à états",
};

/** Ligne de contexte sous le titre : « Type : contrainte » pour une règle, vide pour les autres. */
export function reviewMetaOf(proposal: ProposalOutput): string | undefined {
  return proposal.kind === "rule"
    ? `Type : ${RULE_TYPES[text(proposal.content.type)] ?? "contrainte"}`
    : undefined;
}

function Features({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <IdTag key={id}>{id}</IdTag>
      ))}
    </div>
  );
}

function RuleContent({ content }: { content: Record<string, unknown> }) {
  const example = text(content.example);
  const states = strings(content.states);
  return (
    <>
      <p className="whitespace-pre-line text-body">{text(content.statement)}</p>
      {text(content.type) === "workflow" && states.length > 0 ? (
        <WorkflowStates states={states} />
      ) : null}
      {example ? (
        <ProposalDetailSection title="Exemple">
          <ProposalDetailLines lines={[{ icon: "lightbulb", text: `Exemple : ${example}` }]} />
        </ProposalDetailSection>
      ) : null}
      <Features ids={strings(content.features)} />
    </>
  );
}

function RoleContent({ content }: { content: Record<string, unknown> }) {
  const permissions = records(content.permissions).map((permission) => {
    const restriction = text(permission.restriction);
    return {
      icon: "check" as const,
      key: text(permission.id),
      text: restriction ? `${text(permission.id)} (${restriction})` : text(permission.id),
    };
  });
  return (
    <>
      <p className="whitespace-pre-line text-body">{text(content.description)}</p>
      {permissions.length > 0 ? (
        <ProposalDetailSection title="Permissions">
          <ProposalDetailLines lines={permissions} />
        </ProposalDetailSection>
      ) : null}
    </>
  );
}

function FlowContent({ content }: { content: Record<string, unknown> }) {
  const start = text(content.start);
  const steps = strings(content.steps);
  const lines = [
    ...(start ? [{ icon: "flag" as const, text: start }] : []),
    ...steps.map((step) => ({ icon: "arrow_forward" as const, text: step })),
  ];
  const errors = records(content.errors).map((error) => ({
    icon: "subdirectory_arrow_right" as const,
    text: `Étape ${String(error.step)} : ${text(error.text)}`,
  }));
  const actor = text(content.actor);
  return (
    <>
      {actor ? <p className="text-body">Acteur : {actor}.</p> : null}
      <ProposalDetailSection title="Étapes">
        <ProposalDetailLines lines={lines} ordered />
      </ProposalDetailSection>
      {errors.length > 0 ? (
        <ProposalDetailSection title="Cas d'erreur">
          <ProposalDetailLines lines={errors} />
        </ProposalDetailSection>
      ) : null}
      <Features ids={strings(content.features)} />
    </>
  );
}

/** Contenu en lecture d'une proposition de règle, de rôle ou de parcours : nœuds texte seulement (sortie du modèle). */
export function DomainProposalContent({ proposal }: { proposal: ProposalOutput }) {
  if (proposal.kind === "rule") return <RuleContent content={proposal.content} />;
  if (proposal.kind === "role") return <RoleContent content={proposal.content} />;
  return <FlowContent content={proposal.content} />;
}

export const isDomainProposal = (proposal: ProposalOutput): boolean =>
  proposal.kind === "rule" || proposal.kind === "role" || proposal.kind === "flow";
