"use client";

import type { dataFixtureSummarySchema } from "@koklo/contract";
import {
  cn,
  EmptyState,
  IdTag,
  Pagination,
  Pill,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import type { z } from "zod";
import { DATA_FIXTURES_HELP, fixtureMeta } from "../lib/data-labels.ts";
import { FIXTURE_PAGE_SIZE, useDataFixtures, useFixtureRows } from "../lib/use-data-fixtures.ts";
import type { DataPageModel } from "../lib/use-data-page.ts";
import { ErrorNotice } from "./error-notice.tsx";

type Fixture = z.infer<typeof dataFixtureSummarySchema>;

const cell = (value: unknown): string =>
  value === undefined || value === "" ? "—" : String(value);

/** Un jeu d'exemple (maquette 11 l.255-266) : en-tête, tableau aux colonnes mono, pagination numérotée de 25 lignes. */
function FixtureSection({ projectId, fixture }: { projectId: string; fixture: Fixture }) {
  const { query, page, setPage } = useFixtureRows(projectId, fixture.specId);
  const rows = query.data?.items ?? [];
  const columns = query.data?.columns ?? [];
  const label = `Lignes du jeu ${fixture.title}`;
  return (
    <section
      aria-label={`Jeu d'exemple ${fixture.title}`}
      data-spec-id={fixture.specId}
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
        <IdTag>{fixture.specId}</IdTag>
        <h3 className="m-0 text-subsection-title">{fixture.title}</h3>
        <span className="flex-1" />
        <span className="text-caption text-muted-foreground">
          {fixtureMeta(fixture.rowCount, fixture.table, fixture.locale)}
        </span>
      </div>
      {query.isError ? (
        <div className="p-3">
          <ErrorNotice
            title="Impossible de charger les lignes"
            onRetry={() => void query.refetch()}
          >
            Les lignes de ce jeu n'ont pas pu être lues.
          </ErrorNotice>
        </div>
      ) : query.isPending ? (
        <Skeleton aria-busy="true" className="m-3 h-24 rounded-lg" />
      ) : (
        <Table
          dense
          framed
          frameLabel={label}
          frameClassName="rounded-none border-0"
          aria-label={label}
        >
          <TableHeader>
            <TableRow>
              {columns.map((name) => (
                <TableHead key={name} className="font-mono">
                  {name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lignes d'une page d'un jeu, sans identifiant propre
              <TableRow key={index}>
                {columns.map((name) => (
                  <TableCell key={name}>{cell(row[name])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination
        page={page}
        density="sm"
        size={FIXTURE_PAGE_SIZE}
        total={fixture.rowCount}
        onPageChange={setPage}
        aria-label={`Pagination du jeu ${fixture.title}`}
      />
    </section>
  );
}

/** Lignes affichées d'un jeu proposé : le reste se lit une fois le jeu enregistré (25 par page). */
const PROPOSED_ROWS = 25;

/** Jeux d'exemple proposés par l'agent : en-tête et lignes fournies, sous les jeux enregistrés pendant la relecture. */
function ProposedFixtures({ page }: { page: DataPageModel }) {
  const fixtures = page.review.proposals.filter((proposal) => proposal.kind === "fixtures");
  if (!page.propose.reviewing || fixtures.length === 0) return null;
  return (
    <>
      {fixtures.map((proposal) => {
        const all = Array.isArray(proposal.content.rows)
          ? (proposal.content.rows as Array<Record<string, unknown>>)
          : [];
        const columns = [...new Set(all.flatMap((row) => Object.keys(row)))];
        return (
          <section
            key={proposal.id}
            aria-label={`Jeu proposé ${proposal.title}`}
            className={cn(
              "overflow-hidden rounded-xl border border-dashed border-border",
              proposal.status === "rejected" && "text-muted-foreground",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
              <h3 className="m-0 text-subsection-title">{proposal.title}</h3>
              <Pill size="xs" tone={proposal.status === "rejected" ? "outline" : "soft"}>
                {proposal.status === "rejected" ? "Rejeté" : "À relire"}
              </Pill>
              <span className="flex-1" />
              <span className="text-caption text-muted-foreground">
                {fixtureMeta(all.length, String(proposal.content.table), "fr-FR")}
              </span>
            </div>
            <Table
              dense
              framed
              frameLabel={`Lignes du jeu proposé ${proposal.title}`}
              frameClassName="rounded-none border-0"
              aria-label={`Lignes du jeu proposé ${proposal.title}`}
            >
              <TableHeader>
                <TableRow>
                  {columns.map((name) => (
                    <TableHead key={name} className="font-mono">
                      {name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.slice(0, PROPOSED_ROWS).map((row, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lignes d'une proposition, ordre fixe
                  <TableRow key={index}>
                    {columns.map((name) => (
                      <TableCell key={name}>{cell(row[name])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </>
  );
}

/**
 * Onglet Jeux d'exemple (maquette 11 l.248-285) : phrase d'aide, une section par jeu, lignes fictives paginées par 25.
 * Les jeux viennent de `spec.data.fixtures.list` ; les lignes d'une page, de `spec.data.fixtures.rows`.
 */
export function DataFixturesTab({ page }: { page: DataPageModel }) {
  const fixtures = useDataFixtures(page.projectId, true);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-meta text-muted-foreground">{DATA_FIXTURES_HELP}</p>
      {fixtures.isError ? (
        <ErrorNotice
          title="Impossible de charger les jeux d'exemple"
          onRetry={() => void fixtures.refetch()}
        >
          Les jeux d'exemple n'ont pas pu être lus.
        </ErrorNotice>
      ) : fixtures.isPending ? (
        <Skeleton aria-busy="true" className="h-40 rounded-xl" />
      ) : fixtures.data.items.length === 0 && !page.propose.reviewing ? (
        <EmptyState
          variant="inline"
          bordered
          icon="dataset"
          title="Aucun jeu d'exemple"
          description="Les jeux d'exemple sont des lignes fictives, typées d'après les tables."
        />
      ) : (
        fixtures.data.items.map((fixture) => (
          <FixtureSection key={fixture.specId} projectId={page.projectId} fixture={fixture} />
        ))
      )}
      <ProposedFixtures page={page} />
    </div>
  );
}
