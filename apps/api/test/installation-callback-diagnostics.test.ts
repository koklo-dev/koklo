import { GitProviderError, GitProviderUnavailableError } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callback,
  ENCRYPTION_KEY,
  expectOutcome,
  githubReturn,
  INSTALL_APP,
  installationBench,
  installScene,
  startState,
} from "./helpers/installations.ts";

/**
 * Correctif diagnostic du callback : l'entrée « installation callback failed » dit QUELLE étape a
 * échoué (énumération fermée), le nom de classe de l'erreur, le statut HTTP fautif et un code OAuth
 * public de GitHub (liste blanche) ; rien d'autre : ni code, state, jeton, secret, URL, message, corps.
 */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

const CANARY = "canary-s3cr3t-ghu_CANARY";
const STEPS = [
  "request",
  "consume_state",
  "manager_check",
  "target",
  "exchange_code",
  "list_installations",
  "owner_role",
  "link",
  "audit",
];

type Entry = Record<string, unknown>;

const failures = (lines: string[]): Entry[] =>
  lines
    .map((line) => JSON.parse(line) as Entry)
    .filter((entry) => entry.msg === "installation callback failed");

async function run(prepare: (b: ReturnType<typeof bench>, state: string, login: string) => void) {
  const b = bench();
  const s = await installScene(b);
  const state = await startState(b, s.owner);
  prepare(b, state, s.login);
  const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
  return { b, s, state, res, entries: failures(b.lines) };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("entrée de journal de l'échec du callback", () => {
  it("échange du code refusé par GitHub : step, errorName, status 200 et oauthError public", async () => {
    const { res, entries } = await run((b) =>
      b.harness.failWith(
        "exchangeUserCode",
        new GitProviderError("exchangeUserCode", undefined, {
          status: 200,
          oauthError: "redirect_uri_mismatch",
        }),
      ),
    );
    expectOutcome(res, "provider_error");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      step: "exchange_code",
      errorName: "GitProviderError",
      status: 200,
      oauthError: "redirect_uri_mismatch",
    });
  });

  it("liste des installations en panne GitHub : étape list_installations, sans statut ni oauthError inventés", async () => {
    const { entries } = await run((b) =>
      b.harness.failWith(
        "listUserInstallations",
        new GitProviderUnavailableError({ operation: "listUserInstallations" }),
      ),
    );
    expect(entries[0]).not.toHaveProperty("status");
    expect(entries[0]).toMatchObject({
      step: "list_installations",
      errorName: "GitProviderUnavailableError",
    });
    expect(entries[0]).not.toHaveProperty("oauthError");
  });

  it("lecture du rôle en échec : étape owner_role et statut conservé", async () => {
    const { entries } = await run((b) =>
      b.harness.failWith(
        "getUserOwnerRole",
        new GitProviderError("getUserOwnerRole", undefined, { status: 403 }),
      ),
    );
    expect(entries[0]).toMatchObject({
      step: "owner_role",
      errorName: "GitProviderError",
      status: 403,
    });
  });

  it("liaison en échec (audit de la transaction) : étape link", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    await b.database.query("INSERT INTO audit_fail (action) VALUES ('installation.link')");
    const res = await callback(b.app, s.owner.cookie, githubReturn(s, state));
    expectOutcome(res, "provider_error");
    expect(failures(b.lines)[0]).toMatchObject({ step: "link" });
  });

  it("audit du refus en échec : étape audit, le résultat reste denied", async () => {
    const b = bench();
    const s = await installScene(b);
    const state = await startState(b, s.owner);
    await b.database.query("INSERT INTO audit_fail (action) VALUES ('installation.link_refused')");
    const res = await callback(
      b.app,
      s.owner.cookie,
      githubReturn(s, state, { code: "fake-code-" }),
    );
    expectOutcome(res, "denied");
    expect(failures(b.lines)[0]).toMatchObject({ step: "audit" });
  });

  it("n'écrit que des champs de la liste fermée, avec une étape de l'énumération", async () => {
    const { entries } = await run((b) =>
      b.harness.failWith(
        "exchangeUserCode",
        new GitProviderError("exchangeUserCode", undefined, {
          status: 200,
          oauthError: "access_denied",
        }),
      ),
    );
    const entry = entries[0] ?? {};
    expect(STEPS).toContain(entry.step);
    const allowed = [
      "level",
      "time",
      "pid",
      "hostname",
      "req",
      "reqId",
      "msg",
      "step",
      "errorName",
      "status",
      "oauthError",
    ];
    for (const key of Object.keys(entry)) expect(allowed, key).toContain(key);
  });
});

describe("liste blanche des codes OAuth et absence de fuite", () => {
  it("un code OAuth hors liste blanche est absent de l'entrée", async () => {
    const { entries } = await run((b) =>
      b.harness.failWith(
        "exchangeUserCode",
        Object.assign(new GitProviderError("exchangeUserCode"), {
          status: 200,
          oauthError: CANARY,
        }),
      ),
    );
    expect(entries[0]).toMatchObject({ step: "exchange_code", status: 200 });
    expect(entries[0]).not.toHaveProperty("oauthError");
  });

  it("un statut non entier ou hors 100-599 est absent", async () => {
    const { entries } = await run((b) =>
      b.harness.failWith(
        "exchangeUserCode",
        Object.assign(new GitProviderError("exchangeUserCode"), { status: CANARY }),
      ),
    );
    expect(entries[0]).not.toHaveProperty("status");
  });

  it("canari : ni code, state, jeton, secret, message ni corps dans les journaux ni la réponse", async () => {
    const { b, s, state, res } = await run((bench_, st, login) =>
      bench_.harness.failWith(
        "exchangeUserCode",
        Object.assign(
          new GitProviderError(
            "exchangeUserCode",
            `${CANARY} ${st} fake-code-${login} ${INSTALL_APP.clientSecret}`,
            { status: 400, oauthError: "bad_refresh_token" },
          ),
          { body: { error_description: CANARY }, cause: new Error(CANARY), token: CANARY },
        ),
      ),
    );
    expect(res.headers.location).toBe("/github?result=provider_error");
    const haystack = `${b.lines.join("\n")}${res.text}${JSON.stringify(res.headers)}`;
    for (const secret of [
      CANARY,
      state,
      `fake-code-${s.login}`,
      INSTALL_APP.clientSecret,
      ENCRYPTION_KEY.toString("utf8"),
      s.github.externalId,
    ]) {
      expect(haystack, secret).not.toContain(secret);
    }
    expect(failures(b.lines)[0]).toMatchObject({ oauthError: "bad_refresh_token", status: 400 });
  });
});
