import { IdTag, ProposalDetailLines, ProposalDetailSection } from "@koklo/ui";
import { componentTypeLabel } from "../lib/architecture-labels.ts";
import type { ProposalOutput } from "../lib/proposal-types.ts";

/**
 * Contenu en lecture d'une proposition de l'architecture : nœuds texte seulement (sortie du modèle : jamais de lien,
 * de balise ni d'image), jamais de YAML ni de Mermaid.
 */
type Content = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");
const records = (value: unknown): Content[] =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Content => typeof item === "object" && item !== null,
  );

function Tags({ ids, label }: { ids: string[]; label: string }) {
  if (ids.length === 0) return null;
  return (
    <ProposalDetailSection title={label}>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <IdTag key={id}>{id}</IdTag>
        ))}
      </div>
    </ProposalDetailSection>
  );
}

function Lines({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ProposalDetailSection title={title}>
      <ProposalDetailLines
        lines={lines.map((line, index) => ({
          icon: "arrow_forward" as const,
          text: line,
          key: `${index}-${line}`,
        }))}
      />
    </ProposalDetailSection>
  );
}

function ComponentContent({ content }: { content: Content }) {
  const depends = records(content.dependsOn).map(
    (link) => `${text(link.to)} · ${text(link.via)}${link.async === true ? " · asynchrone" : ""}`,
  );
  return (
    <>
      <p className="whitespace-pre-line text-body">{text(content.responsibility)}</p>
      <p className="text-meta text-muted-foreground">{componentTypeLabel(text(content.type))}</p>
      <Tags ids={strings(content.owns)} label="Possède les données" />
      <Lines title="Dépend de" lines={depends} />
      <Tags ids={strings(content.serves)} label="Sert les fonctionnalités" />
      <Tags ids={strings(content.decisions)} label="Décisions" />
    </>
  );
}

function messageLine(item: Content): string {
  const base = `${text(item.from)} → ${text(item.to)} : ${text(item.text)}`;
  const reply = text(item.reply);
  const error = text(item.error);
  return [base, reply ? `← ${reply}` : "", error ? `Erreur : ${error}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function flowLines(items: Content[]): string[] {
  return items.flatMap((item) => {
    if (item.block === "separator") return [`— ${text(item.label)} —`];
    if (item.block === "alt") {
      return [`Cas alternatif : ${text(item.label)}`, ...records(item.messages).map(messageLine)];
    }
    return [messageLine(item)];
  });
}

function ArchflowContent({ content }: { content: Content }) {
  return (
    <>
      <p className="text-body">
        Flux du parcours <span className="font-mono text-code">{text(content.flow)}</span>.
      </p>
      <Tags ids={strings(content.participants)} label="Participants" />
      <Lines title="Messages" lines={flowLines(records(content.messages))} />
      <Tags ids={[...strings(content.features), ...strings(content.rules)]} label="Liens" />
    </>
  );
}

function Paragraph({ title, value }: { title: string; value: unknown }) {
  if (!text(value)) return null;
  return (
    <ProposalDetailSection title={title}>
      <p className="whitespace-pre-line text-body">{text(value)}</p>
    </ProposalDetailSection>
  );
}

function AdrContent({ content }: { content: Content }) {
  const alternatives = records(content.alternatives).map(
    (item) => `${text(item.name)} : ${text(item.reason)}`,
  );
  return (
    <>
      <Paragraph title="Contexte" value={content.context} />
      <Paragraph title="Décision" value={content.decision} />
      <Lines title="Conséquences positives" lines={strings(content.positives)} />
      <Lines title="À accepter" lines={strings(content.accepted)} />
      <Lines title="Alternatives écartées" lines={alternatives} />
      <Paragraph title="En clair" value={content.plain} />
      <Tags ids={strings(content.links)} label="Liens" />
    </>
  );
}

/** Contenu en lecture d'une proposition `component`, `archflow`, `adr` ou `doc_section`. */
export function ArchitectureProposalContent({ proposal }: { proposal: ProposalOutput }) {
  const { content } = proposal;
  if (proposal.kind === "component") return <ComponentContent content={content} />;
  if (proposal.kind === "archflow") return <ArchflowContent content={content} />;
  if (proposal.kind === "adr") return <AdrContent content={content} />;
  return <Paragraph title="Texte proposé" value={content.markdown} />;
}
