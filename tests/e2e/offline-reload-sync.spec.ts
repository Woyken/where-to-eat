import { expect, test } from "@playwright/test";

test("offline-reload-sync: page reload works offline and changes sync after reconnect", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const browserLogs: string[] = [];
  const wireLogs = (label: string, page: typeof pageA) => {
    page.on("console", (msg) => {
      const line = `[${label}] ${msg.text()}`;
      browserLogs.push(line);
      console.log(line);
    });
  };

  wireLogs("A", pageA);
  wireLogs("B", pageB);

  // Step 1: Establish connection between A and B
  console.log("Step 1: A creates connection");
  await pageA.goto("/");
  // Ensure SW is registered and active before going offline
  await pageA.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    console.log("SW ready:", reg.active?.state);
  });

  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  console.log("Step 1: B connects to A via share URL");
  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Verify connection with initial data
  console.log("Step 1: Adding initial eatery to verify connection");
  await pageA.goto(`/settings/${connectionId}`);
  const initialEatery = `Initial Connected ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(initialEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: initialEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("Step 1: Initial sync verified");

  // Step 2: A goes offline and RELOADS
  console.log("Step 2: Setting peer A offline and reloading");
  await contextA.setOffline(true);

  // Wait a bit to ensure offline state propagates
  await pageA.waitForTimeout(1000);

  await pageA.reload();
  await pageA.waitForLoadState("domcontentloaded");

  // Verify we are still on the settings page or redirected correctly and the app loaded
  await expect(pageA).toHaveURL(new RegExp(`/settings/${connectionId}$`));

  // Step 3: A makes changes while offline after reload
  console.log("Step 3: Making changes in A while offline after reload");

  const offlineEatery = `Offline Reload Eatery ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(offlineEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await expect(
    pageA.getByRole("heading", { name: offlineEatery }).first(),
  ).toBeVisible({ timeout: 5_000 });

  console.log("Step 3: Changes made offline (new eatery)");

  // Step 4: Bring A back online
  console.log("Step 4: Bringing peer A back online");
  await contextA.setOffline(false);

  // Allow some time for P2P reconnection or force sync via reload/navigation
  // Just bringing network online might not trigger immediate P2P reconnect if PeerJS backoff is high,
  // but let's try to see if B receives it or if we need to trigger something.

  // We can reload B to force it to pull or reconnect more aggressively
  console.log("Step 5: B reloads to reconnect and sync");
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  // Step 6: Verify A's changes sync to B
  console.log("Step 6: Verifying A's offline changes sync to B");
  await expect(
    pageB.getByRole("heading", { name: offlineEatery }).first(),
  ).toBeVisible({ timeout: 20_000 });

  console.log("Test Complete: Offline reload and sync successful");
});
