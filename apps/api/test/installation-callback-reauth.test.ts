import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  callback,
  credentialRows,
  expectOutcome,
  githubReturn,
  installationAudit,
  installationBench,
  installationRows,
  installScene,
  reseed,
  startInstall,
  startState,
} from "./helpers/installations.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * TK-48a2, AC-48-11 : ré-autorisation d'une installation déjà liée. GitHub ne renvoie pas
 * `installation_id` : l'identifiant vient de l'état signé (colonne `installation_id`), jamais de la
 * requête. La preuve par jeton utilisateur reste exigée : l'installation doit figurer dans la liste.
 */
const bench = installationBench({ beforeAll, afterAll, beforeEach });

async function linked() {
  const b = bench();
  const s = await installScene(b);
  expectOutcome(
    await callback(b.app, s.owner.cookie, githubReturn(s, await startState(b, s.owner))),
    "installed",
  );
  const [installation] = await installationRows(b.database, s.world.organizationId);
  const [credential] = await credentialRows(b.database, s.world.organizationId);
  if (!installation || !credential) throw new Error("installation de départ absente");
  b.harness.calls = [];
  // Retour de GitHub après ré-autorisation : code et état seulement, pas d'installation_id.
  const again = reseed(b, s);
  const query = (state: string, over: Record<string, string | undefined> = {}) => ({
    ...githubReturn(again, state),
    installation_id: undefined,
    setup_action: undefined,
    ...over,
  });
  return { b, s, again, installation, credential, query };
}

const sameBytes = (a: Buffer | undefined, b: Buffer) =>
  Buffer.compare(a ?? Buffer.alloc(0), b) === 0;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("ré-autorisation sans installation_id", () => {
  it("met à jour le jeton de la même ligne, ne crée aucune seconde installation, redirige installed", async () => {
    const { b, s, installation, credential, query } = await linked();
    const state = await startState(b, s.owner, installation.id);

    const res = await callback(b.app, s.owner.cookie, query(state));

    expectOutcome(res, "installed");
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
    const creds = await credentialRows(b.database, s.world.organizationId);
    expect(creds).toHaveLength(1);
    expect(creds[0]).toMatchObject({ id: credential.id, installation_id: installation.id });
    expect(sameBytes(creds[0]?.ciphertext, credential.ciphertext)).toBe(false);
  });

  it("vérifie quand même l'installation dans la liste du jeton (preuve par jeton utilisateur)", async () => {
    const { b, s, installation, query } = await linked();
    const state = await startState(b, s.owner, installation.id);
    await callback(b.app, s.owner.cookie, query(state));
    expect(b.harness.callsOf("exchangeUserCode")).toHaveLength(1);
    expect(b.harness.callsOf("listUserInstallations")).toHaveLength(1);
  });

  it("audit installation.reauthorize (cible installation), sans nouvel installation.link", async () => {
    const { b, s, installation, query } = await linked();
    const state = await startState(b, s.owner, installation.id);
    await callback(b.app, s.owner.cookie, query(state));
    const audit = (await installationAudit(b.database, s.world.organizationId)).filter(
      (a) => a.action !== "installation.start",
    );
    expect(audit.map((a) => a.action)).toEqual(["installation.link", "installation.reauthorize"]);
    expect(audit[1]).toMatchObject({
      target_kind: "installation",
      target_id: installation.id,
      actor_id: s.owner.userId,
    });
  });

  it("un autre administrateur ré-autorise avec son propre jeton : second jeton, le premier est conservé", async () => {
    const { b, s, installation, credential, query } = await linked();
    const state = await startState(b, s.admin, installation.id);
    const res = await callback(b.app, s.admin.cookie, query(state));
    expectOutcome(res, "installed");
    const creds = await credentialRows(b.database, s.world.organizationId);
    expect(creds.map((c) => c.user_id).sort()).toEqual([s.owner.userId, s.admin.userId].sort());
    expect(creds.find((c) => c.user_id === s.owner.userId)?.id).toBe(credential.id);
  });

  it("l'installation ne figure pas dans la liste du jeton : denied, jeton et ligne inchangés", async () => {
    const { b, s, installation, credential, query } = await linked();
    const state = await startState(b, s.owner, installation.id);
    b.harness.reset(); // plus aucune installation chez GitHub pour ce compte
    const res = await callback(b.app, s.owner.cookie, query(state));
    expectOutcome(res, "denied");
    const [after] = await credentialRows(b.database, s.world.organizationId);
    expect(sameBytes(after?.ciphertext, credential.ciphertext)).toBe(true);
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
  });

  it("l'installation est supprimée entre start et retour : denied, aucune résurrection", async () => {
    const { b, s, installation, query } = await linked();
    const state = await startState(b, s.owner, installation.id);
    await b.database.query("UPDATE provider_installations SET status = 'deleted' WHERE id = $1", [
      installation.id,
    ]);
    const res = await callback(b.app, s.owner.cookie, query(state));
    expectOutcome(res, "denied");
    expect((await installationRows(b.database, s.world.organizationId))[0]?.status).toBe("deleted");
  });
});

describe("l'identifiant de la requête ne détourne pas la ré-autorisation", () => {
  it("installation_id de la requête différent de celui de l'état : invalid_state, rien ne change", async () => {
    const { b, s, installation, credential, again, query } = await linked();
    const other = {
      externalId: "8800123",
      ownerKind: "organization" as const,
      ownerLogin: "autre-acme",
    };
    b.harness.inner.seedUserInstallation(again.login, other);
    const state = await startState(b, s.owner, installation.id);

    const res = await callback(
      b.app,
      s.owner.cookie,
      query(state, { installation_id: other.externalId }),
    );

    expectOutcome(res, "invalid_state");
    expect(await installationRows(b.database, s.world.organizationId)).toHaveLength(1);
    const [after] = await credentialRows(b.database, s.world.organizationId);
    expect(sameBytes(after?.ciphertext, credential.ciphertext)).toBe(true);
  });

  it("installation_id de la requête identique à celui de l'état (toléré) : installed", async () => {
    const { b, s, installation, query } = await linked();
    const state = await startState(b, s.owner, installation.id);
    const res = await callback(
      b.app,
      s.owner.cookie,
      query(state, { installation_id: s.github.externalId }),
    );
    expectOutcome(res, "installed");
  });

  it("l'installation d'une autre organisation ne peut pas être ré-autorisée (NOT_FOUND dès le start)", async () => {
    const { b, installation } = await linked();
    const foreign = await createWorld(b.database);
    const res = await startInstall(b, foreign.actors.owner, installation.id);
    expect(res.status).toBe(404);
  });
});
