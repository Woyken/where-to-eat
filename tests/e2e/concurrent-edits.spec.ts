import { expect, test } from "@playwright/test";

test("concurrent edits: multiple peers edit same eatery simultaneously", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  // Create three isolated browser contexts
  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextC = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  const browserLogs: string[] = [];
  const wireLogs = (label: string, page: typeof pageA) => {
    page.on("console", (msg) => {
      const line = `[${label} console.${msg.type()}] ${msg.text()}`;
      browserLogs.push(line);
      console.log(line);
    });
  };

  wireLogs("A", pageA);
  wireLogs("B", pageB);
  wireLogs("C", pageC);

  // A creates the connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // Get share URL from A
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();
  const shareUrl = new URL(shareUrlText);

  // B and C connect to A
  await pageB.goto(shareUrl.href);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageC.goto(shareUrl.href);
  await expect(pageC).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Wait for full mesh to establish
  await pageA.waitForTimeout(3000);
  await pageB.waitForTimeout(3000);
  await pageC.waitForTimeout(3000);

  // All three navigate to settings
  await pageA.goto(`/settings/${connectionId}`);
  await pageB.goto(`/settings/${connectionId}`);
  await pageC.goto(`/settings/${connectionId}`);

  await pageA.waitForLoadState("networkidle");
  await pageB.waitForLoadState("networkidle");
  await pageC.waitForLoadState("networkidle");

  // Add initial eatery from A
  const initialEateryName = `Initial Eatery ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await expect(pageA.getByTestId("add-eatery-name")).toBeVisible();
  await pageA.getByTestId("add-eatery-name").fill(initialEateryName);
  await pageA.getByTestId("add-eatery-submit").click();
  await expect(pageA.getByTestId("add-eatery-name")).not.toBeVisible();

  // Wait for it to propagate
  await expect(
    pageB.getByRole("heading", { name: initialEateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageC.getByRole("heading", { name: initialEateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Now all three peers add different eateries simultaneously
  const timestamp = Date.now();
  const eateryA = `Concurrent A ${timestamp}`;
  const eateryB = `Concurrent B ${timestamp}`;
  const eateryC = `Concurrent C ${timestamp}`;

  // Start all three adds in parallel
  await Promise.all([
    (async () => {
      await pageA.getByTestId("add-eatery-open").click();
      await pageA.getByTestId("add-eatery-name").fill(eateryA);
      await pageA.getByTestId("add-eatery-submit").click();
    })(),
    (async () => {
      await pageB.getByTestId("add-eatery-open").click();
      await pageB.getByTestId("add-eatery-name").fill(eateryB);
      await pageB.getByTestId("add-eatery-submit").click();
    })(),
    (async () => {
      await pageC.getByTestId("add-eatery-open").click();
      await pageC.getByTestId("add-eatery-name").fill(eateryC);
      await pageC.getByTestId("add-eatery-submit").click();
    })(),
  ]);

  // All three eateries should eventually appear on all peers
  await expect(
    pageA.getByRole("heading", { name: eateryA }).first(),
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    pageA.getByRole("heading", { name: eateryB }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageA.getByRole("heading", { name: eateryC }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    pageB.getByRole("heading", { name: eateryA }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageB.getByRole("heading", { name: eateryB }).first(),
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    pageB.getByRole("heading", { name: eateryC }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    pageC.getByRole("heading", { name: eateryA }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageC.getByRole("heading", { name: eateryB }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageC.getByRole("heading", { name: eateryC }).first(),
  ).toBeVisible({ timeout: 5_000 });

  await contextA.close();
  await contextB.close();
  await contextC.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("concurrent edits: multiple peers add users simultaneously", async ({
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

  // Setup connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Navigate both to settings
  await pageA.goto(`/settings/${connectionId}`);
  await pageB.goto(`/settings/${connectionId}`);

  await pageA.waitForLoadState("networkidle");
  await pageB.waitForLoadState("networkidle");

  // Both add users simultaneously
  const timestamp = Date.now();
  const userA = `User A ${timestamp}`;
  const userB = `User B ${timestamp}`;

  await Promise.all([
    (async () => {
      await pageA.getByTestId("add-user-open").click();
      await pageA.getByTestId("add-user-name").fill(userA);
      await pageA.getByTestId("add-user-submit").click();
    })(),
    (async () => {
      await pageB.getByTestId("add-user-open").click();
      await pageB.getByTestId("add-user-name").fill(userB);
      await pageB.getByTestId("add-user-submit").click();
    })(),
  ]);

  // Both users should appear on both peers
  await expect(pageA.getByRole("heading", { name: userA }).first()).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(pageA.getByRole("heading", { name: userB }).first()).toBeVisible(
    { timeout: 15_000 },
  );

  await expect(pageB.getByRole("heading", { name: userA }).first()).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(pageB.getByRole("heading", { name: userB }).first()).toBeVisible(
    { timeout: 10_000 },
  );

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});
