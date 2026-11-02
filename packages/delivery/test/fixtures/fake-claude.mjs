#!/usr/bin/env node
// Faux executable `claude` pour les tests (le vrai CLI n'est JAMAIS lance en CI).
// Configuration : variable FAKE_CLAUDE_DIR (non secrete) -> <dir>/scenario.json
//   { scenario, text, channel: "stderr" | "result", size, startDelayMs }
// Traces ecrites dans <dir> : argv.json, env.json, cwd.txt, stdin.txt, pid.txt,
// grandchild.pid, launches.log (une ligne par lancement).
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_CLAUDE_DIR;
const config = JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8"));
const { scenario, text = "ok", channel = "result", size = 0, startDelayMs = 0 } = config;
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const result = (isError, body) =>
  emit({
    type: "result",
    subtype: isError ? "error_during_execution" : "success",
    is_error: isError,
    result: body,
    total_cost_usd: 0.0123,
    duration_ms: 5,
    session_id: "fake-session",
  });

appendFileSync(join(dir, "launches.log"), "launch\n");
writeFileSync(join(dir, "argv.json"), JSON.stringify(process.argv.slice(2)));
writeFileSync(join(dir, "env.json"), JSON.stringify(process.env));
writeFileSync(join(dir, "cwd.txt"), process.cwd());
writeFileSync(join(dir, "pid.txt"), String(process.pid));

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});

const withGrandchild = (stubborn) => {
  const code = `${stubborn ? "process.on('SIGTERM',()=>{});" : ""}setInterval(()=>{},1000)`;
  const child = spawn(process.execPath, ["-e", code], { stdio: "ignore" });
  writeFileSync(join(dir, "grandchild.pid"), String(child.pid));
};

// `ready.txt` : tout ce qui precede est ecrit ET vide dans le pipe (jamais devine par un delai).
const markReady = () => process.stdout.write("", () => writeFileSync(join(dir, "ready.txt"), "ready"));

const hang = (stubborn) => {
  if (stubborn) process.on("SIGTERM", () => {});
  withGrandchild(stubborn);
  emit({ type: "assistant", message: { content: [{ type: "text", text }] } });
  markReady();
  setInterval(() => {}, 1000);
};

// Petit-fils qui garde stdout ouvert : dans le groupe (`lingering`) ou hors du groupe via setsid (`escape`).
const holdStdout = (command, args) => {
  const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
  writeFileSync(join(dir, "grandchild.pid"), String(child.pid));
  child.unref();
};

const flood = () => {
  const line = `${"x".repeat(65_535)}\n`;
  const pump = () => {
    while (process.stdout.write(line)) {}
    process.stdout.once("drain", pump);
  };
  process.stdout.on("error", () => process.exit(0));
  pump();
};

const fail = (message, code) => {
  if (channel === "stderr") process.stderr.write(`${message}\n`);
  else result(true, message);
  process.exitCode = code;
};

const SCENARIOS = {
  completed: () => {
    process.stdout.write("this line is not json\n");
    emit({ type: "system", subtype: "init", session_id: "fake-session" });
    emit({ type: "assistant", message: { content: [{ type: "text", text }] } });
    result(false, text);
  },
  big: () => result(false, "x".repeat(size)),
  failed: () => fail(text, 1),
  quota: () => fail(text, 1),
  auth: () => fail("Invalid API key · Please run /login", 1),
  crash: () => {
    process.stderr.write("fatal: unexpected crash\n");
    process.exitCode = 2;
  },
  leak: () => {
    const leaked = `${text} sk-ant-api03-LEAKEDSECRET0123456789 ghp_LEAKEDGITHUBTOKEN0123456789abcd Bearer abc.def-LEAKED`;
    process.stderr.write(`${leaked}\n`);
    result(false, leaked);
  },
  lingering: () => {
    holdStdout("sleep", ["120"]);
    emit({ type: "assistant", message: { content: [{ type: "text", text }] } });
    result(false, text);
  },
  escape: () => {
    holdStdout("setsid", ["sleep", "120"]);
    emit({ type: "assistant", message: { content: [{ type: "text", text }] } });
    markReady();
    setInterval(() => {}, 1000);
  },
  hang: () => hang(false),
  "hang-stubborn": () => hang(true),
  flood,
};

const run = SCENARIOS[scenario];
if (run === undefined) {
  process.stderr.write(`scenario inconnu\n`);
  process.exit(3);
}
process.stdin.on("end", () => {
  writeFileSync(join(dir, "stdin.txt"), stdin);
  setTimeout(run, startDelayMs);
});
process.stdin.resume();
