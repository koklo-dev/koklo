import assert from "node:assert/strict";

async function snapshotWindows() {
  const handles = await browser.getWindowHandles();
  const snapshot = [];
  for (const handle of handles) {
    await browser.switchToWindow(handle);
    const title = await browser.getTitle().catch(() => "<title-error>");
    const headings = await $$("h1");
    const texts = [];
    for (const heading of headings) {
      texts.push(await heading.getText().catch(() => "<heading-error>"));
    }
    snapshot.push({ handle, title, headings: texts });
  }
  return snapshot;
}

async function dumpWindows(label) {
  const snapshot = await snapshotWindows();
  console.log(`[native-smoke] ${label}: ${JSON.stringify(snapshot)}`);
  return snapshot;
}

async function findWindowWithContent(...selectors) {
  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles();
      for (const handle of handles) {
        await browser.switchToWindow(handle);
        for (const selector of selectors) {
          if (await $(selector).isExisting()) return true;
        }
      }
      return false;
    },
    {
      timeout: 60_000,
      interval: 1_000,
      timeoutMsg: `Timed out waiting for a window with one of: ${selectors.join(", ")}`,
    },
  );

  const handles = await browser.getWindowHandles();
  for (const handle of handles) {
    await browser.switchToWindow(handle);
    for (const selector of selectors) {
      if (await $(selector).isExisting()) {
        return { handle, element: await $(selector) };
      }
    }
  }

  throw new Error(`No window exposed selectors: ${selectors.join(", ")}`);
}

describe("Koklo desktop native smoke", () => {
  it("boots in the real Tauri runtime and reaches the shell", async () => {
    try {
      await dumpWindows("initial windows");
      const isTauriRuntime = await browser.execute(() => Boolean(window.__TAURI_INTERNALS__));
      assert.equal(isTauriRuntime, true, "expected a real Tauri runtime");

      const { element: primaryHeading } = await findWindowWithContent(
        "h1=Set up your identity",
        "h1=Sessions",
      );
      const headingText = await primaryHeading.getText();
      console.log(`[native-smoke] primary heading: ${headingText}`);

      if (headingText === "Set up your identity") {
        await $("#user-name").setValue("Native Smoke");
        await $("#user-email").setValue("native-smoke@koklo.dev");
        await $("#user-role").setValue("QA");
        await $("button=Continue to Koklo").click();
        await dumpWindows("after onboarding submit");
      }

      const { element: sessionsHeading } = await findWindowWithContent("h1=Sessions");
      await sessionsHeading.waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "Expected Sessions heading to be displayed",
      });
      await $("button=New Run").waitForDisplayed({
        timeout: 15_000,
        timeoutMsg: "Expected New Run button on Sessions screen",
      });
      await browser.waitUntil(async () => (await browser.getTitle()) === "Koklo", {
        timeout: 15_000,
        timeoutMsg: "Expected document title to settle to Koklo",
      });
    } catch (error) {
      const snapshot = await snapshotWindows().catch(() => [{ error: "snapshot-failed" }]);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}\n[native-smoke snapshot] ${JSON.stringify(snapshot)}`);
    }
  });
});
