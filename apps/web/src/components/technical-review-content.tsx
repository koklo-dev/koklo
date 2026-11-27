import { EntityChip, type EntityKind, ProposalDetailSection, ProposalDetailText } from "@koklo/ui";
import type { ProposalOutput } from "../lib/proposal-types.ts";
import { verificationText } from "../lib/technical-api-labels.ts";
import {
  type DATA_LABELS,
  type DEPLOYMENT_LABELS,
  environmentRowsOf,
} from "../lib/technical-labels.ts";
import { ProposedSectionText } from "./architecture-review-content.tsx";

/**
 * Contenu en lecture d'une proposition du cahier technique (maquette 14 l.737-741) : nœuds texte seulement (sortie du
 * modèle : jamais de lien, de balise ni d'image).
 */
type Content = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");
const records = (value: unknown): Content[] =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Content => typeof item === "object" && item !== null,
  );

function Block({ title, value }: { title: string; value: string }) {
  if (!value) return null;
  return (
    <ProposalDetailSection title={title} variant="label">
      <ProposalDetailText>{value}</ProposalDetailText>
    </ProposalDetailSection>
  );
}

const KIND_OF: ReadonlyArray<[prefix: string, kind: EntityKind]> = [
  ["C-", "component"],
  ["ADR-", "decision"],
  ["NFR-", "nfr"],
  ["R-", "rule"],
  ["F-", "feature"],
];

function Links({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <EntityChip
          key={id}
          id={id}
          kind={KIND_OF.find(([prefix]) => id.startsWith(prefix))?.[1] ?? "component"}
        />
      ))}
    </div>
  );
}

/** « Options comparées », une rubrique par critère (« option : valeur »), puis « En clair » (lu par le client). */
function StackContent({ content }: { content: Content }) {
  const options = strings(content.options);
  return (
    <>
      <Block title="Options comparées" value={options.join(" · ")} />
      {records(content.criteria).map((criterion) => {
        const values = strings(criterion.values);
        const cells = options.map((option, index) => `${option} : ${values[index] ?? "—"}`);
        return (
          <Block
            key={text(criterion.label)}
            title={text(criterion.label)}
            value={cells.join(" · ")}
          />
        );
      })}
      <Block title="En clair" value={text(content.plain)} />
      <Links ids={[...strings(content.components), ...strings(content.decisions)]} />
    </>
  );
}

function OperationContent({ content }: { content: Content }) {
  const input = records(content.input).map((row) =>
    [text(row.field), text(row.type), text(row.constraint)].filter(Boolean).join(" : "),
  );
  const errors = records(content.errors).map((row) => `${text(row.code)} : ${text(row.when)}`);
  return (
    <>
      <Block title="Résumé" value={text(content.summary)} />
      <Block title="Entrée" value={input.join("\n")} />
      <Block title="Erreurs" value={errors.join("\n")} />
      <Links ids={[...strings(content.rules), ...strings(content.features)]} />
    </>
  );
}

function RequirementContent({ content }: { content: Content }) {
  const verification = verificationText(
    text(content.verification),
    text(content.verificationDetail),
  );
  return (
    <>
      <Block title="Cible" value={text(content.target)} />
      <Block title="Énoncé" value={text(content.statement)} />
      <Block title="Vérification" value={verification} />
      <Links ids={strings(content.links)} />
    </>
  );
}

/** Une rubrique par ligne, dans l'ordre du tableau des environnements ; variables et intégrations ensuite. */
function EnvironmentContent({ content }: { content: Content }) {
  const environment = {
    ...content,
    data: text(content.data) as keyof typeof DATA_LABELS,
    deployment: text(content.deployment) as keyof typeof DEPLOYMENT_LABELS,
    extras: records(content.extras).map((e) => ({ label: text(e.label), value: text(e.value) })),
  };
  const rows = environmentRowsOf([environment as never]);
  const variables = records(content.variables).map((v) => `${text(v.name)} : ${text(v.usage)}`);
  const integrations = records(content.integrations).map(
    (item) => `${text(item.service)} : ${text(item.usage)}`,
  );
  return (
    <>
      {rows.map((row) => (
        <Block key={row.label} title={row.label} value={text(row.values[0])} />
      ))}
      <Block title="Variables et secrets" value={variables.join("\n")} />
      <Block title="Intégrations externes" value={integrations.join("\n")} />
    </>
  );
}

const CONTENT: Record<string, (props: { content: Content }) => React.ReactNode> = {
  stack: StackContent,
  op: OperationContent,
  nfr: RequirementContent,
  env: EnvironmentContent,
};

/** Contenu en lecture d'une proposition `stack`, `op`, `nfr`, `env` ou d'une section du document technique. */
export function TechnicalProposalContent({ proposal }: { proposal: ProposalOutput }) {
  const Content = CONTENT[proposal.kind];
  if (!Content) return <ProposedSectionText markdown={proposal.content.markdown} />;
  return <Content content={proposal.content} />;
}
