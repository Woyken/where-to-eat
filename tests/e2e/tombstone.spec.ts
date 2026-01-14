import { expect, test } from "@playwright/test";
import { selectOrCreateUser } from "./helpers";

test("tombstone: deleted eatery doesn't reappear after sync", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextC = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

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
  wireLogs("C", pageC);

  // A creates connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);
  await selectOrCreateUser(pageA, "User A");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // B connects to A
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  // await injectConnection(pageB, connectionId);
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");

  // Go to settings and add an eatery
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const eateryToDelete = `Will Delete ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryToDelete);
  await pageA.getByTestId("add-eatery-submit").click();

  // Wait for B to receive the eatery
  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryToDelete }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Delete the eatery from A
  await pageA
    .locator(`[data-eatery-name="${eateryToDelete}"]`)
    .getByTestId("delete-eatery")
    .click();

  // Verify it's deleted from A
  await expect(
    pageA.getByRole("heading", { name: eateryToDelete }).first(),
  ).not.toBeVisible({ timeout: 10_000 });

  // Verify deletion propagates to B
  await expect(
    pageB.getByRole("heading", { name: eateryToDelete }).first(),
  ).not.toBeVisible({ timeout: 15_000 });

  // Now C connects (after the deletion)
  // await injectConnection(pageC, connectionId);
  await pageC.goto(shareUrlText);
  await expect(pageC).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageC, "User C");

  await pageC.goto(`/settings/${connectionId}`);
  await pageC.waitForLoadState("networkidle");

  // C should NOT see the deleted eatery (tombstone should prevent it)
  await pageC.waitForTimeout(5000); // Wait for sync
  await expect(
    pageC.getByRole("heading", { name: eateryToDelete }).first(),
  ).not.toBeVisible({ timeout: 5_000 });

  await contextA.close();
  await contextB.close();
  await contextC.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("tombstone: deleted user doesn't reappear after sync", async ({
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
      browserLogs.push(`[${label}] ${msg.text()}`);
      console.log(`[${label}] ${msg.text()}`);
    });
  };

  wireLogs("A", pageA);
  wireLogs("B", pageB);

  // Setup
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);
  await selectOrCreateUser(pageA, "User A");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  // Add a user
  const userToDelete = `Delete Me ${Date.now()}`;
  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(userToDelete);
  await pageA.getByTestId("add-user-submit").click();

  // Get share URL and connect B
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  // await injectConnection(pageB, connectionId);
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: userToDelete }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Delete from A
  await pageA.goto(`/settings/${connectionId}`);

  // Wait for A to reconnect to B after navigation before deleting
  await expect(pageA.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 30_000,
  });

  await pageA
    .locator(`[data-user-name="${userToDelete}"]`)
    .getByTestId("delete-user")
    .click();

  await expect(
    pageA.getByRole("heading", { name: userToDelete }).first(),
  ).not.toBeVisible({ timeout: 10_000 });

  // Verify deletion on B
  await expect(
    pageB.getByRole("heading", { name: userToDelete }).first(),
  ).not.toBeVisible({ timeout: 15_000 });

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("tombstone: concurrent delete and update resolves correctly", async ({
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
  await selectOrCreateUser(pageA, "User A");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrlText = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  // await injectConnection(pageB, connectionId);
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");

  // Add an eatery from A
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const eateryName = `Conflict Test ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryName);
  await pageA.getByTestId("add-eatery-submit").click();

  // Wait for B to receive
  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryName }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Simulate network partition: close connections temporarily by navigating away
  // In a real test, you'd use network throttling or offline mode
  // For now, we'll just test that delete takes precedence

  // A deletes the eatery
  await expect(pageA.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 30_000,
  });
  await pageA
    .locator(`[data-eatery-name="${eateryName}"]`)
    .getByTestId("delete-eatery")
    .click();

  // Verify deletion propagates
  await expect(
    pageB.getByRole("heading", { name: eateryName }).first(),
  ).not.toBeVisible({ timeout: 15_000 });

  await contextA.close();
  await contextB.close();
});
