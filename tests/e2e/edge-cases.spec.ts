import { expect, test } from "@playwright/test";

test("edge cases: connecting to same connection multiple times doesn't cause issues", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const browserLogs: string[] = [];
  pageA.on("console", (msg) => {
    const line = `[A] ${msg.text()}`;
    browserLogs.push(line);
    console.log(line);
  });
  pageB.on("console", (msg) => {
    const line = `[B] ${msg.text()}`;
    browserLogs.push(line);
    console.log(line);
  });

  // Setup
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  // B connects once
  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  console.log("B connected (first time)");

  // B "reconnects" by navigating to the share URL again
  console.log("B reconnecting...");
  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageB.waitForTimeout(2000);

  // Verify sync still works
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const testEatery = `Test Eatery ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(testEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: testEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Sync works after reconnect");

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("edge cases: empty connection (no users or eateries)", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));
  pageB.on("console", (msg) => console.log("[B]", msg.text()));

  // A creates empty connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // B connects to empty connection
  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Both should be able to navigate to settings
  await pageA.goto(`/settings/${connectionId}`);
  await pageB.goto(`/settings/${connectionId}`);

  // Should show empty state
  await expect(pageA.getByRole("heading", { name: /^Eateries/ })).toBeVisible();
  await expect(pageB.getByRole("heading", { name: /^Eateries/ })).toBeVisible();

  console.log("Empty connection handles correctly");

  await contextA.close();
  await contextB.close();
});

test("edge cases: invalid connection ID redirects to home", async ({
  browser,
}, testInfo) => {
  test.setTimeout(60_000);

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on("console", (msg) => console.log("[Page]", msg.text()));

  // Try to navigate to non-existent connection
  const fakeConnectionId = "00000000-0000-0000-0000-000000000000";
  await page.goto(`/wheel/${fakeConnectionId}`);

  // Should redirect to home
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  console.log("Invalid connection ID handled correctly");

  await context.close();
});

test("edge cases: special characters in names", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

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

  // Add eatery with special characters
  const specialEatery = `Café "Première" & Co. ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(specialEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  // Add user with special characters
  const specialUser = `Jöhn Döe <test@example.com> ${Date.now()}`;
  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(specialUser);
  await pageA.getByTestId("add-user-submit").click();

  // Connect B
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.waitForLoadState("networkidle");
  await pageA.waitForTimeout(2000); // Let A's P2P fully initialize
  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 90_000,
  });

  await pageB.goto(`/settings/${connectionId}`);

  // Verify special characters are preserved
  await expect(
    pageB.getByRole("heading", { name: specialEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageB.getByRole("heading", { name: specialUser }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Special characters handled correctly");

  await contextA.close();
  await contextB.close();
});

test("edge cases: very long names", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);

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

  // Add eatery with very long name
  const longEatery = `${"A".repeat(100)} Restaurant ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(longEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  // Connect B
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageB.goto(`/settings/${connectionId}`);

  // Verify long name is preserved (at least check it starts with the expected prefix)
  await expect(
    pageB.getByRole("heading", { name: /^A{100} Restaurant/ }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Long names handled correctly");

  await contextA.close();
  await contextB.close();
});

test("edge cases: simultaneous deletion from multiple peers", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

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

  // Add eatery
  const eateryToDelete = `Delete Me ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryToDelete);
  await pageA.getByTestId("add-eatery-submit").click();

  // Connect B
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryToDelete }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await pageA.goto(`/settings/${connectionId}`);

  // Both try to delete simultaneously
  await Promise.all([
    pageA
      .locator(`[data-eatery-name="${eateryToDelete}"]`)
      .getByTestId("delete-eatery")
      .click(),
    pageB
      .locator(`[data-eatery-name="${eateryToDelete}"]`)
      .getByTestId("delete-eatery")
      .click(),
  ]);

  // Both should show it as deleted
  await expect(
    pageA.getByRole("heading", { name: eateryToDelete }).first(),
  ).not.toBeVisible({ timeout: 10_000 });
  await expect(
    pageB.getByRole("heading", { name: eateryToDelete }).first(),
  ).not.toBeVisible({ timeout: 10_000 });

  console.log("Simultaneous deletion handled correctly");

  await contextA.close();
  await contextB.close();
});

test("edge cases: connection with only deleted items", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

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

  // Add and delete an eatery
  const eatery = `Temporary ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageA
    .locator(`[data-eatery-name="${eatery}"]`)
    .getByTestId("delete-eatery")
    .click();

  await expect(
    pageA.getByRole("heading", { name: eatery }).first(),
  ).not.toBeVisible({ timeout: 10_000 });

  // Now B connects (should only receive tombstones)
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageB.goto(`/settings/${connectionId}`);

  // B should not see the deleted eatery
  await pageB.waitForTimeout(5000);
  await expect(
    pageB.getByRole("heading", { name: eatery }).first(),
  ).not.toBeVisible({ timeout: 5_000 });

  // B should be able to add new items
  const newEatery = `New After Tombstones ${Date.now()}`;
  await pageB.getByTestId("add-eatery-open").click();
  await pageB.getByTestId("add-eatery-name").fill(newEatery);
  await pageB.getByTestId("add-eatery-submit").click();

  await expect(
    pageB.getByRole("heading", { name: newEatery }).first(),
  ).toBeVisible({ timeout: 10_000 });

  console.log("Connection with only tombstones handled correctly");

  await contextA.close();
  await contextB.close();
});
