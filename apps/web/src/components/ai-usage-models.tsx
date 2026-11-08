"use client";

import type { AiProviderItemOutput } from "@koklo/contract";
import { Button, Card, CardDescription, CardTitle, Icon, IdTag, OptionChip, Pill } from "@koklo/ui";
import { useMutation } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { providerName } from "../lib/ai-provider-names.ts";
import {
  AI_SETTINGS_LABELS as L,
  USAGE_LABELS,
  USAGE_PURPOSES,
  USAGES,
  type UsageId,
} from "../lib/ai-settings-labels.ts";
import { orpc } from "../lib/orpc.ts";
import {
  attempt,
  useAiSettings,
  useQualifiedModels,
  useRefreshAi,
} from "../lib/use-ai-providers.ts";
import { AiFallbackSwitch } from "./ai-fallback-switch.tsx";
import { AiQueryBoundary } from "./ai-query-boundary.tsx";

type Provider = AiProviderItemOutput["provider"];
interface Choice {
  provider: Provider;
  model: string;
  economy: boolean;
}
interface Current {
  provider?: Provider;
  model?: string;
  isDefault: boolean;
}

const optionKey = (choice: Choice | null) =>
  choice ? `${choice.provider}/${choice.model}` : "default";
const isCurrent = (current: Current, choice: Choice | null) =>
  choice === null
    ? current.isDefault
    : !current.isDefault && current.provider === choice.provider && current.model === choice.model;

/** Option à focaliser pour une flèche, Début ou Fin (circulaire) ; `null` pour toute autre touche. */
function navTarget(key: string, index: number, length: number): number | null {
  const targets: Record<string, number> = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    Home: 0,
    End: length - 1,
  };
  const target = Object.hasOwn(targets, key) ? targets[key] : undefined;
  return target === undefined ? null : (target + length) % length;
}

interface ListboxProps {
  usage: UsageId;
  choices: Choice[];
  current: Current;
  onPick: (choice: Choice | null) => void;
  onClose: () => void;
}

function ModelOption({
  choice,
  selected,
  setRef,
  onPick,
  onKeyDown,
}: {
  choice: Choice | null;
  selected: boolean;
  setRef: (el: HTMLButtonElement | null) => void;
  onPick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <OptionChip
      ref={setRef}
      mono={choice !== null}
      tabIndex={-1}
      selected={selected}
      onSelect={onPick}
      onKeyDown={onKeyDown}
    >
      {choice ? (
        <>
          <span className="text-muted-foreground">{providerName(choice.provider)} ·</span>
          {choice.model}
        </>
      ) : (
        L.defaultModel
      )}
      {choice?.economy ? (
        <Pill size="xs" tone="success">
          {L.economy}
        </Pill>
      ) : null}
    </OptionChip>
  );
}

/** Liste des modèles qualifiés : focus sur l'option choisie, flèches, Début/Fin, Entrée, Échap. */
function ModelListbox({ usage, choices, current, onPick, onClose }: ListboxProps) {
  const options: Array<Choice | null> = [null, ...choices];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Math.max(
    0,
    options.findIndex((choice) => isCurrent(current, choice)),
  );
  useEffect(() => refs.current[selected]?.focus(), [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Escape") {
      event.preventDefault();
      return onClose();
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      return onPick(options[index] ?? null);
    }
    const target = navTarget(event.key, index, options.length);
    if (target === null) return;
    event.preventDefault();
    refs.current[target]?.focus();
  };
  return (
    <div
      role="listbox"
      aria-label={`Modèles pour ${USAGE_LABELS[usage]}`}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((choice, index) => (
        <ModelOption
          key={optionKey(choice)}
          choice={choice}
          selected={isCurrent(current, choice)}
          setRef={(el) => {
            refs.current[index] = el;
          }}
          onPick={() => onPick(choice)}
          onKeyDown={(event) => onKeyDown(event, index)}
        />
      ))}
    </div>
  );
}

