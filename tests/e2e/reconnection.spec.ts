import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { selectOrCreateUser } from "./helpers";

test("reconnection: peer reconnects after temporary network interruption", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const logFile = path.resolve("reconnection_logs.txt");
  fs.writeFileSync(logFile, "");
  const log = (msg: string) => fs.appendFileSync(logFile, msg + "\n");

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("console", (msg) => log(`[A] ${msg.text()}`));
  pageB.on("console", (msg) => log(`[B] ${msg.text()}`));

  // Setup connection - A creates the room
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

  // B joins via share URL
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");

  // Add an eatery while connected
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const eateryBeforeDisconnect = `Before Disconnect ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryBeforeDisconnect);
  await pageA.getByTestId("add-eatery-submit").click();

  // Verify B receives it
  await pageB.goto(`/settings/${connectionId}`);
  await expect(pageB.getByText(eateryBeforeDisconnect).first()).toBeVisible({
    timeout: 15_000,
  });

  // Scenario: A goes offline (simulates user1 losing network on their phone)
  // First, close B so it won't receive any more updates
  console.log("Closing B to simulate disconnect");
  await contextB.close();

  // A makes changes while B is disconnected
  const eateryWhileOffline = `While Offline ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryWhileOffline);
  await pageA.getByTestId("add-eatery-submit").click();

  await expect(pageA.getByText(eateryWhileOffline).first()).toBeVisible({
    timeout: 10_000,
  });

  // Wait a moment to ensure A has the change locally
  await pageA.waitForTimeout(1000);

  // B reconnects - create new context (simulates coming back online)
  console.log("B reconnecting...");
  const contextB2 = await browser.newContext({ ignoreHTTPSErrors: true });
  const pageB2 = await contextB2.newPage();
  pageB2.on("console", (msg) => log(`[B2] ${msg.text()}`));

  // Get fresh share URL from A
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrlText2 = (
    await pageA.getByTestId("share-url").innerText()
  ).trim();

  // B2 joins via share URL
  await pageB2.goto(shareUrlText2);
  await expect(pageB2).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB2, "User B2");

  // After B reconnects, it should receive A's changes (including what was added while offline)
  await pageB2.goto(`/settings/${connectionId}`);
  await expect(pageB2.getByText(eateryWhileOffline).first()).toBeVisible({
    timeout: 15_000,
  });

  await contextB2.close();
  await contextA.close();

  const browserLogs: string[] = [];
  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("reconnection: changes made while peer is offline sync when it returns", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));
  pageB.on("console", (msg) => console.log("[B]", msg.text()));

  // Setup - A creates the room
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

  // B joins via share URL
  await pageB.goto(shareUrlText);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");

  await pageA.goto(`/settings/${connectionId}`);
  await pageB.goto(`/settings/${connectionId}`);

  // A goes offline (simulates user1 losing network)
  await contextA.setOffline(true);

  // A makes multiple changes while offline (app still open)
  const changes = [];
  for (let i = 0; i < 3; i++) {
    const eateryName = `Offline Change ${i} ${Date.now()}`;
    changes.push(eateryName);
    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill(eateryName);
    await pageA.getByTestId("add-eatery-submit").click();
    await pageA.waitForTimeout(500);
  }

  // A comes back online
  await contextA.setOffline(false);

  // B reloads their page - this triggers P2P reconnection and sync request
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  // All of A's offline changes should now be synced to B
  for (const eateryName of changes) {
    await expect(pageB.getByText(eateryName).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  await contextA.close();
  await contextB.close();
});

test("reconnection: page refresh maintains connection and syncs data", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));
  pageB.on("console", (msg) => console.log("[B]", msg.text()));

  // Setup Unique 3
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

  // Add data
  await pageA.goto(`/settings/${connectionId}`);
  const eateryBeforeRefresh = `Before Refresh ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryBeforeRefresh);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryBeforeRefresh }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Refresh B's page
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  // B should still have the data (loaded from localStorage/IndexedDB)
  await expect(
    pageB.getByRole("heading", { name: eateryBeforeRefresh }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // Add new data from A after B refreshed
  const eateryAfterRefresh = `After Refresh ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryAfterRefresh);
  await pageA.getByTestId("add-eatery-submit").click();

  // B should receive the new data (connection should be re-established)
  await expect(
    pageB.getByRole("heading", { name: eateryAfterRefresh }).first(),
  ).toBeVisible({ timeout: 30_000 });

  await contextA.close();
  await contextB.close();
});
