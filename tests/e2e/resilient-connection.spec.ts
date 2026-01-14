import { expect, test } from "@playwright/test";
import { injectConnection } from "./helpers";

test("resilient connection: remaining tab stays connected after others close", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  // Context 1: Browser with multiple tabs
  const context1 = await browser.newContext();
  // Context 2: Another browser (peer)
  const context2 = await browser.newContext();

  const page1a = await context1.newPage();
  const page1b = await context1.newPage();
  const page1c = await context1.newPage();

  const page2a = await context2.newPage();

  // Logging
  const browserLogs: string[] = [];
  const wireLogs = (label: string, page: typeof page1a) => {
    page.on("console", (msg) => {
      const line = `[${label}] ${msg.text()}`;
      browserLogs.push(line);
      console.log(line);
    });
  };

  wireLogs("1a", page1a);
  wireLogs("1b", page1b);
  wireLogs("1c", page1c);
  wireLogs("2a", page2a);

  // 1. Setup Connection on Page 2a (Creator)
  await page2a.goto("/");
  await page2a.waitForLoadState("networkidle");
  await page2a.getByTestId("start-fresh").click();
  await expect(page2a).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(page2a.url());
  const connectionId = connectionIdMatch![1];

  await page2a.getByTestId("share-button").click();
  const shareUrl = await page2a.getByTestId("share-url").innerText();

  // 2. Connect Page 1a to Page 2a
  await injectConnection(page1a, connectionId);
  await page1a.goto(shareUrl);
  await expect(page1a).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 30_000,
  });

  // 3. Open 1b and 1c to the same settings page/connection
  await page1b.goto(`/settings/${connectionId}`);
  await page1c.goto(`/settings/${connectionId}`);

  // Also go to settings on 1a and 2a for adding eateries
  await page1a.goto(`/settings/${connectionId}`);
  await page2a.goto(`/settings/${connectionId}`);

  // 4. Verify initial sync across all 4 tabs
  // First wait for 2a to be connected to context1
  console.log("Waiting for 2a to be connected to peer...");
  await expect(page2a.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 30_000,
  });
  console.log("2a connected to 1 peer");

  const initialEatery = `Initial Sync ${Date.now()}`;
  await page2a.getByTestId("add-eatery-open").click();
  await page2a.getByTestId("add-eatery-name").fill(initialEatery);
  await page2a.getByTestId("add-eatery-submit").click();

  // Wait for dialog to close first
  await expect(page2a.getByTestId("add-eatery-name")).not.toBeVisible();

  // Verify on 2a first (local)
  await expect(
    page2a.locator(`[data-eatery-name="${initialEatery}"]`).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Verify sync to context1 tabs - now that we're connected, sync should work reliably
  await expect(
    page1a.locator(`[data-eatery-name="${initialEatery}"]`).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("1a: eatery found");

  await expect(
    page1b.locator(`[data-eatery-name="${initialEatery}"]`).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("1b: eatery found");

  await expect(
    page1c.locator(`[data-eatery-name="${initialEatery}"]`).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("1c: eatery found");

  console.log("Initial sync confirmed on all tabs");

  // 5. Close 1a and 1c
  console.log("Closing 1a and 1c...");
  await page1a.close();
  await page1c.close();

  // Wait for 1b to become leader and reconnect to 2a
  console.log("Waiting for 1b to reconnect to peer...");
  await expect(page1b.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 30_000,
  });
  console.log("1b reconnected to 1 peer");

  // 6. Make change in 2a
  const resilientEatery = `Resilient Update ${Date.now()}`;
  await page2a.getByTestId("add-eatery-open").click();
  await page2a.getByTestId("add-eatery-name").fill(resilientEatery);
  await page2a.getByTestId("add-eatery-submit").click();

  // Wait for dialog to close first
  await expect(page2a.getByTestId("add-eatery-name")).not.toBeVisible();

  // Verify on 2a first (local)
  await expect(
    page2a.locator(`[data-eatery-name="${resilientEatery}"]`).first(),
  ).toBeVisible({ timeout: 15_000 });

  // 7. Verify 1b still receives update from 2a
  console.log("Verifying 1b received update...");
  await expect(
    page1b.locator(`[data-eatery-name="${resilientEatery}"]`).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("1b is still connected and syncing!");
});
