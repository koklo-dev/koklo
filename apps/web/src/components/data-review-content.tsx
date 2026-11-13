import {
  EntityChip,
  type EntityKind,
  ProposalDetailSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import type { ProposalOutput } from "../lib/proposal-types.ts";

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");
const records = (value: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
  );

/** Aperçu de lignes d'un jeu d'exemple à la relecture : le reste se lit une fois le jeu enregistré. */
const SAMPLE_ROWS = 5;

/** « Plusieurs réservations pour un client » : le sens d'une cardinalité en mots, sans rien ajouter à la proposition. */
const SENSE: Record<string, (from: string, to: string) => string> = {
  "1 → n": (from, to) => `un ${from} pour plusieurs ${to}`,
  "n → 1": (from, to) => `plusieurs ${from} pour un ${to}`,
  "1 → 1": (from, to) => `un ${from} pour un ${to}`,
  "1 → 0..1": (from, to) => `un ${from} pour au plus un ${to}`,
  "n ↔ n": (from, to) => `plusieurs ${from} pour plusieurs ${to}`,
};
const shortName = (id: string): string => id.replace(/^T-/, "").replaceAll("-", " ");

function constraintOf(field: Record<string, unknown>): string {
  const parts = [
    field.primaryKey === true ? "Clé primaire" : "",
    text(field.constraints),
    strings(field.values).length > 0 ? strings(field.values).join(", ") : "",
    text(field.rule) ? `(${text(field.rule)})` : "",
    field.personalData === true ? "données personnelles" : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function Grid({ columns, rows, label }: { columns: string[]; rows: string[][]; label: string }) {
  return (
    <Table framed dense aria-label={label}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lignes d'une proposition, ordre fixe
          <TableRow key={index}>
            {row.map((cell, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cellules d'une ligne, ordre fixe
              <TableCell key={at} className={at < 2 ? "font-mono text-code" : ""}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const sourceKind = (id: string): EntityKind =>
  id.startsWith("R-") ? "rule" : id.startsWith("NFR-") ? "nfr" : "feature";

function Sources({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <EntityChip key={id} kind={sourceKind(id)} id={id} />
      ))}
    </div>
  );
}

function TableContent({ content }: { content: Record<string, unknown> }) {
  const rows = records(content.fields).map((field) => [
    text(field.name),
    text(field.type),
    constraintOf(field),
  ]);
  return (
    <>
      {text(content.description) ? (
        <p className="whitespace-pre-line text-body">{text(content.description)}</p>
      ) : null}
      <Grid columns={["Champ", "Type", "Contraintes"]} rows={rows} label="Champs de la table" />
      <Sources ids={strings(content.sources)} />
    </>
  );
}

function RelationsContent({ content }: { content: Record<string, unknown> }) {
  const rows = records(content.relations).map((relation) => {
    const from = shortName(text(relation.from));
    const to = shortName(text(relation.to));
    const cardinality = text(relation.cardinality);
    return [`${from} → ${to}`, cardinality, SENSE[cardinality]?.(from, to) ?? ""];
  });
  return (
    <Grid columns={["De → À", "Cardinalité", "Sens"]} rows={rows} label="Relations proposées" />
  );
}

function FixturesContent({ content }: { content: Record<string, unknown> }) {
  const all = records(content.rows);
  const columns = [...new Set(all.flatMap((row) => Object.keys(row)))];
  const rows = all
    .slice(0, SAMPLE_ROWS)
    .map((row) => columns.map((name) => String(row[name] ?? "—")));
  return (
    <>
      <p className="text-body">
        {`Jeu ${text(content.title)} · ${text(content.table)} · ${all.length} ${all.length >= 2 ? "lignes fictives" : "ligne fictive"}`}
      </p>
      <ProposalDetailSection title="Aperçu des lignes">
        <Grid columns={columns} rows={rows} label="Aperçu du jeu d'exemple" />
      </ProposalDetailSection>
    </>
  );
}

/** Contenu en lecture d'une proposition de table, de relations ou de jeu : nœuds texte seulement (sortie du modèle). */
export function DataProposalContent({ proposal }: { proposal: ProposalOutput }) {
  if (proposal.kind === "table") return <TableContent content={proposal.content} />;
  if (proposal.kind === "relations") return <RelationsContent content={proposal.content} />;
  return <FixturesContent content={proposal.content} />;
}
