"use client";

import type { AiProviderItemOutput } from "@koklo/contract";
import { Alert, Button, Icon, Input, Label } from "@koklo/ui";
import { useMutation } from "@tanstack/react-query";
import {
  type ComponentProps,
  cloneElement,
  type FormEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { keyFailureMessage } from "../lib/ai-provider-errors.ts";
import { providerName } from "../lib/ai-provider-names.ts";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { attempt, useRefreshAi } from "../lib/use-ai-providers.ts";

type Provider = AiProviderItemOutput["provider"];
export type KeyMode = "add" | "replace";

interface Props {
  provider: Provider;
  mode: KeyMode;
  /** Un modèle qualifié existe pour ce fournisseur : « Modèle à utiliser » n'est alors pas demandé (B123). */
  hasModels: boolean;
  onDone: () => void;
  onCancel: () => void;
  announce: (message: string) => void;
}

interface Refs {
  key: RefObject<HTMLInputElement | null>;
  baseUrl: RefObject<HTMLInputElement | null>;
  model: RefObject<HTMLInputElement | null>;
}

type Read = { input: Record<string, string> } | { error: string };

/** Lit les champs (non contrôlés) et valide ce qui peut l'être sans le serveur. */
function readFields(refs: Refs, needsBaseUrl: boolean, needsModel: boolean): Read {
  const apiKey = refs.key.current?.value ?? "";
  const baseUrl = refs.baseUrl.current?.value.trim() ?? "";
  const model = refs.model.current?.value.trim() ?? "";
  if (apiKey === "") return { error: L.emptyKey };
  if (needsBaseUrl && baseUrl === "") return { error: L.emptyBaseUrl };
  if (needsModel && model === "") return { error: L.emptyModel };
  return {
    input: { apiKey, ...(needsBaseUrl ? { baseUrl } : {}), ...(needsModel ? { model } : {}) },
  };
}

/** Champ libellé avec aide : l'`Input` reçoit l'id, la description, `autocomplete=off` et la taille tactile. */
function TextField({
  id,
  label,
  hint,
  busy,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  busy: boolean;
  children: ReactElement<ComponentProps<typeof Input>>;
}) {
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        autoComplete: "off",
        "aria-describedby": `${id}-hint`,
        disabled: busy,
        className: "h-11 md:h-9",
      })}
      <p id={`${id}-hint`} className="text-meta text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

const ERROR_ID = "ai-key-error";

/**
 * Envoi de la clé (ajout ou remplacement, S-ai-settings §5) : la clé est lue dans un champ non contrôlé, envoyée
 * une fois, puis vidée après succès ET après échec ; la mutation est réinitialisée (jamais gardée en cache). Le
 * serveur teste la clé AVANT toute écriture ; en cas d'échec rien n'est enregistré et le focus va à l'alerte.
 */
function useKeySubmit(props: Props, refs: Refs, needsBaseUrl: boolean, needsModel: boolean) {
  const { provider, mode, onDone, announce } = props;
  const add = useMutation(orpc.aiProvider.add.mutationOptions({ gcTime: 0 }));
  const replace = useMutation(orpc.aiProvider.replaceKey.mutationOptions({ gcTime: 0 }));
  const refresh = useRefreshAi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) document.getElementById(ERROR_ID)?.focus();
  }, [error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const read = readFields(refs, needsBaseUrl, needsModel);
    if ("error" in read) return setError(read.error);
    setError(null);
    setBusy(true);
    const send = mode === "add" ? add : replace;
    const result = await attempt(
      () => send.mutateAsync({ provider, ...read.input } as never),
      () => {
        add.reset();
        replace.reset();
      },
    );
    if (refs.key.current) refs.key.current.value = "";
    setBusy(false);
    if (!result.ok) return setError(keyFailureMessage(result.error));
    await refresh();
    announce(mode === "add" ? L.added : L.replaced);
    onDone();
  }
  return { busy, error, submit };
}

/** Formulaire de clé : champs non contrôlés (clé, adresse, modèle), alerte d'échec, boutons 44 px sous 768 px. */
export function ProviderKeyForm(props: Props) {
  const { provider, mode, hasModels, onCancel } = props;
  const refs: Refs = { key: useRef(null), baseUrl: useRef(null), model: useRef(null) };
  const needsBaseUrl = provider === "openai_compatible";
  const needsModel = !hasModels;
  const { busy, error, submit } = useKeySubmit(props, refs, needsBaseUrl, needsModel);

  return (
    <form onSubmit={submit} noValidate aria-busy={busy} className="flex flex-col gap-4">
      <TextField id="ai-key" label={`Clé ${providerName(provider)}`} hint={L.keyHint} busy={busy}>
        <Input
          ref={refs.key}
          type="password"
          maxLength={512}
          spellCheck={false}
          placeholder={L.keyPlaceholder}
        />
      </TextField>
      {needsBaseUrl ? (
        <TextField id="ai-base-url" label={L.baseUrlLabel} hint={L.baseUrlHint} busy={busy}>
          <Input ref={refs.baseUrl} type="text" inputMode="url" />
        </TextField>
      ) : null}
      {needsModel ? (
        <TextField id="ai-model" label={L.modelLabel} hint={L.modelHint} busy={busy}>
          <Input ref={refs.model} type="text" />
        </TextField>
      ) : null}
      {error ? (
        <Alert variant="destructive" id={ERROR_ID} tabIndex={-1} className="max-w-md outline-none">
          <Icon name="error" size={20} />
          <p>{error}</p>
        </Alert>
      ) : null}
      {busy ? <p className="sr-only">{L.testingStatus}</p> : null}
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          type="submit"
          aria-busy={busy}
          disabled={busy}
          className="h-11 w-full md:h-9 md:w-auto"
        >
          {busy ? L.testing : mode === "add" ? L.submitAdd : L.submitReplace}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="h-11 w-full md:h-9 md:w-auto"
          onClick={onCancel}
        >
          {L.cancel}
        </Button>
      </div>
    </form>
  );
}
