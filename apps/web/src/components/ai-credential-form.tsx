import { llmCredentialSetInputSchema } from "@koklo/contract";
import { Button, Icon } from "@koklo/ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AI_SETTINGS_LABELS as L } from "../lib/ai-settings-labels.ts";
import { BUTTON_CLASS } from "../lib/ai-settings-styles.ts";
import type { SaveResult, SetInput } from "../lib/use-ai-credential-session.ts";
import { AiCredentialAdvanced } from "./ai-credential-advanced.tsx";
import { FormField } from "./form-field.tsx";

interface Props {
  /** Un envoi est en cours (`saving`) ou la vérification suit (`verifying`). */
  phase: "idle" | "saving" | "verifying" | "removing";
  /** La limite de vérifications est atteinte : l'envoi reste inactif jusqu'à l'échéance. */
  waiting: boolean;
  onSave: (input: SetInput) => Promise<SaveResult>;
  /** Remplacement d'une clé existante : « Annuler » referme le formulaire. */
  onCancel: (() => void) | undefined;
  /** Change à chaque demande de focus dans le champ (ouverture, retrait confirmé). */
  focusSignal: number;
}

interface FieldErrors {
  apiKey?: string;
  defaultModel?: string;
}

/**
 * Lit la saisie du champ non contrôlé puis le vide, dans un `finally` : la clé n'est jamais dans l'état React,
 * ni dans le DOM pendant l'appel, ni après une issue (succès, refus, réseau). Elle ne vit que dans la valeur renvoyée.
 */
function takeSecret(field: HTMLInputElement | null): string {
  if (!field) return "";
  try {
    return field.value.trim();
  } finally {
    field.value = "";
  }
}

/** Validation locale par le schéma du contrat : message générique, jamais la valeur ni sa longueur. */
function validate(apiKey: string, model: string) {
  if (apiKey === "") return { errors: { apiKey: L.emptyKey } satisfies FieldErrors };
  const defaultModel = model.trim();
  const parsed = llmCredentialSetInputSchema.safeParse({
    provider: "anthropic",
    apiKey,
    ...(defaultModel === "" ? {} : { defaultModel }),
  });
  if (parsed.success) return { input: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === "defaultModel") errors.defaultModel = L.invalidModel;
    else errors.apiKey = L.invalidKey;
  }
  return { errors };
}

const submitLabel = (phase: Props["phase"]): string => {
  if (phase === "saving") return L.saving;
  return phase === "verifying" ? L.verifyingShort : L.saveAndVerify;
};

function SubmitRow({
  phase,
  disabled,
  onCancel,
}: {
  phase: Props["phase"];
  disabled: boolean;
  onCancel: (() => void) | undefined;
}) {
  const busy = phase === "saving" || phase === "verifying";
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <Button
        type="submit"
        disabled={busy || disabled}
        aria-busy={busy || undefined}
        className={BUTTON_CLASS}
      >
        <Icon name="add" size={20} />
        {submitLabel(phase)}
      </Button>
      {onCancel ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className={BUTTON_CLASS}
          onClick={onCancel}
        >
          {L.cancel}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Formulaire de la clé (S-ai-settings §4.2, §4.10) : champ `password` NON contrôlé, sans valeur initiale ni bouton
 * « afficher ». `method="post"` intercepté : la clé ne peut pas partir dans l'URL.
 */
export function AiCredentialForm({ phase, waiting, onSave, onCancel, focusSignal }: Props) {
  const keyRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [model, setModel] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const busy = phase === "saving" || phase === "verifying";

  useEffect(() => {
    if (focusSignal > 0) keyRef.current?.focus();
  }, [focusSignal]);

  const reject = (next: FieldErrors) => {
    setErrors(next);
    const modelField = formRef.current?.elements.namedItem("llm-model");
    const target =
      next.apiKey || !(modelField instanceof HTMLElement) ? keyRef.current : modelField;
    target?.focus();
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || waiting) return;
    const checked = validate(takeSecret(keyRef.current), model);
    if (!checked.input) return reject(checked.errors ?? {});
    setErrors({});
    if ((await onSave(checked.input)) === "invalid") reject({ apiKey: L.invalidKey });
  }

  return (
    <form
      ref={formRef}
      method="post"
      onSubmit={submit}
      noValidate
      className="flex min-w-0 flex-col gap-4"
    >
      <FormField
        ref={keyRef}
        label={L.keyLabel}
        hint={L.keyHint}
        error={errors.apiKey}
        type="password"
        name="llm-secret"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={512}
        data-1p-ignore
        data-lpignore="true"
      />
      <AiCredentialAdvanced model={model} onModel={setModel} error={errors.defaultModel} />
      <SubmitRow phase={phase} disabled={waiting} onCancel={onCancel} />
      <p className="text-[13px] text-muted-foreground">{L.quotaNote}</p>
    </form>
  );
}
