"use client";

import type { AiProviderItemOutput } from "@koklo/contract";
import { Button, cn, Icon, type IconName } from "@koklo/ui";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { providerInitials, providerName } from "../lib/ai-provider-names.ts";
import { AI_SETTINGS_LABELS as L, longDate, roleWord } from "../lib/ai-settings-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { attempt, useRefreshAi } from "../lib/use-ai-providers.ts";
import { AiInlineConfirm } from "./ai-inline-confirm.tsx";
import { ProviderKeyForm } from "./ai-provider-key.tsx";

type Item = AiProviderItemOutput;
type Panel = "replace" | "remove" | "primary";

interface RowProps {
  item: Item;
  primaryName: string | null;
  hasModels: boolean;
  announce: (message: string) => void;
}

const STATUS: Record<
  Item["status"],
  { icon: IconName; text: (item: Item) => string; word: string; pill: string }
> = {
  verified: {
    icon: "check_circle",
    text: (item) => (item.lastUsedAt ? `Clé vérifiée le ${longDate(item.lastUsedAt)}` : ""),
    word: "vérifiée",
    pill: "Vérifiée",
  },
  unverified: { icon: "schedule", text: () => "", word: "non vérifiée", pill: L.unverified },
  invalid: { icon: "error", text: () => "", word: "refusée", pill: L.invalid },
};

/** « Fournisseur Anthropic, principal, vérifiée » : nom accessible de la ligne. */
const rowName = (item: Item): string =>
  [`Fournisseur ${providerName(item.provider)}`, roleWord(item.role), STATUS[item.status].word]
    .filter(Boolean)
    .join(", ");

const PILL = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";

function Pills({ item }: { item: Item }) {
  const status = STATUS[item.status];
  return (
    <>
      {item.role === "primary" ? (
        <span className={cn(PILL, "border-transparent bg-primary text-primary-foreground")}>
          {L.primary}
        </span>
      ) : null}
      {item.role === "fallback" ? (
        <span className={cn(PILL, "border-border bg-secondary text-secondary-foreground")}>
          {L.fallback}
        </span>
      ) : null}
      <span
        className={cn(
          PILL,
          "gap-1",
          item.status === "invalid"
            ? "border-destructive text-destructive"
            : "border-border bg-secondary text-secondary-foreground",
        )}
      >
        <Icon name={status.icon} size={16} fill />
        {status.pill}
      </span>
      {item.intermediary ? (
        <span
          className={cn(
            PILL,
            "gap-1",
            "border-alert-warning-border bg-alert-warning text-alert-warning-foreground",
          )}
        >
          <Icon name="call_split" size={16} />
          {L.intermediary}
        </span>
      ) : null}
    </>
  );
}

