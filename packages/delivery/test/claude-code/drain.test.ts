/** Vidange : un octet deja ecrit par le fils mais pas encore lu n'est jamais perdu a la sortie. */
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ child: undefined as unknown }));
vi.mock("node:child_process", () => ({ spawn: () => holder.child }));

const { runProcess } = await import("../../src/claude-code/process.ts");

const fakeChild = () => {
  const child = Object.assign(new EventEmitter(), {
    pid: undefined,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  holder.child = child;
  return child;
};

const options = {
  cwd: "/",
  env: {},
  stdin: "",
  signal: new AbortController().signal,
  timeoutMs: 60_000,
  killGraceMs: 200,
  hardOutputBytes: 1_000_000,
} as const;

const stallMs = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

describe("vidange des pipes a la sortie du fils", () => {
  it("garde la sortie lue apres un blocage de la boucle plus long que la vidange", async () => {
    const child = fakeChild();
    const pending = runProcess({ command: "x", args: [] }, options);
    // Le fils sort ; la boucle est bloquee plus longtemps que DRAIN_MS AVANT de lire le pipe.
    child.once("exit", () => {
      stallMs(120);
      // deux tours : l'octet n'arrive qu'apres le minuteur de vidange, comme un pipe lu en retard
      setImmediate(() =>
        setImmediate(() => {
          child.stdout.write(
            '{"type":"assistant","message":{"content":[{"type":"text","text":"tard"}]}}\n',
          );
        }),
      );
    });
    child.emit("exit", 0);
    const outcome = await pending;
    expect(outcome.stream.assistantTexts).toEqual(["tard"]);
  });
});
