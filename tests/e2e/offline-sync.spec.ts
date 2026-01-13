import { expect, test } from "@playwright/test";

test("offline-sync: changes made offline sync when peer returns", async ({
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
  await pageA.waitForLoadState("networkidle");
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

  // Add initial data to verify connection
  console.log("Step 1: Adding initial eatery to verify connection");
  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  const initialEatery = `Initial Connected ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(initialEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  // Verify B receives it
  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: initialEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("Step 1: Initial sync verified - connection established");

  // Step 2: A goes offline (simulates user1 losing network)
  console.log("Step 2: Setting peer A offline");
  await contextA.setOffline(true);

  // Step 3: A makes changes while offline (app still open)
  console.log("Step 3: Making changes in A while offline");

  const offlineEatery = `Offline Eatery ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(offlineEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await expect(
    pageA.getByRole("heading", { name: offlineEatery }).first(),
  ).toBeVisible({ timeout: 5_000 });

  const offlineUser = `Offline User ${Date.now()}`;
  await pageA.getByTestId("add-user-open").click();
  await pageA.getByTestId("add-user-name").fill(offlineUser);
  await pageA.getByTestId("add-user-submit").click();

  await expect(
    pageA.getByRole("heading", { name: offlineUser }).first(),
  ).toBeVisible({ timeout: 5_000 });

  console.log("Step 3: Changes made offline (new eatery, new user)");

  // Step 4: Bring A back online
  console.log("Step 4: Bringing peer A back online");
  await contextA.setOffline(false);

  // Step 5: B reloads to trigger reconnection and sync
  console.log("Step 5: B reloads to reconnect and sync");
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  // Step 6: Verify A's offline changes sync to B
  console.log("Step 6: Verifying A's offline changes sync to B");

  await expect(
    pageB.getByRole("heading", { name: offlineEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("✓ Offline eatery synced to B");

  await expect(
    pageB.getByRole("heading", { name: offlineUser }).first(),
  ).toBeVisible({ timeout: 15_000 });
  console.log("✓ Offline user synced to B");

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("offline-sync: multiple offline changes sync correctly", async ({
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

  // Establish connection
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  // B connects via share URL
  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Add initial data
  await pageA.goto(`/settings/${connectionId}`);
  const sharedEatery = `Shared Eatery ${Date.now()}`;
  await pageA.getByTestId("add-eatery-open").click();
  await pageA.getByTestId("add-eatery-name").fill(sharedEatery);
  await pageA.getByTestId("add-eatery-submit").click();

  await pageB.goto(`/settings/${connectionId}`);
  await expect(
    pageB.getByRole("heading", { name: sharedEatery }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // A goes offline
  await contextA.setOffline(true);

  // A makes multiple changes while offline
  const offlineChanges = {
    eateries: [
      `Offline Restaurant ${Date.now()}`,
      `Offline Cafe ${Date.now()}`,
      `Offline Bakery ${Date.now()}`,
    ],
    users: [`User Alpha ${Date.now()}`, `User Beta ${Date.now()}`],
  };

  for (const eatery of offlineChanges.eateries) {
    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill(eatery);
    await pageA.getByTestId("add-eatery-submit").click();
    await expect(
      pageA.getByRole("heading", { name: eatery }).first(),
    ).toBeVisible();
  }

  for (const user of offlineChanges.users) {
    await pageA.getByTestId("add-user-open").click();
    await pageA.getByTestId("add-user-name").fill(user);
    await pageA.getByTestId("add-user-submit").click();
    await expect(
      pageA.getByRole("heading", { name: user }).first(),
    ).toBeVisible();
  }

  console.log("Made multiple offline changes in A");

  // Bring A back online
  await contextA.setOffline(false);

  // B reloads to trigger reconnection and sync
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  // Verify all A's offline changes sync to B
  for (const eatery of offlineChanges.eateries) {
    await expect(
      pageB.getByRole("heading", { name: eatery }).first(),
    ).toBeVisible({ timeout: 15_000 });
    console.log(`✓ ${eatery} synced to B`);
  }

  for (const user of offlineChanges.users) {
    await expect(
      pageB.getByRole("heading", { name: user }).first(),
    ).toBeVisible({ timeout: 15_000 });
    console.log(`✓ ${user} synced to B`);
  }

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});

test("offline-sync: deletion while offline syncs correctly", async ({
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

  // Establish connection and add initial data
  await pageA.goto("/");
  await pageA.waitForLoadState("networkidle");
  await pageA.getByTestId("start-fresh").click();
  await expect(pageA).toHaveURL(/\/wheel\/[0-9a-f-]{36}$/);

  const connectionIdMatch = /\/wheel\/([0-9a-f-]{36})$/.exec(pageA.url());
  const connectionId = connectionIdMatch![1];

  await pageA.goto(`/settings/${connectionId}`);
  await pageA.waitForLoadState("networkidle");

  // Add eateries that will be deleted later
  const eateriesToDelete = [
    `Delete Me ${Date.now()}`,
    `Also Delete ${Date.now() + 1}`,
  ];

  for (const eatery of eateriesToDelete) {
    await pageA.getByTestId("add-eatery-open").click();
    await pageA.getByTestId("add-eatery-name").fill(eatery);
    await pageA.getByTestId("add-eatery-submit").click();
    await expect(
      pageA.getByRole("heading", { name: eatery }).first(),
    ).toBeVisible();
  }

  // Connect B via share URL
  await pageA.goto(`/wheel/${connectionId}`);
  await pageA.getByTestId("share-button").click();
  const shareUrl = (await pageA.getByTestId("share-url").innerText()).trim();

  await pageB.goto(shareUrl);
  await expect(pageB).toHaveURL(new RegExp(`/wheel/${connectionId}$`), {
    timeout: 60_000,
  });

  // Verify B has the eateries
  await pageB.goto(`/settings/${connectionId}`);
  for (const eatery of eateriesToDelete) {
    await expect(
      pageB.getByRole("heading", { name: eatery }).first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  // A goes offline
  await pageA.goto(`/settings/${connectionId}`);
  await contextA.setOffline(true);

  // A deletes eateries while offline
  for (const eatery of eateriesToDelete) {
    const eateryCard = pageA.locator(`[data-eatery-name="${eatery}"]`);
    await eateryCard.getByTestId("delete-eatery").click();

    // Verify local deletion
    await expect(
      pageA.getByRole("heading", { name: eatery }).first(),
    ).not.toBeVisible();
  }

  console.log("A deleted eateries while offline");

  // Bring A back online and reload to re-establish Peer connection
  await contextA.setOffline(false);
  await pageA.reload();
  await pageA.waitForLoadState("networkidle");

  // B reloads to trigger reconnection and sync
  await pageB.reload();
  await pageB.waitForLoadState("networkidle");

  // Verify deletions synced to B
  for (const eatery of eateriesToDelete) {
    await expect(
      pageB.getByRole("heading", { name: eatery }).first(),
    ).not.toBeVisible({ timeout: 15_000 });
    console.log(`✓ Deletion of ${eatery} synced to B`);
  }

  await contextA.close();
  await contextB.close();

  await testInfo.attach("browser-console.txt", {
    body: browserLogs.join("\n"),
    contentType: "text/plain",
  });
});
