import type { AdrDetail, AdrSummary } from "@koklo/contract";
import type { Prisma } from "@koklo/db";
import { ADR_STATUSES } from "@koklo/schema";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";

/**
 * Lecture tolérante des décisions de l'index d'entités (`spec_entities.data`, TK-113) : ce que le worker écrit depuis
 * `architecture/adr/ADR-<nnn>-<slug>.md`. Rien n'est supposé : un champ absent ou d'un autre type reprend sa valeur neutre,
 * jamais une exception. Les textes sont rendus tels quels : l'écran les affiche en texte brut.
 */
type Json = Record<string, unknown>;
type Status = AdrSummary["status"];

const ADR = /^ADR-\d{3,}$/;
const LINK = /^(F-\d{3,}|R-\d{3,}|T-[a-z0-9][a-z0-9-]*|C-[a-z0-9][a-z0-9-]*|P-[a-z0-9][a-z0-9-]*)$/;

const record = (value: unknown): Json => (isRecord(value) ? value : {});
const statusOf = (value: unknown): Status =>
  ADR_STATUSES.find((status) => status === value) ?? "proposee";
const linksOf = (data: Json): string[] => texts(data.liens).filter((id) => LINK.test(id));
const supersededByOf = (data: Json): string | undefined => {
  const id = text(data.remplacee_par);
  return ADR.test(id) ? id : undefined;
};

/** Ligne de la liste : titre, statut, date, liens, remplaçante, chemin du fichier. */
export function adrSummary(specId: string, path: string, data: unknown): AdrSummary {
  const json = record(data);
  const supersededBy = supersededByOf(json);
  return {
    specId,
    title: text(json.titre) || specId,
    status: statusOf(json.statut),
    date: text(json.date),
    links: linksOf(json),
    ...(supersededBy === undefined ? {} : { supersededBy }),
    filePath: path,
  };
}

const alternativesOf = (data: Json): AdrDetail["alternatives"] =>
  list(data.alternatives).flatMap((entry) => {
    const alternative = record(entry);
    const name = text(alternative.nom);
    return name === "" ? [] : [{ name, reason: text(alternative.raison) }];
  });

/**
 * Fiche d'une décision. `supersededOn` est la date de la décision remplaçante (`adrSupersession`) : absente quand la décision
 * n'est pas remplacée ou que la remplaçante est inconnue.
 */
export function adrDetail(
  specId: string,
  data: unknown,
  where: { filePath: string; commitSha: string },
  supersededOn?: string,
): AdrDetail {
  const json = record(data);
  const consequences = record(json.consequences);
  const summary = adrSummary(specId, where.filePath, data);
  const plain = text(json.en_clair);
  return {
    specId,
    title: summary.title,
    status: summary.status,
    date: summary.date,
    deciders: texts(json.decideurs),
    context: text(json.contexte),
    decision: text(json.decision),
    consequences: {
      positive: texts(consequences.positives),
      toAccept: texts(consequences.a_accepter),
    },
    alternatives: alternativesOf(json),
    links: summary.links,
    ...(summary.supersededBy === undefined ? {} : { supersededBy: summary.supersededBy }),
    ...(supersededOn === undefined || summary.supersededBy === undefined ? {} : { supersededOn }),
    ...(plain === "" ? {} : { plain }),
    filePath: where.filePath,
    commitSha: where.commitSha,
  };
}

/** Date de la décision remplaçante, d'après les dates des décisions citées ; `undefined` sans remplaçante connue. */
export function adrSupersession(
  data: unknown,
  dates: ReadonlyMap<string, string>,
): string | undefined {
  const by = supersededByOf(record(data));
  const date = by === undefined ? undefined : dates.get(by);
  return date === undefined || date === "" ? undefined : date;
}

/** Identifiant de la décision qui en remplace une autre : ce qu'il faut lire pour en connaître la date. */
export const supersededByOfData = (data: unknown): string | undefined =>
  supersededByOf(record(data));

export interface AdrFilters {
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  component?: string | undefined;
}

/**
 * Conditions de la liste sur `spec_entities.data` : statut, période (dates ISO, comparaison de texte) et composant (cité par
 * les `liens` de la décision, ou la citant par ses `decisions`, d'où `cited`). Jamais de SQL libre.
 */
export function adrFilter(
  filters: AdrFilters,
  cited: readonly string[] = [],
): Prisma.SpecEntityWhereInput[] {
  const { status, from, to, component } = filters;
  const clauses: Prisma.SpecEntityWhereInput[] = [];
  if (status !== undefined) clauses.push({ data: { path: ["statut"], equals: status } });
  if (from !== undefined) clauses.push({ data: { path: ["date"], gte: from } });
  if (to !== undefined) clauses.push({ data: { path: ["date"], lte: to } });
  if (component !== undefined) {
    clauses.push({
      OR: [
        { data: { path: ["liens"], array_contains: [component] } },
        { specId: { in: [...cited] } },
      ],
    });
  }
  return clauses;
}
