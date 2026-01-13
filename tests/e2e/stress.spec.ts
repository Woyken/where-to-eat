import { expect, test } from "@playwright/test";

test("stress: syncing large number of eateries across peers", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);

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

  // Setup connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // Add many eateries before B connects
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const eateryCount = 50;
  const eateryNames: string[] = [];

  console.log(`Adding ${eateryCount} eateries...`);
  for (let i = 0; i < eateryCount; i++) {
    const eateryName = `Stress Test Eatery ${i} ${Date.now()}`;
    eateryNames.push(eateryName);

    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill(eateryName);
    await pageA.getByTestId("add-eatery-submit").click();

    // Wait for dialog to close
    await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible({
      timeout: 5000,
    });

    // Small delay to avoid overwhelming the UI
    if (i % 10 === 0) {
      console.log(`Added ${i + 1}/${eateryCount} eateries`);
      await pageA.waitForTimeout(100);
    }
  }

  console.log(`All ${eateryCount} eateries added. Connecting B...`);

  // Get share URL
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.waitForLoadState("networkidle");
  await pageA.waitForTimeout(2000); // Let P2P stabilize
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  // B connects and should receive all eateries
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 90_000,
  });

  await pageB.goto(`/settings/${connectionId}`);
  await pageB.waitForLoadState("networkidle");

  // Verify all eateries are present on B
  console.log("Verifying all eateries on B...");
  for (let i = 0; i < eateryNames.length; i += 10) {
    // Check every 10th eatery
    const eateryName = eateryNames[i];
    await expect(
      pageB.getByRole("heading", { name: eateryName }).first(),
    ).toBeVisible({ timeout: 60_000 });
    console.log(`Verified eatery ${i + 1}/${eateryCount}`);
  }

  // Check the last one
  const lastEatery = eateryNames[eateryNames.length - 1];
  await expect(
    pageB.getByRole("heading", { name: lastEatery }).first(),
  ).toBeVisible({ timeout: 60_000 });

  console.log("All eateries verified on B");

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("stress: syncing many users and scores", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));
  pageB.on("console", (msg) => console.log("[B]", msg.text()));

  // Setup
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  // Add eateries
  const eateryNames = [];
  for (let i = 0; i < 10; i++) {
    const eateryName = `Eatery ${i}`;
    eateryNames.push(eateryName);
    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill(eateryName);
    await pageA.getByTestId("add-eatery-submit").click();
    await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();
  }

  // Add users
  const userNames = [];
  for (let i = 0; i < 10; i++) {
    const userName = `User ${i}`;
    userNames.push(userName);
    await pageA.getByTestId("add-user-open").click();
    await pageA.getByTestId("add-user-name").fill(userName);
    await pageA.getByTestId("add-user-submit").click();
    await expect(pageA.getByTestId("add-user-name")).not.toBeVisible();
  }

  console.log("Added 10 eateries and 10 users");

  // Connect B
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.waitForLoadState("networkidle");
  await pageA.waitForTimeout(3000); // Let P2P stabilize

  // Verify peer connection is ready before sharing
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();
  // Close the share dialog
  await pageA.keyboard.press("Escape");

  await pageB.goto(shareUrlText);

  // Wait for peer connection to be established (peer count becomes 1 on both sides)
  await expect(pageA.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 60_000,
  });

  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 90_000,
  });

  await pageB.goto(`/settings/${connectionId}`);
  await pageB.waitForLoadState("networkidle");

  // Verify all users and eateries on B
  for (const eateryName of eateryNames) {
    await expect(
      pageB.getByRole("heading", { name: eateryName }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  for (const userName of userNames) {
    await expect(
      pageB.getByRole("heading", { name: userName }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  console.log("All users and eateries verified on B");

  await contextA.close();
  await contextB.close();
});

test("stress: rapid connection/disconnection doesn't corrupt data", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));

  // Setup
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  // Add some initial data
  const initialEateries = [];
  for (let i = 0; i < 5; i++) {
    const eateryName = `Initial ${i}`;
    initialEateries.push(eateryName);
    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill(eateryName);
    await pageA.getByTestId("add-eatery-submit").click();
    await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();
  }

  // Rapidly create and close multiple contexts
  for (let i = 0; i < 5; i++) {
    console.log(`Rapid connect/disconnect cycle ${i + 1}/5`);

    const tempContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const tempPage = await tempContext.newPage();

    await pageA.goto(`/wheel/${connectionId}`);
    await pageA.waitForLoadState("networkidle");
    await pageA.waitForTimeout(1000); // Let P2P stabilize
    await pageA.getByTestId("share-button").click();
    const shareUrlText = (
      await pageA.getByTestId("share-url").innerText()
    ).trim();
    // Close share dialog
    await pageA.keyboard.press("Escape");

    // Connect
    await tempPage.goto(shareUrlText);

    // Wait briefly for connection
    await tempPage.waitForTimeout(2000);

    // Disconnect
    await tempContext.close();

    // Wait before next cycle for cleanup
    await pageA.waitForTimeout(1000);
  }

  // Verify data integrity: original eateries should still be there
  await pageA.goto(`/settings/${connectionId}`);
  for (const eateryName of initialEateries) {
    await expect(
      pageA.getByRole("heading", { name: eateryName }).first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  // Add one more to ensure system still works
  const finalEatery = `Final Test ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(finalEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await expect(
    pageA.getByRole("heading", { name: finalEatery }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await contextA.close();
});
