import { DATA_CATEGORY_PILL, type DataCategoryKind, EntityChip } from "@koklo/ui";
import type { ProposalOutput } from "../lib/proposal-types.ts";
import {
  CARD_TITLES,
  CHAPTER_LABELS,
  SEVERITY_LABELS,
  THREAT_CATEGORY_LABELS,
  VERIFICATION_LABELS,
} from "../lib/security-labels.ts";
import { ProposedSectionText } from "./architecture-review-content.tsx";
import { Block, type Content, records, strings, text } from "./proposal-content-parts.tsx";

/**
 * Contenu en lecture d'une proposition de la Sécurité (maquette 15 l.106-111) : nœuds texte seulement (sortie du
 * modèle : jamais de lien, de balise ni d'image).
 */
const record = (value: unknown): Content =>
  typeof value === "object" && value !== null ? (value as Content) : {};
const label = <K extends string>(labels: Record<K, string>, value: unknown): string =>
  labels[text(value) as K] ?? text(value);

function ThreatContent({ content }: { content: Content }) {
  const scenario = record(content.scenario);
  const quoted = scenario.when
    ? `Quand ${text(scenario.when)}\nAlors ${text(scenario.expected)}`
    : "";
  const severity = label(SEVERITY_LABELS, content.severity).toLowerCase();
  return (
    <>
      <Block
        title="Menace"
        value={`${label(THREAT_CATEGORY_LABELS, content.category)} · gravité ${severity}`}
      />
      <Block title="Ce qui peut arriver" value={text(content.risk)} />
      <Block title="Parades" value={strings(content.measures).join("\n")} />
      <Block title="Vérification" value={label(VERIFICATION_LABELS, content.verification)} />
      <Block title="Scénario d'abus" value={quoted} />
      <div className="flex flex-wrap gap-1.5">
        {strings(content.surfaces).map((id) => (
          <EntityChip key={id} id={id} kind="feature" />
        ))}
        {strings(content.links).map((id) => (
          <EntityChip key={id} id={id} kind="endpoint" />
        ))}
      </div>
    </>
  );
}

function SensitiveContent({ content }: { content: Content }) {
  const category = DATA_CATEGORY_PILL[text(content.category) as DataCategoryKind];
  return (
    <>
      <Block title="Champs" value={strings(content.fields).join(", ")} />
      <Block title="Catégorie" value={category?.label ?? ""} />
      <Block
        title="Conservation suggérée, à saisir par vous"
        value={text(content.retentionSuggestion)}
      />
      <Block title="Qui y accède" value={strings(content.access).join(" ; ")} />
      <Block title="Protection" value={text(content.protection)} />
    </>
  );
}

function RightContent({ content }: { content: Content }) {
  return (
    <>
      <Block title="Rôle" value={text(content.role)} />
      <Block title="Permission" value={text(content.permission)} />
      <Block title="Restriction" value={text(content.restriction)} />
      <Block title="Règle de propriété" value={text(content.ownershipRule)} />
    </>
  );
}

function RequirementContent({ content }: { content: Content }) {
  const requirement = record(content.requirement);
  const facts = records(content.facts);
  return (
    <>
      <Block
        title="Chapitre"
        value={
          requirement.chapter
            ? `${label(CHAPTER_LABELS, requirement.chapter)} · niveau ${String(requirement.level)}`
            : ""
        }
      />
      <Block title="Réponse" value={text(requirement.answer)} />
      <Block
        title="Secrets et dépendances"
        value={facts.map((fact) => `${text(fact.label)} : ${text(fact.value)}`).join("\n")}
      />
    </>
  );
}

function SummaryContent({ content }: { content: Content }) {
  return (
    <>
      {Object.entries(CARD_TITLES).map(([key, title]) => (
        <Block key={key} title={title} value={text(content[key])} />
      ))}
    </>
  );
}

const CONTENT: Record<string, (props: { content: Content }) => React.ReactNode> = {
  threat: ThreatContent,
  sensitive: SensitiveContent,
  right: RightContent,
  asvs: RequirementContent,
  summary: SummaryContent,
};

/** Contenu d'une proposition `threat`, `sensitive`, `right`, `asvs`, `summary` ou d'une section du dossier. */
export function SecurityProposalContent({ proposal }: { proposal: ProposalOutput }) {
  const Content = CONTENT[proposal.kind];
  if (!Content) return <ProposedSectionText markdown={proposal.content.markdown} />;
  return <Content content={proposal.content} />;
}
