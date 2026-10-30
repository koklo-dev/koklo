import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  request,
  test,
} from "@playwright/test";
import {
  createR1Workspace,
  type R1Member,
  type R1Workspace,
  SESSION_COOKIE,
} from "../support/r1-workspace.ts";

/**
 * Résultat R1 (vision §21) de bout en bout contre la vraie stack : sprint, tickets dépendants,
 * kanban dans le navigateur, règle de dépendance, baux concurrents, journal d'audit.
 * Parcours sériel : chaque test consomme l'état du précédent. Espace isolé (organisation dédiée).
 */
test.describe.configure({ mode: "serial" });

const API = "/api/orpc";
const todayPlus = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let workspace: R1Workspace;
let baseURL: string;
let owner: APIRequestContext;
let devs: [APIRequestContext, APIRequestContext];
let sprintKey: string;
let keyA: string;
let keyB: string;
let keyC: string;

async function apiContext(member: R1Member): Promise<APIRequestContext> {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${member.cookie}` },
  });
}

async function json<T = Record<string, unknown>>(response: APIResponse, what: string): Promise<T> {
  const body = await response.text();
  expect(response.ok(), `${what} : ${response.status()} ${body}`).toBe(true);
  return JSON.parse(body) as T;
}

interface Ticket {
  key: string;
  status: string;
}
interface AuditEntry {
  action: string;
  ticketKey?: string;
  actorId?: string;
}

const createTicket = async (title: string, status: "backlog" | "todo"): Promise<string> =>
  (
    await json<Ticket>(
      await owner.post(`${API}/tickets`, {
        data: {
          title,
          type: "task",
          priority: "medium",
          pkg: "e2e",
          sensitivity: "safe",
          status,
          sprintId: sprintKey,
        },
      }),
      `ticket.create ${title}`,
    )
  ).key;

const serverStatus = async (key: string): Promise<string> =>
  (await json<Ticket>(await owner.get(`${API}/tickets/${key}`), `ticket.get ${key}`)).status;

const audit = async (query: string): Promise<AuditEntry[]> =>
  (
    await json<{ items: AuditEntry[] }>(
      await owner.get(`${API}/audit?${query}&limit=100`),
      "audit.list",
    )
  ).items;

const column = (page: Page, status: string) => page.getByTestId(`kanban-column-${status}`);

/** Déplace par le menu « Déplacer » ; n'attend rien : l'appelant attend le toast ou l'alerte. */
async function move(page: Page, key: string, label: string): Promise<void> {
  await page.getByRole("button", { name: `Déplacer ${key}` }).click();
  await page.getByRole("menuitem", { name: label }).click();
}

async function moveOk(page: Page, key: string, status: string, label: string): Promise<void> {
  await move(page, key, label);
  await expect(
    page.getByRole("status").filter({ hasText: `${key} déplacé vers ${label}.` }),
  ).toBeVisible();
  await expect(column(page, status).getByTestId(`kanban-card-${key}`)).toBeVisible();
}

test.beforeAll(async () => {
  baseURL = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100"; // même défaut que playwright.config.ts
  workspace = await createR1Workspace();
  owner = await apiContext(workspace.owner);
  devs = [await apiContext(workspace.devs[0]), await apiContext(workspace.devs[1])];
});

test.afterAll(async () => {
  await Promise.all([owner?.dispose(), ...(devs ?? []).map((d) => d.dispose())]);
});

test("R1 : le sprint se crée puis s'active, un seul sprint actif par projet", async () => {
  const created = await json<{ key: string; status: string }>(
    await owner.post(`${API}/sprints`, {
      data: { goal: "Livrer R1", startsOn: todayPlus(0), endsOn: todayPlus(14) },
    }),
    "sprint.create",
  );
  expect(created.status).toBe("planned");
  sprintKey = created.key;

  const active = await json<{ status: string }>(
    await owner.post(`${API}/sprints/${sprintKey}/activate`),
    "sprint.activate",
  );
  expect(active.status).toBe("active");

  const other = await json<{ key: string }>(
    await owner.post(`${API}/sprints`, {
      data: { goal: "Second sprint", startsOn: todayPlus(15), endsOn: todayPlus(29) },
    }),
    "sprint.create (second)",
  );
  const refused = await owner.post(`${API}/sprints/${other.key}/activate`);
  expect(refused.status()).toBe(409);
});

test("R1 : les tickets A, B, C se créent et B dépend de A (blocks)", async () => {
  keyA = await createTicket("R1 A", "todo");
  keyB = await createTicket("R1 B (dépend de A)", "todo");
  keyC = await createTicket("R1 C", "backlog");

  await json(
    await owner.post(`${API}/tickets/${keyB}/dependencies`, {
      data: { dependsOn: keyA, type: "blocks" },
    }),
    "dependency.add",
  );
  const deps = await json<{ dependsOn: string; type: string }[]>(
    await owner.get(`${API}/tickets/${keyB}/dependencies`),
    "dependency.list",
  );
  expect(deps).toEqual([expect.objectContaining({ dependsOn: keyA, type: "blocks" })]);
});

test("R1 : le kanban déplace C, refuse B tant que A n'est pas terminé, puis l'accepte", async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: SESSION_COOKIE, value: workspace.owner.cookie, url: baseURL }]);
  await page.goto("/kanban");
  await expect(page.getByTestId("kanban-board")).toBeVisible();
  await expect(page.getByText(`Sprint ${sprintKey} · Livrer R1`)).toBeVisible();
  await expect(column(page, "todo").getByTestId(`kanban-card-${keyA}`)).toBeVisible();
  await expect(column(page, "todo").getByTestId(`kanban-card-${keyB}`)).toBeVisible();
  await expect(column(page, "backlog").getByTestId(`kanban-card-${keyC}`)).toBeVisible();

  await moveOk(page, keyC, "todo", "À faire");

  // Refus : la dépendance A n'est pas terminée.
  await move(page, keyB, "En cours");
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
    `Transition interdite : ${keyB} ne peut pas passer de « À faire » à « En cours ».`,
  );
  await expect(column(page, "todo").getByTestId(`kanban-card-${keyB}`)).toBeVisible();
  expect(await serverStatus(keyB)).toBe("todo");

  // A traverse le workflow jusqu'à Terminé.
  await moveOk(page, keyA, "in_progress", "En cours");
  await moveOk(page, keyA, "in_review", "En revue");
  await moveOk(page, keyA, "done", "Terminé");

  // Même déplacement qu'au refus : il réussit maintenant, la cause était bien la dépendance.
  await moveOk(page, keyB, "in_progress", "En cours");

  await page.reload();
  await expect(column(page, "done").getByTestId(`kanban-card-${keyA}`)).toBeVisible();
  await expect(column(page, "in_progress").getByTestId(`kanban-card-${keyB}`)).toBeVisible();
  await expect(column(page, "todo").getByTestId(`kanban-card-${keyC}`)).toBeVisible();
  expect(await serverStatus(keyA)).toBe("done");
  expect(await serverStatus(keyB)).toBe("in_progress");
  expect(await serverStatus(keyC)).toBe("todo");
});

test("R1 : deux membres demandent le bail en parallèle, un seul l'obtient", async () => {
  const body = (n: number) => ({ data: { branch: `r1/dev-${n}`, worktree: `/tmp/r1-${n}` } });
  const responses = await Promise.all([
    devs[0].post(`${API}/tickets/${keyB}/lease`, body(0)),
    devs[1].post(`${API}/tickets/${keyB}/lease`, body(1)),
  ]);
  const statuses = responses.map((r) => r.status()).sort();
  expect(
    statuses,
    await Promise.all(responses.map((r) => r.text())).then((t) => t.join(" | ")),
  ).toEqual([200, 409]);

  const winnerIndex = responses.findIndex((r) => r.status() === 200);
  const loser = responses[1 - winnerIndex];
  if (!loser) throw new Error("réponse perdante introuvable");
  const refusal = (await loser.json()) as { code: string };
  expect(refusal.code).toBe("LEASE_HELD");

  const won = (await responses[winnerIndex]?.json()) as { holder: { id: string } };
  const current = await json<{ holder: { id: string } } | null>(
    await owner.get(`${API}/tickets/${keyB}/lease`),
    "lease.get",
  );
  expect(current?.holder.id).toBe(won.holder.id);
  expect([workspace.devs[0].userId, workspace.devs[1].userId]).toContain(won.holder.id);

  // Un nouvel essai du perdant reste refusé tant que le bail est actif.
  const again = await devs[1 - winnerIndex]?.post(`${API}/tickets/${keyB}/lease`, body(9));
  expect(again?.status()).toBe(409);
});

test("R1 : le journal d'audit trace chaque action, avec un seul lease.acquire", async () => {
  const leases = await audit(`ticketKey=${keyB}&action=lease.acquire`);
  expect(leases).toHaveLength(1);
  expect([workspace.devs[0].userId, workspace.devs[1].userId]).toContain(leases[0]?.actorId);

  const countOf = async (action: string) => (await audit(`action=${action}`)).length;
  expect(await countOf("lease.acquire")).toBe(1);
  expect(await countOf("sprint.create")).toBe(2);
  expect(await countOf("sprint.activate")).toBe(1);
  expect(await countOf("ticket.create")).toBe(3);
  expect(await countOf("dependency.add")).toBe(1);
  // C : 1 ; A : 3 ; B : 1.
  expect(await countOf("ticket.transition")).toBe(5);
});
