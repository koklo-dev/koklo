import { isValidated } from "../llm-output.ts";
import { LlmAbortedError } from "../llm-provider-errors.ts";
import type { LlmRequest } from "../llm-request.ts";
import type { LlmConformanceSubject, LlmFailureTrigger } from "./llm-conformance.ts";

/** Échec d'un cas de conformité (le domaine n'a pas de bibliothèque d'assertion). */
export class LlmConformanceFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConformanceFailure";
  }
}

export const check = (ok: boolean, message: string): void => {
  if (!ok) throw new LlmConformanceFailure(message);
};

/** L'erreur levée par l'appel, ou un échec de conformité si l'appel réussit. */
export const rejection = async (call: Promise<unknown>): Promise<unknown> => {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new LlmConformanceFailure("l'appel aurait dû être rejeté");
};

export const expectRejection = async <T extends Error>(
  call: Promise<unknown>,
  type: new (...args: never[]) => T,
  label: string,
): Promise<T> => {
  const error = await rejection(call);
  check(error instanceof type, `${label} : erreur typée attendue (${type.name})`);
  return error as T;
};

/**
 * Renforcement de la suite de conformité (TK-54a, non bloquants de la review 50c). Les capacités
 * du sujet sont FACULTATIVES : un sujet qui ne les fournit pas (le faux) passe les cas qui en
 * dépendent sans les exercer.
 */
export interface LlmConformanceHardeningSubject {
  /** Le prochain appel reste en attente jusqu'à l'annulation de son signal (transport bloqué). */
  hangNext?(): void | Promise<void>;
  /** Lignes écrites par le sujet (console, journal) depuis sa création ; jamais de secret. */
  capturedLogs?(): readonly string[];
}

export const LLM_CONFORMANCE_HARDENING_CASE_NAMES = [
  "rejects with LlmAbortedError when aborted during the call",
  "makes at most one provider call per complete, even on failure",
  "carries no cause and no secret in any property of its errors",
  "writes no secret to its logs",
  "returns text output as unvalidated, never validated",
] as const;

type Body = (subject: LlmConformanceSubject) => Promise<void>;

/** Outils de la suite principale, passés en paramètre (évite l'import circulaire). */
export interface LlmConformanceKit {
  readonly triggers: readonly LlmFailureTrigger[];
  /** Chaînes qui ne doivent apparaître nulle part : clés et sentinelle du prompt. */
  readonly secrets: (subject: LlmConformanceSubject) => readonly string[];
  requestFor(subject: LlmConformanceSubject, overrides?: Partial<LlmRequest>): LlmRequest;
}

/** Délai de grâce après l'annulation : un appel qui l'ignore reste en attente au-delà. */
const ABORT_GRACE_MS = 1_000;

const graceElapsed = (): Promise<"grace"> =>
  new Promise((resolve) => {
    AbortSignal.timeout(ABORT_GRACE_MS).addEventListener("abort", () => resolve("grace"), {
      once: true,
    });
  });

/** Chaînes (clés de propriété comprises) de toutes les propriétés propres, non énumérables incluses. */
const strings = (value: unknown, seen = new Set<unknown>()): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  return Reflect.ownKeys(value).flatMap((key) => [
    String(key),
    ...strings(Object.getOwnPropertyDescriptor(value, key)?.value, seen),
  ]);
};

const failures = async (
  kit: LlmConformanceKit,
  subject: LlmConformanceSubject,
): Promise<unknown[]> => {
  const errors: unknown[] = [];
  for (const trigger of kit.triggers) {
    await subject.failWith(trigger);
    errors.push(await rejection(subject.provider.complete(kit.requestFor(subject))));
  }
  return errors;
};

const abortedDuringCall =
  (kit: LlmConformanceKit): Body =>
  async (subject) => {
    if (subject.hangNext === undefined) return;
    const before = subject.callsMade();
    await subject.hangNext();
    const controller = new AbortController();
    const request = kit.requestFor(subject, { signal: controller.signal });
    const call = rejection(subject.provider.complete(request));
    controller.abort();
    const outcome = await Promise.race([call, graceElapsed()]);
    check(outcome !== "grace", "l'appel ignore l'annulation (toujours en attente)");
    check(
      outcome instanceof LlmAbortedError,
      "annulation en cours d'appel : LlmAbortedError attendue",
    );
    check(
      subject.callsMade() - before === 1,
      "l'appel annulé doit atteindre le fournisseur une fois",
    );
  };

const singleCall =
  (kit: LlmConformanceKit): Body =>
  async (subject) => {
    await subject.replyWith("ok");
    const before = subject.callsMade();
    await subject.provider.complete(kit.requestFor(subject));
    check(subject.callsMade() - before <= 1, "un complete réussi fait plusieurs appels");
    for (const trigger of kit.triggers) {
      const mark = subject.callsMade();
      await subject.failWith(trigger);
      await rejection(subject.provider.complete(kit.requestFor(subject)));
      check(
        subject.callsMade() - mark <= 1,
        `${trigger} : un complete en échec fait plusieurs appels`,
      );
    }
  };

const noCauseNoSecret =
  (kit: LlmConformanceKit): Body =>
  async (subject) => {
    const errors = await failures(kit, subject);
    for (const error of errors) {
      check(!Reflect.ownKeys(error as object).includes("cause"), "l'erreur porte une cause");
      const text = strings(error).join("\n");
      for (const secret of kit.secrets(subject)) {
        check(!text.includes(secret), "une propriété de l'erreur divulgue une donnée sensible");
      }
    }
  };

const noSecretInLogs =
  (kit: LlmConformanceKit): Body =>
  async (subject) => {
    if (subject.capturedLogs === undefined) return;
    await subject.replyWith("ok");
    await subject.provider.complete(kit.requestFor(subject));
    await failures(kit, subject);
    const written = subject.capturedLogs().join("\n");
    for (const secret of kit.secrets(subject)) {
      check(!written.includes(secret), "le sujet écrit une donnée sensible dans ses journaux");
    }
  };

const textNotValidated =
  (kit: LlmConformanceKit): Body =>
  async (subject) => {
    await subject.replyWith("texte");
    const { output } = await subject.provider.complete(kit.requestFor(subject));
    check(!isValidated(output), "une sortie texte de fournisseur n'est jamais validée");
  };

export const hardeningBodies = (
  kit: LlmConformanceKit,
): Record<(typeof LLM_CONFORMANCE_HARDENING_CASE_NAMES)[number], Body> => ({
  "rejects with LlmAbortedError when aborted during the call": abortedDuringCall(kit),
  "makes at most one provider call per complete, even on failure": singleCall(kit),
  "carries no cause and no secret in any property of its errors": noCauseNoSecret(kit),
  "writes no secret to its logs": noSecretInLogs(kit),
  "returns text output as unvalidated, never validated": textNotValidated(kit),
});
