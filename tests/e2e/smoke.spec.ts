import { expect, test } from "@playwright/test";

test("desktop app smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Koklo desktop app scaffold")).toBeVisible();
});
