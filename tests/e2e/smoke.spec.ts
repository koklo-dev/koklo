import { expect, test } from "@playwright/test";

test("desktop app smoke", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("koklo.lastProjectPath", "/workspace/koklo");
    window.localStorage.setItem(
      "koklo.browserClientState.v1",
      JSON.stringify({
        account: {
          name: "Smoke Tester",
          email: "smoke@koklo.dev",
          role: "QA",
          createdAt: 1720972800,
        },
        sessions: [
          {
            id: "smoke-session-1",
            title: "Smoke test session",
            status: "running",
            preset: "light",
            projectPath: "/workspace/koklo",
            workspacePath: "/workspace/koklo/.koklo/worktrees/smoke-session-1",
            workspaceBranch: "koklo/session/smoke-session-1",
            createdAt: "2026-07-14T08:00:00Z",
            updatedAt: "2026-07-14T08:05:00Z",
          },
        ],
        transcripts: {
          "smoke-session-1": [
            {
              id: "smoke-line-1",
              sessionId: "smoke-session-1",
              seq: 1,
              phase: "developer",
              agentName: "developer",
              source: "llm",
              kind: "message",
              status: "completed",
              itemKey: null,
              summary: "Booted",
              payload: { text: "Transcript is ready." },
              createdAt: "2026-07-14T08:05:10Z",
            },
          ],
        },
      }),
    );
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await expect(page.getByText("Smoke test session")).toBeVisible();

  await page.getByText("Smoke test session").click();
  await expect(page.getByRole("heading", { name: "Smoke test session" })).toBeVisible();
  await expect(page.getByText("Transcript is ready.")).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();

  await page.getByRole("button", { name: "New Run" }).click();
  await expect(page.getByRole("heading", { name: "New Run" })).toBeVisible();
  await expect(page.getByLabel("Project path")).toHaveValue("/workspace/koklo");
});
