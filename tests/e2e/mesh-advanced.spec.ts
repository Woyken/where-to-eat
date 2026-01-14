import { expect, test } from "@playwright/test";
import { selectOrCreateUser } from "./helpers";

test("mesh: four-peer chain topology (A->B->C->D)", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);

  // Create four isolated browser contexts
  const contextA = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextB = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextC = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextD = await browser.newContext({ ignoreHTTPSErrors: true });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();
  const pageD = await contextD.newPage();

  const browserLogs: string[] = [];
  const pages = [
    { label: "A", page: pageA },
    { label: "B", page: pageB },
    { label: "C", page: pageC },
    { label: "D", page: pageD },
  ];

  for (const { label, page } of pages) {
    page.on("console", (msg) => {
      const line = `[${label}] ${msg.text()}`;
      browserLogs.push(line);
      console.log(line);
    });
  }

  // A creates the connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);
  await selectOrCreateUser(pageA, "User A");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  console.log(`Connection ID: ${connectionId}`);

  // B connects to A
  await pageA.getByTestId("share-button").click();
  const shareUrlA = (await pageA.getByTestId("share-url").innerText()).trim();
  console.log("B connecting to A...");

  await pageB.goto(shareUrlA);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");
  console.log("B connected to A");

  // Wait for gossip protocol
  await pageB.waitForTimeout(3000);

  // C connects to B
  await pageB.getByTestId("share-button").click();
  const shareUrlB = (await pageB.getByTestId("share-url").innerText()).trim();
  console.log("C connecting to B...");

  await pageC.goto(shareUrlB);
  await expect(pageC).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageC, "User C");
  console.log("C connected to B");

  // Wait for gossip protocol
  await pageC.waitForTimeout(3000);

  // D connects to C
  await pageC.getByTestId("share-button").click();
  const shareUrlC = (await pageC.getByTestId("share-url").innerText()).trim();
  console.log("D connecting to C...");

  await pageD.goto(shareUrlC);
  await expect(pageD).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageD, "User D");
  console.log("D connected to C");

  // Wait for full mesh to establish via gossip
  console.log("Waiting for mesh to establish...");
  await pageD.waitForTimeout(5000);

  // A adds an eatery
  const eateryFromA = `From A ${Date.now()}`;
  console.log(`A adding eatery: ${eateryFromA}`);

  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(eateryFromA);
  await pageA.getByTestId("add-eatery-submit").click();

  // Verify it propagates through the chain to D
  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryFromA }).first(),
  ).toBeVisible({ timeout: 20_000 });
  console.log("B received eatery from A");

  await pageC.goto(`/settings/${connectionId}`);
  await expect(
    pageC.getByRole("heading", { name: eateryFromA }).first(),
  ).toBeVisible({ timeout: 20_000 });
  console.log("C received eatery from A");

  await pageD.goto(`/settings/${connectionId}`);
  await expect(
    pageD.getByRole("heading", { name: eateryFromA }).first(),
  ).toBeVisible({ timeout: 20_000 });
  console.log("D received eatery from A");

  // D adds an eatery
  const eateryFromD = `From D ${Date.now()}`;
  console.log(`D adding eatery: ${eateryFromD}`);

  await pageD.getByTestId("add-eatery-open").click();
  await pageD.getByTestId("add-eatery-name").fill(eateryFromD);
  await pageD.getByTestId("add-eatery-submit").click();

  // Verify it propagates back to A
  await expect(
    pageC.getByRole("heading", { name: eateryFromD }).first(),
  ).toBeVisible({ timeout: 20_000 });
  console.log("C received eatery from D");

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: eateryFromD }).first(),
  ).toBeVisible({ timeout: 20_000 });
  console.log("B received eatery from D");

  await pageA.goto(`/settings/${connectionId}`);
  await expect(
    pageA.getByRole("heading", { name: eateryFromD }).first(),
  ).toBeVisible({ timeout: 20_000 });
  console.log("A received eatery from D");

  await contextA.close();
  await contextB.close();
  await contextC.close();
  await contextD.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("mesh: changes propagate after intermediate peer in chain closes", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  // Create contexts for A, B, C
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

  // Setup: A creates, B connects to A, C connects to B
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);
  await selectOrCreateUser(pageA, "User A");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  // B -> A
  await pageA.getByTestId("share-button").click();
  const shareUrlA = (await pageA.getByTestId("share-url").innerText()).trim();
  await pageB.goto(shareUrlA);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageB, "User B");
  console.log("B connected to A");

  await pageB.waitForTimeout(3000);

  // C -> B
  await pageB.getByTestId("share-button").click();
  const shareUrlB = (await pageB.getByTestId("share-url").innerText()).trim();
  await pageC.goto(shareUrlB);
  await expect(pageC).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageC, "User C");
  console.log("C connected to B");

  // Wait for mesh to form
  await pageC.waitForTimeout(5000);

  // Add initial eatery from A to verify initial sync
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const initialEatery = `Initial ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(initialEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageC.goto(`/settings/${connectionId}`);
  await expect(
    pageC.getByRole("heading", { name: initialEatery }).first(),
  ).toBeVisible({ timeout: 20_000 });
  console.log("Initial sync verified");

  // Close B (the middle node)
  console.log("Closing B...");
  await pageB.close();
  await contextB.close();

  // Wait for mesh to reconfigure
  await pageA.waitForTimeout(3000);

  // A adds another eatery
  const afterCloseEatery = `After B Closed ${Date.now()}`;
  console.log(`A adding eatery after B closed: ${afterCloseEatery}`);

  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(afterCloseEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  // If A and C established a direct connection via gossip, C should receive it
  // Otherwise this test will timeout, revealing the need for better mesh recovery
  await expect(
    pageC.getByRole("heading", { name: afterCloseEatery }).first(),
  ).toBeVisible({ timeout: 30_000 });
  console.log("C received eatery from A after B closed");

  await contextA.close();
  await contextC.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("mesh: star topology - one hub connected to multiple clients", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  // Hub and 3 clients
  const contextHub = await browser.newContext({ ignoreHTTPSErrors: true });
  const contextClient1 = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const contextClient2 = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const contextClient3 = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  const pageHub = await contextHub.newPage();
  const pageClient1 = await contextClient1.newPage();
  const pageClient2 = await contextClient2.newPage();
  const pageClient3 = await contextClient3.newPage();

  pageHub.on("console", (msg) => console.log("[Hub]", msg.text()));
  pageClient1.on("console", (msg) => console.log("[C1]", msg.text()));
  pageClient2.on("console", (msg) => console.log("[C2]", msg.text()));
  pageClient3.on("console", (msg) => console.log("[C3]", msg.text()));

  // Hub creates connection
  await pageHub.goto("/");
  await pageHub.waitForLoadState("networkidle");
  await pageHub.getByTestId("start-fresh").click();
  await expect(pageHub).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);
  await selectOrCreateUser(pageHub, "Hub User");

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageHub.url());
  const connectionId = connectionIdMatch![1];

  await pageHub.getByTestId("share-button").click();
  const shareUrl = (await pageHub.getByTestId("share-url").innerText()).trim();

  // All clients connect to hub
  await pageClient1.goto(shareUrl);
  await expect(pageClient1).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageClient1, "Client 1");
  console.log("Client 1 connected");

  await pageClient2.goto(shareUrl);
  await expect(pageClient2).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageClient2, "Client 2");
  console.log("Client 2 connected");

  await pageClient3.goto(shareUrl);
  await expect(pageClient3).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });
  await selectOrCreateUser(pageClient3, "Client 3");
  console.log("Client 3 connected");

  // Wait for gossip to connect clients to each other
  await pageClient1.waitForTimeout(5000);

  // Client 1 adds an eatery
  await pageClient1.goto(`/settings/${connectionId}`);
  await pageClient1.waitForLoadState("networkidle");

  const eateryFromClient1 = `From Client 1 ${Date.now()}`;
  await pageClient1.getByTestId("add-eatery-open").click();
  await pageClient1.getByTestId("add-eatery-name").fill(eateryFromClient1);
  await pageClient1.getByTestId("add-eatery-submit").click();

  // Should propagate to hub
  await pageHub.goto(`/settings/${connectionId}`);
  await expect(
    pageHub.getByRole("heading", { name: eateryFromClient1 }).first(),
  ).toBeVisible({ timeout: 20_000 });

  // And to other clients
  await pageClient2.goto(`/settings/${connectionId}`);
  await expect(
    pageClient2.getByRole("heading", { name: eateryFromClient1 }).first(),
  ).toBeVisible({ timeout: 20_000 });

  await pageClient3.goto(`/settings/${connectionId}`);
  await expect(
    pageClient3.getByRole("heading", { name: eateryFromClient1 }).first(),
  ).toBeVisible({ timeout: 20_000 });

  console.log("Star topology verified");

  await contextHub.close();
  await contextClient1.close();
  await contextClient2.close();
  await contextClient3.close();
});
