import { describe, it } from "vitest";
import type { ClaudeCodeRuntime } from "../../src/claude-code/index.ts";
import {
  type AgentConformanceSubject,
  runAgentRuntimeConformance,
} from "../../src/testing/index.ts";
import { SECRET_KEY } from "../agent-helpers.ts";
import { FAKE_CLAUDE, launches, makeRuntime, makeSandbox, script } from "./support.ts";

/** La suite du lot 1 fixe worktree `/work/conformance` et un delai de 600 s : le sujet les ramene
 * au sandbox reel, sans toucher aux requetes invalides (refus de la garde). Le delai n'est raccourci
 * QUE pour le scenario qui doit expirer (`hang`) : ailleurs un minuteur court, parti avant que Node
 * ait demarre sur un runner charge, transformerait `failed`/`quota`/`completed` en `timeout`. */
const CONFORMANCE_WORKTREE = "/work/conformance";
const CONFORMANCE_TIMEOUT_MS = 600_000;
const SHORT_TIMEOUT_MS = 800;

const subject = (): AgentConformanceSubject => {
  const sandbox = makeSandbox();
  let executable = FAKE_CLAUDE;
  let expiring = false;
  const inner = (): ClaudeCodeRuntime => makeRuntime(sandbox, { executable });
  return {
    validKey: SECRET_KEY,
    runtime: {
      id: "claude-code",
      launchSession: (request) =>
        inner().launchSession({
          ...request,
          worktree: request.worktree === CONFORMANCE_WORKTREE ? sandbox.worktree : request.worktree,
          budget:
            expiring && request.budget?.timeoutMs === CONFORMANCE_TIMEOUT_MS
              ? { ...request.budget, timeoutMs: SHORT_TIMEOUT_MS }
              : request.budget,
        }),
    },
    replyWith: (output) => script(sandbox, { scenario: "completed", text: output }),
    trigger: (kind, output = "sortie brute") => {
      const scenarios = {
        failed: { scenario: "failed", text: output },
        timeout: { scenario: "hang", text: output },
        quota: { scenario: "quota", text: `${output}\nWeekly limit reached ∙ resets Mon 9am` },
        auth: { scenario: "auth" },
        unavailable: { scenario: "completed" },
      } as const;
      expiring = kind === "timeout";
      script(sandbox, scenarios[kind]);
      if (kind === "unavailable") {
        executable = `${sandbox.root}/absent/claude`;
      }
    },
    hangUntilAborted: () => script(sandbox, { scenario: "hang" }),
    launchesMade: () => launches(sandbox),
  };
};

// Le vrai CLI n'est jamais lance : l'executable est le faux scripte (test/fixtures/fake-claude.mjs).
runAgentRuntimeConformance("ClaudeCodeRuntime (faux executable)", subject, { describe, it });