function Identity({ item }: { item: Item }) {
  const status = STATUS[item.status];
  return (
    <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary-foreground"
      >
        {providerInitials(item.provider)}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{providerName(item.provider)}</span>
          <Pills item={item} />
        </div>
        {status.text(item) ? (
          <p className="text-meta text-muted-foreground">{status.text(item)}</p>
        ) : null}
        {item.intermediary ? (
          <p className="text-meta text-muted-foreground">{L.intermediaryNote}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Actions d'une ligne : boutons visibles (pas de menu), 44 px sous 768 px ; le principal n'est ni retiré ni re-promu. */
function Actions({
  item,
  busy,
  open,
  onVerify,
}: {
  item: Item;
  busy: boolean;
  open: (panel: Panel) => void;
  onVerify: () => void;
}) {
  const name = providerName(item.provider);
  const style = "h-11 w-full md:h-9 md:w-auto";
  const act = (
    action: string,
    label: string,
    onClick: () => void,
    variant: "outline" | "default" = "outline",
  ) => (
    <Button
      key={action}
      type="button"
      variant={variant}
      data-action={action}
      aria-label={`${label} ${name}`}
      disabled={busy}
      className={style}
      onClick={onClick}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-end">
      {item.role === "primary" ? null : act("primary", L.setPrimary, () => open("primary"))}
      {act("verify", L.verify, onVerify)}
      {act(
        "replace",
        L.replace,
        () => open("replace"),
        item.status === "invalid" ? "default" : "outline",
      )}
      {item.role === "primary" ? null : act("remove", L.remove, () => open("remove"))}
    </div>
  );
}

function usePanelFocus(panel: Panel | null) {
  const row = useRef<HTMLLIElement>(null);
  const last = useRef<Panel | null>(null);
  useEffect(() => {
    if (panel !== null) {
      last.current = panel;
      return;
    }
    if (last.current)
      row.current?.querySelector<HTMLElement>(`[data-action="${last.current}"]`)?.focus();
    last.current = null;
  }, [panel]);
  return row;
}

/** Écritures d'une ligne (vérifier, retirer, promouvoir) : relecture de l'écran, annonce, échec local. */
function useRowWrites(item: Item, announce: (message: string) => void, close: () => void) {
  const [failed, setFailed] = useState(false);
  const refresh = useRefreshAi();
  const verify = useMutation(orpc.aiProvider.verify.mutationOptions({ gcTime: 0 }));
  const remove = useMutation(orpc.aiProvider.remove.mutationOptions({ gcTime: 0 }));
  const primary = useMutation(orpc.aiProvider.setPrimary.mutationOptions({ gcTime: 0 }));
  const input = { provider: item.provider };

  async function run(call: () => Promise<unknown>, done: string, reset: () => void) {
    setFailed(false);
    const result = await attempt(call, reset);
    if (!result.ok) return setFailed(true);
    await refresh();
    close();
    announce(done);
  }
  return {
    failed,
    busy: verify.isPending || remove.isPending || primary.isPending,
    onVerify: () => run(() => verify.mutateAsync(input), L.verified, verify.reset),
    onRemove: () => run(() => remove.mutateAsync(input), L.removed, remove.reset),
    onPrimary: () => run(() => primary.mutateAsync(input), L.madePrimary, primary.reset),
  };
}

function ProviderRow({ item, primaryName, hasModels, announce }: RowProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const row = usePanelFocus(panel);
  const close = () => setPanel(null);
  const writes = useRowWrites(item, announce, close);
  const name = providerName(item.provider);
  const becomes = primaryName
    ? `${name} devient principal, ${primaryName} passe en secours.`
    : `${name} devient principal.`;

  return (
    <li
      ref={row}
      aria-label={rowName(item)}
      className="flex flex-col gap-3 rounded-lg border bg-surface p-3 md:p-3.5"
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
        <Identity item={item} />
        {panel === null ? (
          <Actions item={item} busy={writes.busy} open={setPanel} onVerify={writes.onVerify} />
        ) : null}
      </div>
      {writes.failed ? (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <Icon name="error" size={16} />
          {L.writeFailed}
        </p>
      ) : null}
      {panel === "replace" ? (
        <ProviderKeyForm
          provider={item.provider}
          mode="replace"
          hasModels={hasModels}
          onDone={close}
          onCancel={close}
          announce={announce}
        />
      ) : null}
      {panel === "remove" ? (
        <AiInlineConfirm
          groupLabel={L.confirmRemovalGroup}
          text={L.confirmRemoval}
          keepLabel={L.keep}
          confirmLabel={L.remove}
          destructive
          busy={writes.busy}
          onKeep={close}
          onConfirm={writes.onRemove}
        />
      ) : null}
      {panel === "primary" ? (
        <AiInlineConfirm
          groupLabel={L.confirmPrimaryGroup}
          text={becomes}
          keepLabel={L.cancel}
          confirmLabel={L.confirm}
          busy={writes.busy}
          onKeep={close}
          onConfirm={writes.onPrimary}
        />
      ) : null}
    </li>
  );
}

/** Liste des fournisseurs ajoutés (`aiProvider.list`) : une ligne par fournisseur, jamais la clé. */
export function AiProvidersList({
  items,
  withModels,
  announce,
}: {
  items: Item[];
  withModels: ReadonlySet<Item["provider"]>;
  announce: (message: string) => void;
}) {
  const primaryName = items.find((item) => item.role === "primary");
  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {items.map((item) => (
        <ProviderRow
          key={item.provider}
          item={item}
          primaryName={primaryName ? providerName(primaryName.provider) : null}
          hasModels={withModels.has(item.provider)}
          announce={announce}
        />
      ))}
    </ul>
  );
}
