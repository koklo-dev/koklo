"use client";

import type { AiProviderItemOutput } from "@koklo/contract";
import { cn } from "@koklo/ui";
import { useMutation } from "@tanstack/react-query";
import { providerName } from "../lib/ai-provider-names.ts";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { attempt, useAiSettings, useRefreshAi } from "../lib/use-ai-providers.ts";
import { AiQueryBoundary } from "./ai-query-boundary.tsx";

type Item = AiProviderItemOutput;

function fallbackText(enabled: boolean, primary?: Item, fallback?: Item): string {
  if (!enabled || !primary || !fallback) return L.fallbackOff;
  return `Si ${providerName(primary.provider)} répond en erreur ou atteint sa limite, la demande repart chez ${providerName(fallback.provider)}.`;
}

function Switch({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby="ai-fallback-title"
      aria-describedby="ai-fallback-text"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-11 w-14 shrink-0 items-center rounded-full border md:h-7 md:w-12",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-[0.5]",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute size-5 rounded-full bg-background shadow motion-safe:transition-transform",
          checked ? "translate-x-7 md:translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

/**
 * Secours (S-ai-settings §3) : `role="switch"` au texte dynamique, désactivé sous deux fournisseurs ; au-delà de
 * deux, le choix du fournisseur de secours (B124).
 */
export function AiFallbackSwitch({
  items,
  announce,
}: {
  items: Item[];
  announce: (message: string) => void;
}) {
  const settings = useAiSettings();
  const update = useMutation(orpc.aiSettings.update.mutationOptions({ gcTime: 0 }));
  const refresh = useRefreshAi();
  const primary = items.find((item) => item.role === "primary");
  const fallback = items.find((item) => item.role === "fallback");
  const others = items.filter((item) => item.role !== "primary");

  async function write(input: { fallbackEnabled: boolean } | { fallback: Item["provider"] }) {
    const result = await attempt(() => update.mutateAsync(input), update.reset);
    if (!result.ok) return announce(L.writeFailed);
    await refresh();
  }
  return (
    <AiQueryBoundary query={settings} loading={L.loadingList} failed={L.loadFailedTitle}>
      {(data) => {
        const enabled = data.fallbackEnabled && items.length >= 2;
        return (
          <div className="flex flex-col gap-3 border-t bg-surface px-4 py-3.5 md:px-5">
            <div className="flex items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id="ai-fallback-title" className="text-sm font-semibold">
                  {L.fallbackTitle}
                </span>
                <p id="ai-fallback-text" className="break-words text-sm text-muted-foreground">
                  {items.length < 2 ? L.fallbackNeedsTwo : fallbackText(enabled, primary, fallback)}
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={items.length < 2 || update.isPending}
                onToggle={() => write({ fallbackEnabled: !enabled })}
              />
            </div>
            {others.length > 1 ? (
              <label className="flex max-w-md flex-col gap-1.5 text-sm font-medium">
                {L.fallbackSelect}
                <select
                  value={fallback?.provider ?? ""}
                  onChange={(event) => write({ fallback: event.target.value as Item["provider"] })}
                  className="h-11 rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
                >
                  {others.map((item) => (
                    <option key={item.provider} value={item.provider}>
                      {providerName(item.provider)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        );
      }}
    </AiQueryBoundary>
  );
}
