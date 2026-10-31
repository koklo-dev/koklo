import type { FeatureDetail as Detail } from "@koklo/contract";
import { Badge, Icon } from "@koklo/ui";
import { stepLabel } from "../lib/feature-labels.ts";

type Criterion = Detail["criteria"][number];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Criteria({ criteria }: { criteria: Criterion[] }) {
  if (criteria.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Aucun critère d'acceptation pour le moment.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-4">
      {criteria.map((criterion) => (
        <li key={criterion.specId} className="flex flex-col gap-1.5">
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">{criterion.specId}</span>
            <span className="text-sm font-medium">{criterion.title}</span>
          </p>
          <ul className="flex list-none flex-col gap-1 text-sm">
            {criterion.steps.map((step, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: étapes ordonnées, sans identifiant propre
              <li key={index}>
                <strong className="font-semibold">{stepLabel(step.type)}</strong> {step.text}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

interface Group {
  label: string;
  values: string[];
  /** Réservé à l'équipe : technique, jamais montré au client ni au business. */
  technical?: boolean;
}

function groupsOf(detail: Detail): Group[] {
  return [
    { label: "Écrans", values: detail.screens },
    { label: "Rôles", values: detail.roles },
    { label: "Règles", values: detail.rules },
    { label: "Tables", values: detail.tables, technical: true },
    { label: "Endpoints", values: detail.endpoints, technical: true },
    { label: "Exigences non fonctionnelles", values: detail.nfr, technical: true },
  ];
}

function Links({ detail, team }: { detail: Detail; team: boolean }) {
  const groups = groupsOf(detail).filter(
    (group) => group.values.length > 0 && (team || !group.technical),
  );
  if (groups.length === 0) return null;
  return (
    <Section title="Éléments liés">
      <dl className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <dt className="text-[13px]">{group.label}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {group.values.map((value) => (
                <Badge key={value} variant="outline" className="font-mono">
                  {value}
                </Badge>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Version lue et fichier : l'équipe seulement (le client ne croise jamais de vocabulaire git). */
function Provenance({ detail }: { detail: Detail }) {
  const short = detail.commitSha.slice(0, 7);
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-4 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5">
        <Icon name="commit" size={16} />
        Version de la spec
        <span role="img" aria-label={`Version de la spec ${short}`} className="font-mono">
          {short}
        </span>
      </p>
      <p>
        Fichier <span className="font-mono">{detail.filePath}</span>
      </p>
    </div>
  );
}

/** Contenu de la fiche : description en texte brut, critères, éléments liés et, pour l'équipe, la provenance. */
export function FeatureDetail({ detail, team }: { detail: Detail; team: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Description">
        {detail.description ? (
          <p className="whitespace-pre-wrap text-sm">{detail.description}</p>
        ) : (
          <p className="text-[13px] text-muted-foreground">Aucune description.</p>
        )}
      </Section>
      <Section title="Critères d'acceptation">
        <Criteria criteria={detail.criteria} />
      </Section>
      <Links detail={detail} team={team} />
      {team ? <Provenance detail={detail} /> : null}
    </div>
  );
}
