import { expect, test } from "@playwright/test";
import { injectConnection } from "./helpers";

test("recovery: remaining peers communicate after one closes", async ({
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
  for (const { label, page } of [
    { label: "A", page: pageA },
    { label: "B", page: pageB },
    { label: "C", page: pageC },
  ]) {
    page.on("console", (msg) => {
      const line = `[${label}] ${msg.text()}`;
      browserLogs.push(line);
      console.log(line);
    });
  }

  // Setup: A creates, B and C connect to A
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  console.log("B connected");

  await pageC.goto(shareUrl);
  await expect(pageC).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  console.log("C connected");

  // Wait for mesh to establish
  await pageA.waitForTimeout(5000);

  // Verify initial sync works
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const initialEatery = `Initial ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(initialEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: initialEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await pageC.goto(`/settings/${connectionId}`);
  await expect(
    pageC.getByRole("heading", { name: initialEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Initial sync verified");

  // Close A
  console.log("Closing A...");
  await pageA.close();
  await contextA.close();

  // Wait for B and C to detect the closure
  await pageB.waitForTimeout(2000);

  // B and C should still be able to communicate
  const eateryFromB = `From B After A Closed ${Date.now()}`;
  await pageB.getByTestId("add-eatery-open").click();
  await pageB.getByTestId("add-eatery-name").fill(eateryFromB);
  await pageB.getByTestId("add-eatery-submit").click();

  // C should receive it (via direct connection established through gossip)
  await expect(
    pageC.getByRole("heading", { name: eateryFromB }).first(),
  ).toBeVisible({ timeout: 30_000 });

  console.log("B and C can still communicate after A closed");

  // C adds something
  const eateryFromC = `From C After A Closed ${Date.now()}`;
  await pageC.getByTestId("add-eatery-open").click();
  await pageC.getByTestId("add-eatery-name").fill(eateryFromC);
  await pageC.getByTestId("add-eatery-submit").click();

  // B should receive it
  await expect(
    pageB.getByRole("heading", { name: eateryFromC }).first(),
  ).toBeVisible({ timeout: 30_000 });

  console.log("C and B can communicate bidirectionally after A closed");

  await contextB.close();
  await contextC.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("recovery: new peer can join after original creator leaves", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextC = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));
  pageB.on("console", (msg) => console.log("[B]", msg.text()));
  pageC.on("console", (msg) => console.log("[C]", msg.text()));

  // A creates, B connects
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrlA = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrlA);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Add some data
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const eateryBeforeLeave = `Before Leave ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryBeforeLeave);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryBeforeLeave }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // A closes
  console.log("A (creator) leaving...");
  await contextA.close();

  // Wait for B to detect A's disconnection and stabilize
  await pageB.waitForTimeout(3000);

  // B generates new share URL
  await pageB.goto(`/wheel/${connectionId}`);
  await pageB.waitForLoadState("networkidle");
  await pageB.waitForTimeout(2000); // Let B's P2P stabilize
  await pageB.getByTestId("share-button").click();
  const shareUrlB = (await pageB.getByTestId("share-url").innerText()).trim();

  // C joins using B's share URL
  console.log("C joining after A left...");
  await pageC.goto(shareUrlB);
  await expect(pageC).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 120_000,
  });

  // C should receive all the data (including data originally from A)
  await pageC.goto(`/settings/${connectionId}`);
  await expect(
    pageC.getByRole("heading", { name: eateryBeforeLeave }).first(),
  ).toBeVisible({ timeout: 30_000 });

  console.log("New peer successfully joined after creator left");

  // B and C should still be able to sync
  const eateryAfterCreatorLeft = `After Creator Left ${Date.now()}`;
  await pageB.goto(`/settings/${connectionId}`);
  await pageB.getByTestId("add-eatery-open").click();
  await pageB.getByTestId("add-eatery-name").fill(eateryAfterCreatorLeft);
  await pageB.getByTestId("add-eatery-submit").click();

  await expect(
    pageC.getByRole("heading", { name: eateryAfterCreatorLeft }).first(),
  ).toBeVisible({ timeout: 30_000 });

  console.log("Sync continues to work after creator left");

  await contextB.close();
  await contextC.close();
});

