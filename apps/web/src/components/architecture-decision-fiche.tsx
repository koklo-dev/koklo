"use client";

import {
  Button,
  DecisionStatus,
  type DecisionStatusValue,
  EntityChip,
  type EntityKind,
  Icon,
  IdTag,
} from "@koklo/ui";
import { supersededText } from "../lib/architecture-labels.ts";
import { shortDate } from "../lib/overview-labels.ts";

/** Ce que la fiche lit d'une décision : celle de l'équipe (`adr.byId`) ou celle du client (`clientSpace.adr`). */
export interface DecisionFicheData {
  id: string;
  title: string;
  status: DecisionStatusValue;
  date: string;
  deciders: readonly string[];
  context: string;
  decision: string;
  consequences: { positive: readonly string[]; toAccept: readonly string[] };
  alternatives: readonly { name: string; reason: string }[];
  links?: readonly string[];
  supersededBy?: string | undefined;
  supersededOn?: string | undefined;
  plain?: string | undefined;
  /** Chemin du fichier : l'équipe seule le lit, jamais le client. */
  filePath?: string | undefined;
}

const LINK_KIND: Record<string, EntityKind> = {
  F: "feature",
  R: "rule",
  T: "table",
  C: "component",
  P: "flow",
};

const linkKindOf = (id: string): EntityKind => LINK_KIND[id.charAt(0)] ?? "feature";

function Meta({ data }: { data: DecisionFicheData }) {
  const parts = [shortDate(data.date), data.deciders.join(", ")].filter(Boolean);
  return <span className="text-caption text-muted-foreground">{parts.join(" · ")}</span>;
}

function Actions({
  onEdit,
  onComment,
}: {
  onEdit: (() => void) | undefined;
  onComment: (() => void) | undefined;
}) {
  return (
    <>
      {onEdit ? (
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Modifier
        </Button>
      ) : null}
      {onComment ? (
        <Button type="button" variant="outline" size="sm" onClick={onComment}>
          <Icon name="add_comment" size={16} />
          Commenter
        </Button>
      ) : null}
    </>
  );
}

/** « Remplacée par ADR-003 le 29 oct. » (B584) : la date est celle de la décision remplaçante, quand elle est indexée. */
function Superseded({ data }: { data: DecisionFicheData }) {
  if (!data.supersededBy) return null;
  const on = data.supersededOn ? shortDate(data.supersededOn) : undefined;
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-meta">
      <Icon name="swap_horiz" size={18} className="shrink-0 text-muted-foreground" />
      {supersededText(data.supersededBy, on)}
    </div>
  );
}

const SECTION = "flex flex-col gap-2";

function Consequences({ data }: { data: DecisionFicheData }) {
  const { positive, toAccept } = data.consequences;
  if (positive.length + toAccept.length === 0) return null;
  const rows = [
    ...positive.map((text) => ({
      text,
      label: "Positif :",
      icon: "add_circle" as const,
      tone: "text-status-validated-foreground",
    })),
    ...toAccept.map((text) => ({
      text,
      label: "À accepter :",
      icon: "do_not_disturb_on" as const,
      tone: "text-status-pending-icon",
    })),
  ];
  return (
    <section className={SECTION}>
      <h3 className="m-0 text-subsection-title">Conséquences</h3>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {rows.map((row) => (
          <li key={`${row.label}${row.text}`} className="flex gap-2 text-body">
            <Icon name={row.icon} size={18} fill className={`mt-0.5 shrink-0 ${row.tone}`} />
            <span>
              <strong className="font-semibold">{row.label}</strong> {row.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Alternatives({ data }: { data: DecisionFicheData }) {
  if (data.alternatives.length === 0) return null;
  return (
    <section className={SECTION}>
      <h3 className="m-0 text-subsection-title">Alternatives écartées</h3>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {data.alternatives.map((alternative) => (
          <li
            key={alternative.name}
            className="flex gap-2.5 rounded-lg border px-3 py-2.5 text-body"
          >
            <Icon name="block" size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <strong className="font-semibold">{alternative.name}</strong> · {alternative.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Fiche d'une décision (maquette 13 l.388-401) : identifiant, statut écrit, date et décideurs, « Modifier » (équipe
 * qui écrit) ou « Commenter » (client), encadré « Remplacée par … », « En clair » (client, texte fourni seulement),
 * Contexte, Décision, Conséquences, Alternatives, liens et chemin du fichier (équipe). Tout est rendu en texte brut.
 */
export function ArchitectureDecisionFiche({
  data,
  onEdit,
  onComment,
}: {
  data: DecisionFicheData;
  onEdit?: (() => void) | undefined;
  onComment?: (() => void) | undefined;
}) {
  return (
    <article
      aria-label="Décision"
      className="flex min-w-0 flex-[999_1_480px] flex-col gap-3.5 md:border-l md:pl-7"
    >
      <div className="flex flex-wrap items-center gap-2">
        <IdTag>{data.id}</IdTag>
        <DecisionStatus status={data.status} />
        <Meta data={data} />
        <span className="flex-1" />
        <Actions onEdit={onEdit} onComment={onComment} />
      </div>
      <h2 className="m-0 text-settings-title">{data.title}</h2>
      <Superseded data={data} />
      {data.plain ? (
        <div className="flex flex-col gap-1 rounded-[10px] border bg-surface px-3.5 py-3">
          <span className="font-semibold text-meta">En clair</span>
          <span className="text-body">{data.plain}</span>
        </div>
      ) : null}
      <section className={SECTION}>
        <h3 className="m-0 text-subsection-title">Contexte</h3>
        <p className="m-0 whitespace-pre-line text-body">{data.context}</p>
      </section>
      <section className={SECTION}>
        <h3 className="m-0 text-subsection-title">Décision</h3>
        <p className="m-0 whitespace-pre-line text-body">{data.decision}</p>
      </section>
      <Consequences data={data} />
      <Alternatives data={data} />
      {data.links && data.links.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {data.links.map((id) => (
            <EntityChip key={id} kind={linkKindOf(id)} id={id} />
          ))}
        </div>
      ) : null}
      {data.filePath ? (
        <span className="border-t pt-3 text-caption text-muted-foreground">
          Enregistrée dans la spec · <span className="font-mono">{data.filePath}</span>
        </span>
      ) : null}
    </article>
  );
}