interface RowProps {
  usage: UsageId;
  choices: Choice[];
  current: Current;
  announce: (message: string) => void;
}

function UsageHeader({
  usage,
  modelTag,
  open,
  changeRef,
  onToggle,
}: {
  usage: UsageId;
  modelTag: ReactNode;
  open: boolean;
  changeRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  const label = USAGE_LABELS[usage];
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-60 flex-col leading-snug">
        <span className="text-body font-semibold">{label}</span>
        <span className="text-caption text-muted-foreground">{USAGE_PURPOSES[usage]}</span>
      </div>
      {modelTag}
      <Button
        ref={changeRef}
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label={`${L.change} le modèle : ${label}`}
        className="h-11 md:h-8"
        onClick={onToggle}
      >
        {L.change}
        <Icon name="keyboard_arrow_down" size={16} />
      </Button>
    </div>
  );
}

function UsageRow({ usage, choices, current, announce }: RowProps) {
  const [open, setOpen] = useState(false);
  const change = useRef<HTMLButtonElement>(null);
  const set = useMutation(orpc.aiUsage.set.mutationOptions({ gcTime: 0 }));
  const refresh = useRefreshAi();
  const label = USAGE_LABELS[usage];

  const close = () => {
    setOpen(false);
    change.current?.focus();
  };
  async function pick(choice: Choice | null) {
    const input = choice
      ? { usage, provider: choice.provider, model: choice.model }
      : { usage, model: null };
    const result = await attempt(() => set.mutateAsync(input), set.reset);
    if (result.ok) {
      await refresh();
      announce(`Modèle de « ${label} » mis à jour.`);
    }
    close();
  }
  const modelTag =
    current.isDefault || !current.provider ? (
      <IdTag variant="pill">{L.defaultModel}</IdTag>
    ) : (
      <IdTag variant="pill" prefix={`${providerName(current.provider)} · `}>
        {current.model}
      </IdTag>
    );
  return (
    <li aria-label={label} className="flex flex-col gap-2 border-t px-[18px] py-3">
      <UsageHeader
        usage={usage}
        modelTag={modelTag}
        open={open}
        changeRef={change}
        onToggle={() => (open ? close() : setOpen(true))}
      />
      {open ? (
        <ModelListbox
          usage={usage}
          choices={choices}
          current={current}
          onPick={pick}
          onClose={close}
        />
      ) : null}
    </li>
  );
}

/**
 * Modèle par usage (`aiSettings.get`, `aiModel.listQualified`) : modèles des seuls fournisseurs à clé valide, en
 * liste à lignes dans une carte dont le pied porte l'interrupteur de secours (maquette 24).
 */
export function AiUsageModels({
  items,
  announce,
}: {
  items: AiProviderItemOutput[];
  announce: (message: string) => void;
}) {
  const settings = useAiSettings();
  const models = useQualifiedModels();
  const usable = new Set(
    items.filter((item) => item.status !== "invalid").map((item) => item.provider),
  );
  return (
    <Card role="region" aria-label={L.usageTitle} className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-col gap-0.5 px-[18px] py-3.5">
        <CardTitle>{L.usageTitle}</CardTitle>
        <CardDescription>{L.usageIntro}</CardDescription>
      </div>
      <AiQueryBoundary query={settings} loading={L.loadingList} failed={L.loadFailedTitle}>
        {(data) => (
          <ul className="m-0 flex list-none flex-col p-0">
            {USAGES.map((usage) => {
              const choices = (models.data?.items ?? [])
                .filter((model) => model.usages.includes(usage) && usable.has(model.provider))
                .map(({ provider, model, economy }) => ({ provider, model, economy }));
              const found = data.usages.find((entry) => entry.usage === usage);
              return (
                <UsageRow
                  key={usage}
                  usage={usage}
                  choices={choices}
                  current={found ?? { isDefault: true }}
                  announce={announce}
                />
              );
            })}
          </ul>
        )}
      </AiQueryBoundary>
      <AiFallbackSwitch items={items} announce={announce} />
    </Card>
  );
}
