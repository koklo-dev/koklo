"use client";

import { Button, Card, CardTitle, Icon, InlineAlert, Input, Label, ProgressBar } from "@koklo/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { AI_COST_EUR_PER_USD, formatEuros, parseCapEuros } from "../lib/ai-cost.ts";
import { providerName } from "../lib/ai-provider-names.ts";
import { AI_SETTINGS_LABELS as L, monthLabel } from "../lib/ai-settings-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { attempt, useRefreshAi, useUsageReport } from "../lib/use-ai-providers.ts";
import { AiQueryBoundary } from "./ai-query-boundary.tsx";

type Report = NonNullable<ReturnType<typeof useUsageReport>["data"]>;

const number = (value: number): string => value.toLocaleString("fr-FR");
const TOKENS = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const capText = (microUsd?: number): string =>
  microUsd === undefined
    ? ""
    : String((microUsd / 1_000_000) * AI_COST_EUR_PER_USD).replace(".", ",");

function CapAlert({ state }: { state: Report["capState"] }) {
  if (state === "warning") {
    return (
      <InlineAlert variant="warning" icon="warning">
        {L.capWarning}
      </InlineAlert>
    );
  }
  if (state === "suspended") {
    return (
      <InlineAlert variant="error" icon="block">
        {L.capSuspended}
      </InlineAlert>
    );
  }
  return null;
}

function Bars({ report }: { report: Report }) {
  if (report.providers.length === 0) return <p className="text-meta">{L.noConsumption}</p>;
  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {report.providers.map((entry) => {
        const share =
          report.totalCostMicroUsd > 0 ? (entry.costMicroUsd / report.totalCostMicroUsd) * 100 : 0;
        const name = providerName(entry.provider);
        return (
          <li key={entry.provider} className="flex flex-col gap-1">
            <div className="flex justify-between gap-2 text-meta">
              <span>{name}</span>
              <span className="text-muted-foreground">
                {TOKENS.format(entry.inputTokens + entry.outputTokens)} · ≈{" "}
                {formatEuros(entry.costMicroUsd)}
              </span>
            </div>
            <ProgressBar
              value={Math.round(share)}
              aria-label={`Part de ${name} dans la consommation`}
            />
          </li>
        );
      })}
    </ul>
  );
}

function CapField({
  text,
  invalid,
  onChange,
}: {
  text: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="ai-cap">{L.capLabel}</Label>
      <Input
        id="ai-cap"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={invalid}
        aria-describedby={invalid ? "ai-cap-error" : "ai-cap-hint"}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 md:h-9"
      />
      <p id="ai-cap-hint" className="text-meta text-muted-foreground">
        {L.capHint}
      </p>
      {invalid ? (
        <p id="ai-cap-error" className="flex items-center gap-1.5 text-sm text-destructive">
          <Icon name="error" size={16} />
          {L.capInvalid}
        </p>
      ) : null}
    </div>
  );
}

/** Plafond mensuel en euros (A1) : vide retire, 0 et le négatif sont refusés ; envoyé en micro-dollars. */
function CapForm({ report, announce }: { report: Report; announce: (message: string) => void }) {
  const [text, setText] = useState(() => capText(report.monthlyCapMicroUsd));
  const [invalid, setInvalid] = useState(false);
  const update = useMutation(orpc.aiSettings.update.mutationOptions({ gcTime: 0 }));
  const refresh = useRefreshAi();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseCapEuros(text);
    setInvalid(!parsed.ok);
    if (!parsed.ok) return;
    const result = await attempt(
      () => update.mutateAsync({ monthlyCapMicroUsd: parsed.microUsd }),
      update.reset,
    );
    if (!result.ok) return announce(L.writeFailed);
    await refresh();
    announce(L.capSaved);
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <CapField text={text} invalid={invalid} onChange={setText} />
      <Button
        type="submit"
        disabled={update.isPending}
        className="h-11 w-full md:h-9 md:w-auto md:self-start"
      >
        {L.capSave}
      </Button>
    </form>
  );
}

function Totals({ report }: { report: Report }) {
  const input = report.providers.reduce((sum, entry) => sum + entry.inputTokens, 0);
  const output = report.providers.reduce((sum, entry) => sum + entry.outputTokens, 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="whitespace-nowrap text-stat">≈ {formatEuros(report.totalCostMicroUsd)}</p>
        <p className="text-meta text-muted-foreground">
          {number(input)} jetons en entrée · {number(output)} jetons en sortie
        </p>
      </div>
      <p className="text-caption text-muted-foreground">{L.consumptionNote}</p>
    </div>
  );
}

/** Consommation du mois (`aiUsage.report`) et plafond ; les montants sont des estimations en euros (B126). */
export function AiConsumption({ announce }: { announce: (message: string) => void }) {
  const report = useUsageReport();
  return (
    <AiQueryBoundary query={report} loading={L.loadingList} failed={L.loadFailedTitle}>
      {(data) => (
        <Card
          role="region"
          aria-label={`Consommation de ${monthLabel(data.month)}`}
          className="flex flex-col gap-3"
        >
          <CardTitle>{`Consommation de ${monthLabel(data.month)}`}</CardTitle>
          <CapAlert state={data.capState} />
          <Totals report={data} />
          <Bars report={data} />
          <CapForm report={data} announce={announce} />
        </Card>
      )}
    </AiQueryBoundary>
  );
}
