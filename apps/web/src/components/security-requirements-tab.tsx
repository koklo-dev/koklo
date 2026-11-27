"use client";

import type { SecurityAsvsReport } from "@koklo/contract";
import { CoverageTable, FactsPanel, IconList, SectionLead, SegmentedControl } from "@koklo/ui";
import {
  CHAPTER_LABELS,
  GATES,
  GATES_NOTE,
  GATES_TITLE,
  LEVEL_GROUP,
  LEVEL_HELP,
  LEVEL_TITLE,
  levelOptions,
  SECRETS_EMPTY,
  SECRETS_TITLE,
} from "../lib/security-labels.ts";
import type { SecurityPageModel } from "../lib/use-security-page.ts";
import { useSecurityLevel } from "../lib/use-security-writes.ts";
import { SecurityRead } from "./security-empty.tsx";

const rowsOf = (report: SecurityAsvsReport) =>
  report.chapters.map(({ chapter, where, ...row }) => ({
    ...row,
    id: chapter,
    name: CHAPTER_LABELS[chapter],
    where: where.join(" · "),
  }));

/** Niveau d'exigence : le choix s'enregistre tout de suite (`security.asvs.setLevel`) ; en lecture pour le designer. */
function Level({ page, report }: { page: SecurityPageModel; report: SecurityAsvsReport }) {
  const level = useSecurityLevel(page, report.level);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <SectionLead title={LEVEL_TITLE} help={LEVEL_HELP} />
      <SegmentedControl
        mode="radio"
        aria-label={LEVEL_GROUP}
        options={levelOptions(report.recommendedLevel)}
        value={String(level.value)}
        onValueChange={(value) => level.choose(Number(value) as 1 | 2 | 3)}
        className="max-md:flex-wrap [&>button]:h-[30px] max-md:[&>button]:h-11"
      />
    </div>
  );
}

function Report({ page, report }: { page: SecurityPageModel; report: SecurityAsvsReport }) {
  return (
    <>
      <Level page={page} report={report} />
      <CoverageTable rows={rowsOf(report)} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-3">
        <FactsPanel title={SECRETS_TITLE} facts={report.facts} emptyText={SECRETS_EMPTY} />
        <FactsPanel title={GATES_TITLE} note={GATES_NOTE}>
          <IconList variant="block" items={GATES} />
        </FactsPanel>
      </div>
    </>
  );
}

/** Onglet Exigences (maquette 15 l.187-202). */
export function SecurityRequirementsTab({ page }: { page: SecurityPageModel }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-7 md:px-7">
      <SecurityRead query={page.totals.asvs}>
        {(report) => <Report page={page} report={report as SecurityAsvsReport} />}
      </SecurityRead>
    </div>
  );
}