test("recovery: multiple tabs of same browser stay synced when one closes", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB1 = await contextB.newPage();
  const pageB2 = await contextB.newPage();
  const pageB3 = await contextB.newPage();

  pageA.on("console", (msg) => console.log("[A]", msg.text()));
  pageB1.on("console", (msg) => console.log("[B1]", msg.text()));
  pageB2.on("console", (msg) => console.log("[B2]", msg.text()));
  pageB3.on("console", (msg) => console.log("[B3]", msg.text()));

  // Setup
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  // All B tabs connect
  await pageB1.goto(shareUrl);
  await expect(pageB1).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageB2.goto(`/wheel/${connectionId}`);
  await pageB3.goto(`/wheel/${connectionId}`);

  await pageA.goto(`/settings/${connectionId}`);
  await pageB1.goto(`/settings/${connectionId}`);
  await pageB2.goto(`/settings/${connectionId}`);
  await pageB3.goto(`/settings/${connectionId}`);

  // Add data
  const eatery = `Multi Tab ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery);
  await pageA.getByTestId("add-eatery-submit").click();

  // Verify all B tabs have it
  await expect(
    pageB1.getByRole("heading", { name: eatery }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageB2.getByRole("heading", { name: eatery }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageB3.getByRole("heading", { name: eatery }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Close B1
  console.log("Closing B1...");
  await pageB1.close();

  // Wait for B2 to become leader and re-establish connection to A
  // This is the proper fix - wait for actual P2P connection, not arbitrary timeout
  console.log("Waiting for B2 to reconnect to peer A...");
  await expect(pageB2.getByTestId("peer-count-value")).toHaveText("1", {
    timeout: 30_000,
  });
  console.log("B2 reconnected to A");

  // B2 and B3 should still work
  const newEatery = `After Tab Close ${Date.now()}`;
  await pageB2.getByTestId("add-eatery-open").click();
  await pageB2.getByTestId("add-eatery-name").fill(newEatery);
  await pageB2.getByTestId("add-eatery-submit").click();

  // Wait for dialog to close first
  await expect(pageB2.getByTestId("add-eatery-name")).not.toBeVisible();

  // Now that B2 is connected to A, sync should happen reliably
  await expect(
    pageB3.getByRole("heading", { name: newEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    pageA.getByRole("heading", { name: newEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Remaining tabs continue to sync");

  await contextA.close();
  await contextB.close();
});

test("recovery: peer can rejoin after leaving and still sync", async ({
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

  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  // B connects
  // B connects
  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  await pageA.goto(`/settings/${connectionId}`);
  await pageB.goto(`/settings/${connectionId}`);

  // Add data
  const eatery1 = `First ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery1);
  await pageA.getByTestId("add-eatery-submit").click();

  await expect(
    pageB.getByRole("heading", { name: eatery1 }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // B leaves (close and reopen context)
  console.log("B leaving...");
  await pageB.close();
  await contextB.close();

  // A adds more data while B is gone
  const eatery2 = `While B Gone ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eatery2);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageA.waitForTimeout(2000);

  // B rejoins (new context, simulating a return)
  console.log("B rejoining...");
  const contextB2 = await browser.newContext({ ignoreHTTPSErrors: true });
  const pageB2 = await contextB2.newPage();
  pageB2.on("console", (msg) => console.log("[B2]", msg.text()));

  // Do not inject connection stub; logic requires 'connect-to' to fetch the real data.
  await pageB2.goto(shareUrl);
  await expect(pageB2).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 15_000,
  });

  await pageB2.goto(`/settings/${connectionId}`);

  // B should have all data (including what was added while it was gone)
  await expect(
    pageB2.getByRole("heading", { name: eatery1 }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    pageB2.getByRole("heading", { name: eatery2 }).first(),
  ).toBeVisible({ timeout: 15_000 });

  console.log("Rejoined peer successfully synced all data");

  await contextA.close();
  await contextB2.close();
});
