"use client";

import type { SpecItem } from "@koklo/contract";
import {
  Button,
  type DiagramRelation,
  EntityChip,
  type ErTableField,
  IdTag,
  SegmentedControl,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { DiagramCard } from "../lib/data-mermaid.ts";
import { orpc } from "../lib/orpc.ts";
import { ModelMermaid, TableYaml } from "./data-diagram-source.tsx";

type Detail = Extract<SpecItem, { type: "table" }>["values"];
type View = "fiche" | "yaml" | "mermaid";

const VIEWS = [
  { value: "fiche", label: "Fiche" },
  { value: "yaml", label: "YAML" },
  { value: "mermaid", label: "Mermaid" },
] as const;

const SECTION = "text-caption font-semibold uppercase tracking-[0.05em] text-muted-foreground";

interface FieldRow {
  name: string;
  type: string;
  rules: string;
}

/** `ref(T-client)` se lit « → T-client » (maquette 11 l.214) ; les autres types restent tels quels. */
const typeLabelOf = (type: string): string => type.replace(/^ref\((T-[^)]+)\)$/, "→ $1");

const rulesOf = (parts: ReadonlyArray<string | false | undefined>): string =>
  parts.filter(Boolean).join(" · ") || "—";

const rowsOfDetail = (detail: Detail): FieldRow[] =>
  detail.fields.map((field) => ({
    name: field.name,
    type: field.type,
    rules: rulesOf([
      field.primaryKey && "Clé primaire",
      field.constraints ?? field.values?.join(", "),
      field.personalData && "données personnelles",
    ]),
  }));

const rowsOfCard = (fields: readonly ErTableField[]): FieldRow[] =>
  fields.map((field) => ({
    name: field.name,
    type: field.type,
    rules: rulesOf([
      field.kind === "primary" && "Clé primaire",
      field.kind === "personal" && "données personnelles",
    ]),
  }));

/** Champs de la table : nom et type en mono, contraintes (maquette 11 l.208-230). */
function FieldsTable({ rows }: { rows: readonly FieldRow[] }) {
  return (
    <Table framed compact frameLabel="Champs de la table" aria-label="Champs de la table">
      <TableHeader>
        <TableRow>
          <TableHead>Champ</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Contraintes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell className="font-mono text-code font-medium">{row.name}</TableCell>
            <TableCell className="whitespace-nowrap font-mono text-code text-muted-foreground">
              {typeLabelOf(row.type)}
            </TableCell>
            <TableCell className="text-meta">{row.rules}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Relations des deux sens, écrites « cardinalité Source → Cible » (B423 : aucune phrase inventée). */
function Relations({
  links,
  nameOf,
}: {
  links: readonly DiagramRelation[];
  nameOf: (id: string) => string;
}) {
  return (
    <section aria-labelledby="fiche-relations" className="flex flex-col gap-1.5">
      <span id="fiche-relations" className={SECTION}>
        Relations
      </span>
      {links.length === 0 ? (
        <p className="m-0 text-meta text-muted-foreground">Aucune relation</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 text-meta">
              <span className="min-w-[52px] shrink-0 whitespace-nowrap font-mono text-code text-muted-foreground">
                {link.label}
              </span>
              <span>{`${nameOf(link.from)} → ${nameOf(link.to)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** « Utilisée par » : une pastille par fonctionnalité ou règle citée (jamais le seul accès : pas de lien sans page). */
function UsedBy({ sources }: { sources: readonly string[] }) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby="fiche-used-by" className="flex flex-col gap-1.5">
      <span id="fiche-used-by" className={SECTION}>
        Utilisée par
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((id) => (
          <EntityChip key={id} kind={id.startsWith("R-") ? "rule" : "feature"} id={id} />
        ))}
      </div>
    </section>
  );
}

interface FicheViewProps {
  projectId: string;
  card: DiagramCard;
  links: readonly DiagramRelation[];
  nameOf: (id: string) => string;
}

/** Vue Fiche d'une table enregistrée : description, champs et sources lus dans le dépôt (`spec.item.get`). */
function SavedFiche({ projectId, card, links, nameOf }: FicheViewProps) {
  const detail = useQuery(
    orpc.spec.item.get.queryOptions({ input: { projectId, type: "table", id: card.id } }),
  );
  const values = detail.data?.type === "table" ? detail.data.values : undefined;
  if (detail.isPending) return <Skeleton aria-busy="true" className="h-40 rounded-[10px]" />;
  return (
    <>
      {values?.description ? (
        <p className="m-0 text-body leading-[1.55]">{values.description}</p>
      ) : null}
      <FieldsTable rows={values ? rowsOfDetail(values) : rowsOfCard(card.fields)} />
      <Relations links={links} nameOf={nameOf} />
      <UsedBy sources={values?.sources ?? []} />
    </>
  );
}

/** Fiche d'une table proposée (B424) : champs et description de la proposition, rien du dépôt. */
function ProposedFiche({ card, links, nameOf }: Omit<FicheViewProps, "projectId">) {
  return (
    <>
      {card.description ? <p className="m-0 text-body leading-[1.55]">{card.description}</p> : null}
      <FieldsTable rows={rowsOfCard(card.fields)} />
      <Relations links={links} nameOf={nameOf} />
    </>
  );
}

export interface DiagramFicheProps extends FicheViewProps {
  /** Mermaid du modèle entier (la lecture du diagramme). */
  mermaid: string;
  /** « Modifier » : équipe qui écrit, table enregistrée seulement. */
  onEdit: (() => void) | undefined;
}

/**
 * Fiche ancrée d'une table du diagramme (maquette 11 l.208-230) : identifiant, « Modifier », titre, sélecteur Fiche ·
 * YAML · Mermaid, puis la vue choisie. Une table proposée ou rejetée n'a pas de fichier : Fiche seulement (B424).
 */
export function DiagramFiche(props: DiagramFicheProps) {
  const { projectId, card, links, nameOf, mermaid, onEdit } = props;
  const [view, setView] = useState<View>("fiche");
  const saved = !card.state;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IdTag>{card.id}</IdTag>
        <span className="flex-1" />
        {saved && onEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Modifier
          </Button>
        ) : null}
      </div>
      <h2 className="m-0 text-settings-title">{card.name}</h2>
      {saved ? (
        <SegmentedControl<View>
          aria-label="Affichage de la table"
          options={VIEWS}
          value={view}
          onValueChange={setView}
          className="self-start"
        />
      ) : null}
      {!saved ? (
        <ProposedFiche card={card} links={links} nameOf={nameOf} />
      ) : view === "yaml" ? (
        <TableYaml projectId={projectId} tableId={card.id} />
      ) : view === "mermaid" ? (
        <ModelMermaid text={mermaid} />
      ) : (
        <SavedFiche projectId={projectId} card={card} links={links} nameOf={nameOf} />
      )}
    </div>
  );
}
